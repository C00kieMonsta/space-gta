import {
  createServer,
  request,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { TokenBuckets } from "./throttle.js";
import { RoomError, Rooms, type Peer, type Room } from "./rooms.js";

export type ServerOptions = {
  /** Handle game files or host routes that are outside the room protocol. */
  serve?: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  /** Enable only when a trusted reverse proxy supplies X-Forwarded-For. */
  trustProxy?: boolean;
};

/** One process owns each room. The host supplies authorization and persistence. */
export function createMultiplayerServer(
  rooms: Rooms,
  origins: string[],
  apiPort?: number,
  options: ServerOptions = {}
) {
  const allowed = new Set(origins),
    buckets = new TokenBuckets(30, 30 / 60_000),
    connections = new Map<string, number>();
  let stopping = false,
    maintaining = false;
  const server = createServer(async (req, res) => {
    try {
      if (req.url === "/health") {
        res.writeHead(stopping ? 503 : 200, {
          "Content-Type": "application/json"
        });
        res.end(
          JSON.stringify({
            ok: !stopping,
            service: "multiplayer",
            rooms: rooms.rooms.size
          })
        );
        return;
      }
      const route = /^\/play\/([A-Z2-9]{8})\/multiplayer\/join$/.exec(
        req.url || ""
      );
      if (!route) {
        if (options.serve) {
          await options.serve(req, res);
          return;
        }
        // A local game can use port 8002 as its origin without a local reverse proxy.
        if (apiPort && /^\/play(?:\/|\?|$)/.test(req.url || "")) {
          const proxy = request(
            {
              hostname: "127.0.0.1",
              port: apiPort,
              path: req.url,
              method: req.method,
              headers: req.headers
            },
            (up) => {
              res.writeHead(up.statusCode || 502, up.headers);
              up.pipe(res);
            }
          );
          proxy.on("error", () => {
            if (!res.headersSent) res.writeHead(502);
            res.end();
          });
          req.pipe(proxy);
          return;
        }
        res.writeHead(404);
        res.end();
        return;
      }
      if (stopping) throw new RoomError(503, "Game server restarting.");
      if (allowed.has(req.headers.origin || "")) {
        res.setHeader("Access-Control-Allow-Origin", req.headers.origin!);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }
      }
      if (req.method !== "POST")
        throw new RoomError(405, "Use POST to join a room.");
      if (!allowed.has(req.headers.origin || ""))
        throw new RoomError(403, "This game origin is unavailable.");
      if (!buckets.take(address(req, options.trustProxy)))
        throw new RoomError(
          429,
          "Too many joins. Wait a minute and try again."
        );
      const result = await rooms.join(route[1], await readJson(req));
      json(res, 200, result);
    } catch (error) {
      json(res, error instanceof RoomError ? error.status : 503, {
        message:
          error instanceof RoomError
            ? error.message
            : "The game could not be saved. Try again shortly."
      });
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2048,
    perMessageDeflate: false
  });
  server.on("upgrade", (req, socket, head) => {
    const route = /^\/play\/([A-Z2-9]{8})\/multiplayer$/.exec(req.url || ""),
      ip = address(req, options.trustProxy);
    if (
      stopping ||
      !route ||
      !allowed.has(req.headers.origin || "") ||
      (connections.get(ip) || 0) >= 8 ||
      wss.clients.size >= 128 ||
      !buckets.take(ip)
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    connections.set(ip, (connections.get(ip) || 0) + 1);
    wss.handleUpgrade(req, socket, head, (ws) => {
      let identity: { room: Room; playerId: string } | undefined,
        authenticating = false,
        alive = true;
      const limits = new TokenBuckets(60, 60 / 1000),
        actions = new TokenBuckets(8, 8 / 1000);
      const peer: Peer = {
        send(value) {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (ws.bufferedAmount > 1024 * 1024) {
            ws.close(4008, "Connection too slow.");
            return;
          }
          if (
            ws.bufferedAmount > 256 * 1024 &&
            value &&
            typeof value === "object" &&
            "type" in value &&
            value.type === "snapshot"
          )
            return;
          ws.send(JSON.stringify(value));
        },
        close(code, reason) {
          ws.close(code, reason);
        }
      };
      const authTimer = setTimeout(() => {
        if (!identity) ws.close(4000, "Authentication timed out.");
      }, 5000);
      const heartbeat = setInterval(() => {
        if (!alive) {
          ws.terminate();
          return;
        }
        alive = false;
        ws.ping();
      }, 20_000);
      ws.on("pong", () => {
        alive = true;
      });
      ws.on("error", () => {});
      ws.on("close", () => {
        clearTimeout(authTimer);
        clearInterval(heartbeat);
        connections.set(ip, Math.max(0, (connections.get(ip) || 1) - 1));
        if (!connections.get(ip)) connections.delete(ip);
        if (identity) identity.room.detach(identity.playerId, peer);
      });
      ws.on("message", async (data) => {
        let actionId: number | undefined;
        try {
          if (!limits.take("messages"))
            throw new RoomError(429, "Too many game messages.");
          const raw: unknown = JSON.parse(data.toString());
          if (
            raw &&
            typeof raw === "object" &&
            "type" in raw &&
            raw.type === "action" &&
            "id" in raw &&
            typeof raw.id === "number"
          )
            actionId = raw.id;
          if (!identity) {
            if (
              authenticating ||
              !raw ||
              typeof raw !== "object" ||
              !("type" in raw) ||
              raw.type !== "auth" ||
              !("ticket" in raw) ||
              typeof raw.ticket !== "string" ||
              !/^[a-f0-9]{64}$/.test(raw.ticket)
            )
              throw new RoomError(401, "A connection ticket is required.");
            authenticating = true;
            identity = await rooms.authenticate(route[1], raw.ticket, peer);
            clearTimeout(authTimer);
            if (ws.readyState !== WebSocket.OPEN)
              identity.room.detach(identity.playerId, peer);
            return;
          }
          if (
            raw &&
            typeof raw === "object" &&
            "type" in raw &&
            raw.type === "action" &&
            !actions.take("actions")
          )
            throw new RoomError(429, "Too many actions.");
          await identity.room.message(identity.playerId, raw, peer);
        } catch (error) {
          peer.send({
            type: "error",
            ...(actionId === undefined ? {} : { id: actionId }),
            message:
              error instanceof RoomError
                ? error.message
                : "This action could not be saved. Try again shortly."
          });
          if (
            error instanceof RoomError &&
            (error.status === 400 ||
              error.status === 401 ||
              error.status === 429)
          )
            ws.close(4000, error.message);
        }
      });
    });
  });
  const loop = setInterval(() => {
    for (const room of rooms.rooms.values()) {
      const events = room.tick();
      if (room.peers.size)
        room.broadcast({ type: "snapshot", world: room.snapshot(), events });
    }
  }, 50);
  const maintenance = setInterval(() => {
    if (maintaining) return;
    maintaining = true;
    rooms
      .maintain()
      .catch(() => {})
      .finally(() => {
        maintaining = false;
      });
  }, 5000);
  return {
    server,
    async close() {
      stopping = true;
      clearInterval(loop);
      clearInterval(maintenance);
      await rooms.close();
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}
function address(req: IncomingMessage, trustProxy = false): string {
  return (
    (trustProxy && req.headers["x-forwarded-for"]?.toString().split(",")[0]) ||
    req.socket.remoteAddress ||
    "unknown"
  ).trim();
}
function json(res: ServerResponse, status: number, value: unknown) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(value));
}
async function readJson(req: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 2048)
      throw new RoomError(413, "Join request too large.");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new RoomError(400, "Invalid join request.");
  }
}
