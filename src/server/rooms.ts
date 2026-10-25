import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  applyAction,
  createPlayer,
  createWorld,
  idleInput,
  PROTOCOL,
  stepWorld,
  type GameEvent,
  type Input,
  type World
} from "../simulation.js";

const finite = z.number().finite();
export const JoinSchema = z
  .object({
    protocol: z.literal(PROTOCOL),
    name: z.string().trim().min(1).max(40),
    room: z
      .string()
      .regex(/^[A-Z2-9]{8}$/)
      .optional(),
    resume: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional()
  })
  .strict();
export const MessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping"), clientTime: finite.min(0) }).strict(),
  z
    .object({
      type: z.literal("input"),
      seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      forward: finite.min(-1).max(1),
      right: finite.min(-1).max(1),
      yaw: finite.min(-1e6).max(1e6),
      pitch: finite.min(-1.5).max(1.5),
      run: z.boolean(),
      jump: z.boolean(),
      fire: z.boolean(),
      aimAssist: z.boolean().optional(),
      weapon: z.enum(["hands", "pistol", "rifle", "lance"])
    })
    .strict(),
  z
    .object({
      type: z.literal("action"),
      id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      action: z.discriminatedUnion("type", [
        z
          .object({
            type: z.literal("collect"),
            uid: z.number().int().positive()
          })
          .strict(),
        z
          .object({
            type: z.literal("build"),
            module: z.enum([
              "flag",
              "solar",
              "hab",
              "green",
              "oxy",
              "ice",
              "mine",
              "dish"
            ]),
            x: finite.min(-1100).max(1100),
            z: finite.min(-1100).max(1100),
            rot: finite.min(-1e6).max(1e6)
          })
          .strict(),
        z
          .object({
            type: z.literal("recycle"),
            uid: z.number().int().positive()
          })
          .strict(),
        z
          .object({
            type: z.literal("craft"),
            weapon: z.enum(["pistol", "rifle", "lance"])
          })
          .strict()
      ])
    })
    .strict()
]);
export type RoomRecord = {
  world: World;
  credentials: Record<string, string>;
  actions: Record<string, number>;
};
export interface RoomStore {
  load(owner: string, code: string, room: string): Promise<RoomRecord | null>;
  save(
    owner: string,
    code: string,
    room: string,
    record: RoomRecord,
    create?: boolean
  ): Promise<void>;
}
export type Peer = {
  send(value: unknown): void;
  close(code: number, reason: string): void;
};
export class RoomError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const randomId = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
    bytes = randomBytes(8);
  return [...bytes].map((b) => alphabet[b % 32]).join("");
};

/** Prepare only the action's changes. Physics and production can advance during the write. */
function actionCommit(world: World, next: World, id: string): () => void {
  const resources = Object.entries(next.colony.res).map(
      ([key, value]) => [key, value - world.colony.res[key]] as const
    ),
    shards = next.players[id].shards - world.players[id].shards,
    weapons = next.players[id].weapons.filter(
      (w) => !world.players[id].weapons.includes(w)
    ),
    added = next.colony.mods.filter(
      (b) => !world.colony.mods.some((old) => old.uid === b.uid)
    ),
    removed = new Set(
      world.colony.mods
        .filter((b) => !next.colony.mods.some((n) => n.uid === b.uid))
        .map((b) => b.uid)
    ),
    nodes = next.nodes.filter((n, i) => n.readyAt !== world.nodes[i].readyAt);
  // Reserve IDs before the write so a raid or loot drop cannot reuse a building's ID.
  world.next = Math.max(world.next, next.next);
  return () => {
    for (const [key, delta] of resources)
      world.colony.res[key] = Math.max(0, world.colony.res[key] + delta);
    world.players[id].shards += shards;
    world.players[id].weapons.push(...weapons);
    world.colony.mods = world.colony.mods
      .filter((b) => !removed.has(b.uid))
      .concat(added);
    Object.assign(world.colony.done, next.colony.done);
    for (const node of nodes)
      world.nodes.find((n) => n.uid === node.uid)!.readyAt = node.readyAt;
    world.revision++;
  };
}

export class Room {
  readonly peers = new Map<string, Peer>();
  readonly inputs = new Map<string, Input>();
  private queued = new Map<string, Input[]>();
  private credits = new Map<string, number>();
  private chain: Promise<unknown> = Promise.resolve();
  private paused = false;
  private lastInput = new Map<string, number>();
  lastUsed = Date.now();
  constructor(
    readonly owner: string,
    readonly code: string,
    readonly id: string,
    public record: RoomRecord,
    private store: RoomStore
  ) {
    for (const p of Object.values(record.world.players)) p.online = false;
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.chain.then(fn);
    this.chain = task.catch(() => {});
    return task;
  }
  async join(
    name: string,
    resume?: string
  ): Promise<{ playerId: string; resume: string }> {
    return this.serial(async () => {
      const next = structuredClone(this.record);
      let id = resume
        ? Object.keys(next.credentials).find(
            (id) => next.credentials[id] === hash(resume)
          )
        : undefined;
      if (resume && !id)
        throw new RoomError(
          401,
          "This crew identity is no longer available. Join as a new player."
        );
      if (!id && Object.keys(next.world.players).length >= 4)
        throw new RoomError(
          409,
          "This room has four crew members. Create another room."
        );
      const token = resume || randomBytes(32).toString("hex");
      if (!id) {
        id = randomBytes(12).toString("hex");
        next.world.players[id] = createPlayer(
          id,
          name,
          Object.keys(next.world.players).length
        );
        next.credentials[id] = hash(token);
        next.actions[id] = 0;
      }
      next.world.players[id].name = name;
      await this.store.save(this.owner, this.code, this.id, next);
      if (!this.record.world.players[id]) {
        this.record.world.players[id] = next.world.players[id];
        this.record.world.players[id].online = false;
        this.record.credentials[id] = next.credentials[id];
        this.record.actions[id] = next.actions[id];
      }
      this.record.world.players[id].name = name;
      this.lastUsed = Date.now();
      return { playerId: id, resume: token };
    });
  }
  attach(id: string, peer: Peer): void {
    const old = this.peers.get(id);
    if (old) old.close(4001, "Opened on another tab.");
    this.peers.set(id, peer);
    this.record.world.players[id].online = true;
    const player = this.record.world.players[id];
    this.inputs.set(id, {
      ...idleInput(),
      seq: player.seq,
      yaw: player.yaw,
      pitch: player.pitch
    });
    this.queued.set(id, []);
    this.credits.set(id, 0);
    this.lastInput.set(id, Date.now());
    this.lastUsed = Date.now();
    peer.send({
      type: "welcome",
      protocol: PROTOCOL,
      room: this.id,
      playerId: id,
      actionId: this.record.actions[id] || 0,
      world: this.snapshot()
    });
  }
  detach(id: string, peer: Peer): void {
    if (this.peers.get(id) !== peer) return;
    this.peers.delete(id);
    this.inputs.delete(id);
    this.queued.delete(id);
    this.credits.delete(id);
    this.lastInput.delete(id);
    this.record.world.players[id].online = false;
    this.lastUsed = Date.now();
  }
  async message(
    id: string,
    raw: unknown,
    peer = this.peers.get(id)
  ): Promise<void> {
    const parsed = MessageSchema.safeParse(raw);
    if (!parsed.success) throw new RoomError(400, "Invalid game message.");
    const m = parsed.data,
      p = this.record.world.players[id];
    if (!p || !peer || this.peers.get(id) !== peer) return;
    if (m.type === "ping") {
      peer.send({ type: "pong", clientTime: m.clientTime });
      return;
    }
    if (m.type === "input") {
      if (m.seq <= (this.inputs.get(id)?.seq || 0)) return;
      const queued = this.queued.get(id)!;
      if (queued.length >= 20) {
        peer.close(4008, "Movement fell behind. Reconnecting to the room.");
        return;
      }
      queued.push(m);
      this.inputs.set(id, m);
      this.lastInput.set(id, Date.now());
      return;
    }
    await this.serial(async () => {
      if (this.peers.get(id) !== peer) return;
      if (m.id <= (this.record.actions[id] || 0)) {
        this.peers.get(id)?.send({ type: "ack", id: m.id });
        return;
      }
      const next = structuredClone(this.record),
        error = applyAction(next.world, next.world.players[id], m.action);
      if (error) {
        this.peers.get(id)?.send({ type: "error", id: m.id, message: error });
        return;
      }
      next.actions[id] = m.id;
      const commit = actionCommit(this.record.world, next.world, id);
      // Do not acknowledge a building, spend, or pickup until it survives a restart.
      await this.store.save(this.owner, this.code, this.id, next);
      commit();
      this.record.actions[id] = m.id;
      this.paused = false;
      this.peers.get(id)?.send({ type: "ack", id: m.id });
      this.broadcast({ type: "snapshot", world: this.snapshot(), events: [] });
    });
  }
  tick(now = Date.now()): GameEvent[] {
    if (this.paused || !this.peers.size) return [];
    this.lastUsed = now;
    const inputs = new Map<string, Input[]>();
    for (const [id, queued] of this.queued) {
      const credit = Math.min(10, (this.credits.get(id) || 0) + 1),
        frames = queued.splice(0, Math.min(3, credit));
      this.credits.set(id, credit - frames.length);
      // Each sequence represents exactly one shared physics step. Brief packet gaps
      // leave credit for a bounded catch-up instead of repeating or dropping input.
      if (!frames.length && now - (this.lastInput.get(id) || 0) > 500) {
        const p = this.record.world.players[id];
        frames.push({ ...idleInput(), seq: p.seq, yaw: p.yaw, pitch: p.pitch });
      }
      inputs.set(id, frames);
    }
    return stepWorld(this.record.world, inputs);
  }
  snapshot(): World & { paused: boolean } {
    // Credentials never enter the wire format. Disconnected crew remain in the save.
    const w = this.record.world;
    return {
      ...w,
      paused: this.paused,
      players: Object.fromEntries(
        Object.entries(w.players).filter(([, p]) => p.online)
      )
    };
  }
  broadcast(value: unknown): void {
    for (const p of this.peers.values()) p.send(value);
  }
  async checkpoint(): Promise<void> {
    return this.serial(async () => {
      try {
        await this.store.save(
          this.owner,
          this.code,
          this.id,
          structuredClone(this.record)
        );
        this.paused = false;
        this.broadcast({
          type: "snapshot",
          world: this.snapshot(),
          events: []
        });
      } catch (error) {
        this.paused = true;
        this.broadcast({
          type: "snapshot",
          world: this.snapshot(),
          events: []
        });
        this.broadcast({
          type: "error",
          message:
            "World saving is unavailable. The room is paused while saving retries."
        });
        throw error;
      }
    });
  }
}

export class Rooms {
  readonly rooms = new Map<string, Room>();
  private loading = new Map<string, Promise<Room>>();
  private creating = 0;
  private tickets = new Map<
    string,
    { room: Room; playerId: string; expires: number }
  >();
  constructor(
    private store: RoomStore,
    private authorize: (code: string) => Promise<string | null>
  ) {}
  async join(
    code: string,
    raw: unknown
  ): Promise<{
    protocol: number;
    room: string;
    playerId: string;
    resume: string;
    ticket: string;
  }> {
    const data = JoinSchema.safeParse(raw);
    if (!data.success)
      throw new RoomError(
        400,
        "Use a name and an eight-character room code. Refresh the game if its version is old."
      );
    const owner = await this.authorize(code);
    if (!owner)
      throw new RoomError(404, "This game invitation is unavailable.");
    let id = data.data.room;
    if (!id) {
      if (this.rooms.size + this.loading.size + this.creating >= 32)
        throw new RoomError(503, "All game rooms are busy. Try again later.");
      id = randomId();
      const record = { world: createWorld(), credentials: {}, actions: {} };
      this.creating++;
      try {
        await this.store.save(owner, code, id, record, true);
        this.rooms.set(
          code + "/" + id,
          new Room(owner, code, id, record, this.store)
        );
      } finally {
        this.creating--;
      }
    }
    const room = await this.load(owner, code, id),
      identity = await room.join(data.data.name, data.data.resume);
    this.cleanTickets();
    if (this.tickets.size >= 256)
      throw new RoomError(
        503,
        "Too many pending connections. Try again shortly."
      );
    const ticket = randomBytes(32).toString("hex");
    this.tickets.set(ticket, {
      room,
      playerId: identity.playerId,
      expires: Date.now() + 30_000
    });
    return { protocol: PROTOCOL, room: id, ...identity, ticket };
  }
  private async load(owner: string, code: string, id: string): Promise<Room> {
    const key = code + "/" + id,
      existing = this.rooms.get(key);
    if (existing) return existing;
    let pending = this.loading.get(key);
    if (!pending) {
      pending = (async () => {
        if (this.rooms.size + this.loading.size + this.creating >= 32)
          throw new RoomError(503, "All game rooms are busy.");
        const record = await this.store.load(owner, code, id);
        if (!record || record.world.v !== 1)
          throw new RoomError(
            404,
            "No room with that code on this invitation."
          );
        const room = new Room(owner, code, id, record, this.store);
        this.rooms.set(key, room);
        return room;
      })();
      this.loading.set(key, pending);
    }
    try {
      return await pending;
    } finally {
      this.loading.delete(key);
    }
  }
  async authenticate(
    code: string,
    ticket: string,
    peer: Peer
  ): Promise<{ room: Room; playerId: string }> {
    const hit = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!hit || hit.expires < Date.now() || hit.room.code !== code)
      throw new RoomError(
        401,
        "Connection ticket expired. Reconnect to the room."
      );
    if ((await this.authorize(code)) !== hit.room.owner)
      throw new RoomError(403, "This invitation was switched off.");
    hit.room.attach(hit.playerId, peer);
    return { room: hit.room, playerId: hit.playerId };
  }
  private cleanTickets() {
    for (const [token, t] of this.tickets)
      if (t.expires < Date.now()) this.tickets.delete(token);
  }
  async maintain(): Promise<void> {
    this.cleanTickets();
    await Promise.allSettled(
      [...this.rooms].map(async ([key, room]) => {
        await room.checkpoint();
        if ((await this.authorize(room.code)) !== room.owner) {
          for (const p of room.peers.values())
            p.close(4003, "This invitation was switched off.");
        }
        if (!room.peers.size && Date.now() - room.lastUsed > 60_000)
          this.rooms.delete(key);
      })
    );
  }
  async close(): Promise<void> {
    for (const room of this.rooms.values())
      for (const p of room.peers.values())
        p.close(1012, "Server restarting. Reconnecting shortly.");
    await Promise.all([...this.rooms.values()].map((r) => r.checkpoint()));
  }
}
