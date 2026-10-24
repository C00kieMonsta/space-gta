import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { Rooms, type RoomStore } from "./rooms.js";
import { createMultiplayerServer } from "./server.js";

export const LOCAL_ACCESS_CODE = "SPACEGTA";
const types: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2"
};

export function createStandaloneServer(options: {
  store: RoomStore;
  origins: string[];
  assetsDirectory?: string;
}) {
  const assets = resolve(options.assetsDirectory || "dist/game");
  const rooms = new Rooms(options.store, async (code) =>
    code === LOCAL_ACCESS_CODE ? "local" : null
  );
  const service = createMultiplayerServer(rooms, options.origins, undefined, {
    async serve(req, res) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" });
        res.end();
        return;
      }
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      if (pathname === "/") {
        res.writeHead(302, { Location: "/play/" + LOCAL_ACCESS_CODE });
        res.end();
        return;
      }
      if (pathname === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }
      const asset =
        /^\/play\/assets\/karman-line\/([a-z0-9][a-z0-9.-]*\.[a-f0-9]{8}\.(?:js|css|woff2))$/.exec(
          pathname
        );
      const shell = pathname === "/play/" + LOCAL_ACCESS_CODE;
      if ((!shell && !asset) || asset?.[1].includes("..")) {
        res.writeHead(404);
        res.end();
        return;
      }
      const path = shell
        ? join(assets, "shells/karman-line.html")
        : join(assets, "assets/karman-line", asset![1]);
      try {
        const body = await readFile(path);
        res.writeHead(200, {
          "Content-Type": shell
            ? "text/html; charset=utf-8"
            : types[extname(path)],
          "Cache-Control": shell
            ? "no-store"
            : "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "same-origin"
        });
        res.end(req.method === "HEAD" ? undefined : body);
      } catch (error) {
        res.writeHead(
          (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500
        );
        res.end();
      }
    }
  });
  return { ...service, rooms };
}
