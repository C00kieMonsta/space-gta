import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  MessageSchema,
  Rooms,
  type Peer,
  type RoomRecord,
  type RoomStore
} from "../src/server/rooms.js";
import { createMultiplayerServer } from "../src/server/server.js";
import {
  applyAction,
  createPlayer,
  createWorld,
  ground,
  idleInput,
  movePlayer,
  placementError,
  PROTOCOL,
  SPRINT_MULTIPLIER,
  STEP,
  stepWorld,
  WALK_SPEED
} from "../src/simulation.js";

class MemoryStore implements RoomStore {
  rows = new Map<string, RoomRecord>();
  fail = false;
  async load(owner: string, code: string, room: string) {
    return structuredClone(this.rows.get(`${owner}/${code}/${room}`) || null);
  }
  async save(owner: string, code: string, room: string, record: RoomRecord) {
    if (this.fail) throw new Error("Offline");
    this.rows.set(`${owner}/${code}/${room}`, structuredClone(record));
  }
}
function setup() {
  const store = new MemoryStore(),
    rooms = new Rooms(store, async (code) =>
      code === "ABCDEFGH" ? "owner" : null
    );
  return { store, rooms };
}
function peer() {
  const messages: unknown[] = [];
  const p: Peer = { send: (m) => messages.push(m), close: () => {} };
  return { p, messages };
}
const join = (rooms: Rooms, room?: string, resume?: string, name = "Ada") =>
  rooms.join("ABCDEFGH", {
    protocol: PROTOCOL,
    name,
    ...(room ? { room } : {}),
    ...(resume ? { resume } : {})
  });

describe("shared simulation", () => {
  it("uses the same physical terrain and deposits in every room", () => {
    expect(createWorld().nodes).toEqual(createWorld().nodes);
    expect(ground(0, 0)).toBe(0);
    expect(Number.isFinite(ground(-450, 820))).toBe(true);
  });
  it("resolves simultaneous deposit collection once and checks distance", () => {
    const w = createWorld(),
      p = createPlayer("p", "Ada", 0),
      n = w.nodes[0];
    expect(applyAction(w, p, { type: "collect", uid: n.uid })).toMatch(/far/);
    p.x = n.x;
    p.z = n.z;
    const before = w.colony.res.mat;
    expect(applyAction(w, p, { type: "collect", uid: n.uid })).toBeNull();
    expect(applyAction(w, p, { type: "collect", uid: n.uid })).toMatch(
      /unavailable/
    );
    expect(w.colony.res.mat).toBe(before + 25);
  });
  it("serializes shared spending and rejects overlapping or distant buildings", () => {
    const w = createWorld(),
      p = createPlayer("p", "Ada", 0);
    p.x = 15;
    p.z = 15;
    w.players.p = p;
    w.colony.res.mat = 30;
    expect(
      applyAction(w, p, { type: "build", module: "solar", x: 15, z: 0, rot: 0 })
    ).toBeNull();
    expect(w.colony.res.mat).toBe(0);
    expect(
      applyAction(w, p, {
        type: "build",
        module: "solar",
        x: -10,
        z: 0,
        rot: 0
      })
    ).toMatch(/resources/);
    expect(
      applyAction(w, p, { type: "build", module: "flag", x: 15, z: 0, rot: 0 })
    ).toMatch(/structure/);
    expect(
      applyAction(w, p, {
        type: "build",
        module: "flag",
        x: 400,
        z: 400,
        rot: 0
      })
    ).toMatch(/closer/);
  });
  it("bounds movement and shares the prediction step with the server", () => {
    const a = createWorld(),
      p = createPlayer("p", "Ada", 0);
    a.players.p = p;
    const predicted = structuredClone(p),
      input = { ...idleInput(), seq: 1, forward: 1, right: 1, run: true };
    for (let i = 0; i < 20; i++) {
      movePlayer(a, predicted, input, STEP);
      stepWorld(a, new Map([["p", input]]));
    }
    expect(p.x).toBeCloseTo(predicted.x, 8);
    expect(p.z).toBeCloseTo(predicted.z, 8);
    expect(Math.hypot(p.x + 3, p.z - 9)).toBeLessThan(
      WALK_SPEED * SPRINT_MULTIPLIER
    );
    expect(Math.hypot(p.vx, p.vz)).toBeCloseTo(
      WALK_SPEED * SPRINT_MULTIPLIER,
      3
    );
  });
  it("accelerates to walking speed and stops without diagonal speed boosts", () => {
    const w = createWorld(),
      p = createPlayer("p", "Ada", 0),
      input = { ...idleInput(), forward: -1, right: 1 };
    for (let i = 0; i < 20; i++) movePlayer(w, p, input, STEP);
    expect(Math.hypot(p.vx, p.vz)).toBeCloseTo(WALK_SPEED, 3);
    for (let i = 0; i < 8; i++) movePlayer(w, p, idleInput(), STEP);
    expect(Math.hypot(p.vx, p.vz)).toBeLessThan(0.03);
  });
  it("blocks building on active crew and releases the space when they disconnect", () => {
    const w = createWorld(),
      p = createPlayer("p", "Ada", 0),
      other = createPlayer("other", "Grace", 1);
    w.players = { p, other };
    let position: { x: number; z: number } | undefined;
    for (let x = -25; x <= 25 && !position; x += 2)
      for (let z = -15; z <= 30 && !position; z += 2)
        if (!placementError(w, p, "solar", x, z)) position = { x, z };
    expect(position).toBeDefined();
    const at = position!;
    other.x = at.x;
    other.z = at.z;
    const action = { type: "build" as const, module: "solar", ...at, rot: 0 };
    expect(placementError(w, p, "solar", at.x, at.z)).toMatch(/astronaut/);
    expect(applyAction(w, p, action)).toBe(
      placementError(w, p, "solar", at.x, at.z)
    );
    other.online = false;
    expect(placementError(w, p, "solar", at.x, at.z)).toBeNull();
    expect(applyAction(w, p, action)).toBeNull();
  });
  it("pauses the clock while the room is empty", () => {
    const w = createWorld();
    stepWorld(w, new Map());
    expect(w.time).toBe(0);
  });
  it("runs one raid for the room and assigns enemies to active astronauts", () => {
    const w = createWorld(),
      p = createPlayer("p", "Ada", 0);
    p.x = 30;
    p.z = 0;
    p.y = ground(p.x, p.z);
    w.players.p = p;
    w.raid.next = 0;
    expect(stepWorld(w, new Map()).some((e) => e.type === "notice")).toBe(true);
    w.raid.t = 12;
    stepWorld(w, new Map());
    expect(w.raid.state).toBe("active");
    expect(w.aliens.length).toBe(5);
    expect(w.aliens.every((a) => a.target === "p")).toBe(true);
  });
  it("checks weapon ownership, fire rates, and rewards a kill once", () => {
    const w = createWorld(),
      p = createPlayer("p", "Ada", 0);
    p.x = 0;
    p.z = 20;
    p.y = ground(0, 20);
    w.players.p = p;
    w.aliens = [
      {
        uid: 55,
        type: "drone",
        x: 0,
        y: ground(0, 10) + 7,
        z: 10,
        hp: 18,
        r: 1,
        cool: 10,
        target: null
      }
    ];
    const input = {
      ...idleInput(),
      seq: 1,
      fire: true,
      pitch: Math.atan2(7 - 1.65, 10),
      weapon: "lance"
    };
    expect(
      stepWorld(w, new Map([[p.id, input]])).filter((e) => e.type === "shot")
    ).toHaveLength(0);
    input.weapon = "pistol";
    expect(
      stepWorld(w, new Map([[p.id, input]])).filter((e) => e.type === "shot")
    ).toHaveLength(1);
    expect(w.aliens).toHaveLength(0);
    expect(w.loot).toHaveLength(1);
    expect(
      stepWorld(w, new Map([[p.id, input]])).filter((e) => e.type === "shot")
    ).toHaveLength(0);
    expect(w.loot).toHaveLength(1);
  });
  it("rejects forged coordinates, non-finite input, and extra action fields", () => {
    expect(
      MessageSchema.safeParse({ type: "input", ...idleInput(), x: 400 }).success
    ).toBe(false);
    expect(
      MessageSchema.safeParse({ type: "input", ...idleInput(), yaw: NaN })
        .success
    ).toBe(false);
    expect(
      MessageSchema.safeParse({
        type: "action",
        id: 1,
        action: { type: "collect", uid: 1, amount: 9000 }
      }).success
    ).toBe(false);
  });
});

describe("room lifecycle and durable actions", () => {
  it("echoes latency probes without changing the saved world", async () => {
    const { rooms } = setup(),
      a = await join(rooms),
      connection = peer(),
      { room } = await rooms.authenticate("ABCDEFGH", a.ticket, connection.p),
      before = structuredClone(room.record);
    await room.message(a.playerId, { type: "ping", clientTime: 1234.5 });
    expect(connection.messages.at(-1)).toEqual({
      type: "pong",
      clientTime: 1234.5
    });
    expect(room.record).toEqual(before);
    for (const clientTime of [-1, Infinity, NaN])
      expect(
        MessageSchema.safeParse({ type: "ping", clientTime }).success
      ).toBe(false);
  });
  it("reconciles batched movement without skipping or repeating a physics step", async () => {
    const { rooms } = setup(),
      a = await join(rooms),
      { room } = await rooms.authenticate("ABCDEFGH", a.ticket, peer().p),
      predicted = structuredClone(room.record.world.players[a.playerId]),
      pending: ReturnType<typeof idleInput>[] = [],
      outgoing: ReturnType<typeof idleInput>[] = [];
    for (let tick = 0; tick < 240; tick++) {
      const input = {
        ...idleInput(),
        seq: tick + 1,
        forward: 1,
        right: tick % 60 < 30 ? 0.5 : -0.5,
        yaw: tick * 0.02,
        jump: tick % 47 === 0
      };
      pending.push(input);
      outgoing.push(input);
      movePlayer(room.record.world, predicted, input, STEP);
      if (tick % 3 === 2) {
        for (const frame of outgoing.splice(0))
          await room.message(a.playerId, { type: "input", ...frame });
      }
      room.tick();
      const authoritative = room.record.world.players[a.playerId],
        replayed = structuredClone(authoritative);
      while (pending.length && pending[0].seq <= authoritative.seq)
        pending.shift();
      for (const frame of pending)
        movePlayer(room.record.world, replayed, frame, STEP);
      expect(replayed.x).toBeCloseTo(predicted.x, 10);
      expect(replayed.y).toBeCloseTo(predicted.y, 10);
      expect(replayed.z).toBeCloseTo(predicted.z, 10);
    }
    expect(room.record.world.players[a.playerId].seq).toBe(240);
  });
  it("bounds movement credit and reconnects when the input backlog fills", async () => {
    const closed: number[] = [];
    const { rooms } = setup(),
      a = await join(rooms),
      { room } = await rooms.authenticate("ABCDEFGH", a.ticket, {
        ...peer().p,
        close: (code) => closed.push(code)
      });
    for (let i = 0; i < 20; i++) room.tick();
    for (let seq = 1; seq <= 20; seq++)
      await room.message(a.playerId, {
        type: "input",
        ...idleInput(),
        seq,
        forward: 1
      });
    await room.message(a.playerId, { type: "input", ...idleInput(), seq: 21 });
    expect(closed).toEqual([4008]);
    room.tick();
    expect(room.record.world.players[a.playerId].seq).toBe(3);
    room.tick();
    expect(room.record.world.players[a.playerId].seq).toBe(6);
  });
  it("keeps physics running during saves and commits actions without rewinding the world", async () => {
    const { rooms, store } = setup(),
      a = await join(rooms),
      { room } = await rooms.authenticate("ABCDEFGH", a.ticket, peer().p);
    const save = store.save.bind(store);
    let release!: () => void;
    store.save = async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return save(...args);
    };
    const checkpoint = room.checkpoint();
    await Promise.resolve();
    room.tick();
    expect(room.record.world.time).toBe(STEP);
    release();
    await checkpoint;
    const player = room.record.world.players[a.playerId],
      node = room.record.world.nodes[0];
    player.x = node.x;
    player.z = node.z;
    player.y = ground(node.x, node.z);
    const before = room.record.world.colony.res.mat;
    const action = room.message(a.playerId, {
      type: "action",
      id: 1,
      action: { type: "collect", uid: node.uid }
    });
    await Promise.resolve();
    expect(room.record.world.nodes[0].readyAt).toBe(0);
    await room.message(a.playerId, {
      type: "input",
      ...idleInput(),
      seq: 1,
      forward: 1
    });
    room.tick();
    const position = player.z,
      time = room.record.world.time;
    room.record.world.colony.res.mat += 7;
    player.shards += 2;
    release();
    await action;
    expect(room.record.world.time).toBe(time);
    expect(room.record.world.players[a.playerId].z).toBe(position);
    expect(room.record.world.players[a.playerId].shards).toBe(2);
    expect(room.record.world.colony.res.mat).toBe(before + 25 + 7);
    expect(room.record.world.nodes[0].readyAt).toBeGreaterThan(time);
  });
  it("does not rewind movement when another astronaut joins during a slow save", async () => {
    const { rooms, store } = setup(),
      a = await join(rooms),
      { room } = await rooms.authenticate("ABCDEFGH", a.ticket, peer().p);
    const save = store.save.bind(store);
    let release!: () => void;
    store.save = async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return save(...args);
    };
    const joining = room.join("Grace");
    await Promise.resolve();
    await room.message(a.playerId, {
      type: "input",
      ...idleInput(),
      seq: 1,
      forward: 1
    });
    room.tick();
    const position = room.record.world.players[a.playerId].z;
    release();
    await joining;
    expect(room.record.world.players[a.playerId].z).toBe(position);
    expect(room.record.world.time).toBe(STEP);
  });
  it("reserves building IDs during a save and merges recycling and crafting once", async () => {
    const { rooms, store } = setup(),
      a = await join(rooms),
      { room } = await rooms.authenticate("ABCDEFGH", a.ticket, peer().p),
      w = room.record.world,
      player = w.players[a.playerId];
    let at: { x: number; z: number } | undefined;
    for (let x = -25; x <= 25 && !at; x += 2)
      for (let z = -15; z <= 30 && !at; z += 2)
        if (!placementError(w, player, "solar", x, z)) at = { x, z };
    expect(at).toBeDefined();
    const save = store.save.bind(store);
    let release!: () => void;
    store.save = async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return save(...args);
    };
    const building = room.message(a.playerId, {
      type: "action",
      id: 1,
      action: { type: "build", module: "solar", ...at!, rot: 0 }
    });
    await Promise.resolve();
    w.raid.state = "warn";
    w.raid.t = 12;
    room.tick();
    const nextId = w.next;
    w.colony.res.mat += 7;
    release();
    await building;
    const ids = [...w.colony.mods, ...w.aliens].map((item) => item.uid);
    expect(new Set(ids).size).toBe(ids.length);
    expect(w.aliens).toHaveLength(5);
    expect(w.colony.mods).toHaveLength(1);
    expect(w.next).toBe(nextId);
    expect(w.colony.res.mat).toBe(137);
    store.save = save;
    player.x = at!.x;
    player.z = at!.z;
    await room.message(a.playerId, {
      type: "action",
      id: 2,
      action: { type: "recycle", uid: w.colony.mods[0].uid }
    });
    expect(w.colony.mods).toHaveLength(0);
    expect(w.colony.res.mat).toBe(152);
    const craft = {
      type: "action",
      id: 3,
      action: { type: "craft", weapon: "rifle" }
    };
    await room.message(a.playerId, craft);
    await room.message(a.playerId, craft);
    expect(player.weapons.filter((weapon) => weapon === "rifle")).toHaveLength(
      1
    );
    expect(w.colony.res.mat).toBe(42);
    expect(w.colony.res.water).toBe(5);
  });
  it("preserves a short trigger press when inputs arrive in one network batch", async () => {
    const { rooms } = setup(),
      a = await join(rooms);
    const { room } = await rooms.authenticate("ABCDEFGH", a.ticket, peer().p);
    await room.message(a.playerId, {
      type: "input",
      ...idleInput(),
      seq: 1,
      fire: true
    });
    await room.message(a.playerId, {
      type: "input",
      ...idleInput(),
      seq: 2,
      fire: false
    });
    expect(room.tick().filter((e) => e.type === "shot")).toHaveLength(1);
    expect(room.tick().filter((e) => e.type === "shot")).toHaveLength(0);
  });
  it("keeps the room cap under concurrent creation", async () => {
    const { rooms } = setup();
    const results = await Promise.allSettled(
      Array.from({ length: 40 }, () => join(rooms))
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(32);
    expect(rooms.rooms.size).toBe(32);
  });
  it("pauses after a checkpoint failure and resumes when storage recovers", async () => {
    const { rooms, store } = setup(),
      a = await join(rooms);
    const { room } = await rooms.authenticate("ABCDEFGH", a.ticket, peer().p);
    room.tick();
    const before = room.record.world.time;
    store.fail = true;
    await rooms.maintain();
    expect(room.snapshot().paused).toBe(true);
    room.tick();
    expect(room.record.world.time).toBe(before);
    store.fail = false;
    await rooms.maintain();
    expect(room.snapshot().paused).toBe(false);
    room.tick();
    expect(room.record.world.time).toBeGreaterThan(before);
  });
  it("serializes two astronauts collecting the same deposit", async () => {
    const { rooms } = setup(),
      a = await join(rooms),
      b = await join(rooms, a.room);
    const { room } = await rooms.authenticate("ABCDEFGH", a.ticket, peer().p);
    const other = peer();
    await rooms.authenticate("ABCDEFGH", b.ticket, other.p);
    const node = room.record.world.nodes[0];
    for (const p of Object.values(room.record.world.players)) {
      p.x = node.x;
      p.z = node.z;
    }
    const before = room.record.world.colony.res.mat;
    await Promise.all(
      [a, b].map((p) =>
        room.message(p.playerId, {
          type: "action",
          id: 1,
          action: { type: "collect", uid: node.uid }
        })
      )
    );
    expect(room.record.world.colony.res.mat).toBe(before + 25);
    expect(other.messages).toContainEqual(
      expect.objectContaining({ type: "error", id: 1 })
    );
    expect(Object.keys(room.snapshot().players)).toHaveLength(2);
  });
  it("uses distinct identities for equal names and never sends credentials", async () => {
    const { rooms } = setup(),
      a = await join(rooms),
      b = await join(rooms, a.room),
      socket = peer();
    expect(a.playerId).not.toBe(b.playerId);
    const { room } = await rooms.authenticate("ABCDEFGH", a.ticket, socket.p);
    const wire = JSON.stringify(socket.messages);
    expect(wire).not.toContain(a.resume);
    expect(wire).not.toContain("credentials");
    expect(Object.keys(room.snapshot().players)).toEqual([a.playerId]);
    await expect(
      rooms.authenticate("ABCDEFGH", a.ticket, peer().p)
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rejoins after restart with the same player and preserves acknowledged actions", async () => {
    const { rooms, store } = setup(),
      a = await join(rooms),
      socket = peer();
    const { room } = await rooms.authenticate("ABCDEFGH", a.ticket, socket.p);
    const player = room.record.world.players[a.playerId],
      node = room.record.world.nodes[0];
    player.x = node.x;
    player.z = node.z;
    const command = {
      type: "action",
      id: 1,
      action: { type: "collect", uid: node.uid }
    };
    await room.message(a.playerId, command);
    const amount = room.record.world.colony.res.mat;
    await room.message(a.playerId, command);
    expect(room.record.world.colony.res.mat).toBe(amount);
    const restarted = new Rooms(store, async () => "owner"),
      again = await join(restarted, a.room, a.resume, "Ada again");
    expect(again.playerId).toBe(a.playerId);
    const active = await restarted.authenticate(
      "ABCDEFGH",
      again.ticket,
      peer().p
    );
    expect(active.room.record.world.colony.res.mat).toBe(amount);
    expect(active.room.record.actions[a.playerId]).toBe(1);
    await active.room.message(a.playerId, command);
    expect(active.room.record.world.colony.res.mat).toBe(amount);
  });
  it("does not change the world or acknowledge an action when saving fails", async () => {
    const { rooms, store } = setup(),
      a = await join(rooms),
      socket = peer(),
      { room } = await rooms.authenticate("ABCDEFGH", a.ticket, socket.p);
    const n = room.record.world.nodes[0],
      p = room.record.world.players[a.playerId];
    p.x = n.x;
    p.z = n.z;
    store.fail = true;
    await expect(
      room.message(a.playerId, {
        type: "action",
        id: 1,
        action: { type: "collect", uid: n.uid }
      })
    ).rejects.toThrow("Offline");
    expect(room.record.world.nodes[0].readyAt).toBe(0);
    expect(socket.messages).not.toContainEqual({ type: "ack", id: 1 });
  });
  it("limits rooms to four crew and rejects another invitation or a forged resume token", async () => {
    const { rooms } = setup(),
      a = await join(rooms);
    for (let i = 0; i < 3; i++) await join(rooms, a.room);
    await expect(join(rooms, a.room)).rejects.toMatchObject({ status: 409 });
    await expect(join(rooms, a.room, "0".repeat(64))).rejects.toMatchObject({
      status: 401
    });
    await expect(
      rooms.join("BCDEFGHJ", { protocol: PROTOCOL, name: "Ada", room: a.room })
    ).rejects.toMatchObject({ status: 404 });
  });
  it("does not disconnect a replacement tab when the old tab closes", async () => {
    const { rooms } = setup(),
      a = await join(rooms),
      first = peer(),
      second = peer();
    const { room } = await rooms.authenticate("ABCDEFGH", a.ticket, first.p);
    const b = await join(rooms, a.room, a.resume);
    await rooms.authenticate("ABCDEFGH", b.ticket, second.p);
    await room.message(
      a.playerId,
      { type: "input", ...idleInput(), seq: 1, forward: 1 },
      first.p
    );
    await room.message(
      a.playerId,
      { type: "action", id: 1, action: { type: "craft", weapon: "rifle" } },
      first.p
    );
    room.tick();
    expect(room.record.world.players[a.playerId].seq).toBe(0);
    expect(room.record.world.players[a.playerId].weapons).not.toContain(
      "rifle"
    );
    room.detach(a.playerId, first.p);
    expect(room.record.world.players[a.playerId].online).toBe(true);
    expect(room.peers.get(a.playerId)).toBe(second.p);
  });
});

describe("WebSocket transport", () => {
  it("joins two clients, shares movement, reconnects, and closes revoked invitations", async () => {
    const store = new MemoryStore();
    let authorized = true;
    const rooms = new Rooms(store, async () => (authorized ? "owner" : null)),
      origin = "http://localhost",
      service = createMultiplayerServer(rooms, [origin]);
    await new Promise<void>((resolve) =>
      service.server.listen(0, "127.0.0.1", resolve)
    );
    const port = (service.server.address() as AddressInfo).port,
      base = `http://127.0.0.1:${port}/play/ABCDEFGH/multiplayer`;
    const sockets: WebSocket[] = [];
    async function enter(room?: string, resume?: string) {
      const r = await fetch(base + "/join", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol: PROTOCOL,
          name: "Ada",
          ...(room ? { room } : {}),
          ...(resume ? { resume } : {})
        })
      });
      expect(r.status).toBe(200);
      return (await r.json()) as Awaited<ReturnType<Rooms["join"]>>;
    }
    async function connect(ticket: string) {
      const ws = new WebSocket(base.replace(/^http/, "ws"), { origin });
      sockets.push(ws);
      await once(ws, "open");
      const welcome = once(ws, "message");
      ws.send(JSON.stringify({ type: "auth", ticket }));
      return { ws, welcome: JSON.parse((await welcome)[0].toString()) };
    }
    try {
      const refused = await fetch(base + "/join", {
        method: "POST",
        headers: { Origin: "https://untrusted.example" },
        body: "{}"
      });
      expect(refused.status).toBe(403);
      const a = await enter(),
        one = await connect(a.ticket),
        b = await enter(a.room),
        two = await connect(b.ticket);
      expect(Object.keys(two.welcome.world.players)).toHaveLength(2);
      const update = new Promise<any>((resolve) =>
        two.ws.on("message", (data) => {
          const m = JSON.parse(data.toString());
          if (m.type === "snapshot" && m.world.players[a.playerId]?.seq === 1)
            resolve(m);
        })
      );
      one.ws.send(
        JSON.stringify({ type: "input", ...idleInput(), seq: 1, forward: 1 })
      );
      const snapshot = await update;
      expect(snapshot.world.players[a.playerId].z).toBeLessThan(
        one.welcome.world.players[a.playerId].z
      );
      const rejoined = await enter(a.room, a.resume),
        replacement = await connect(rejoined.ticket);
      expect(replacement.welcome.playerId).toBe(a.playerId);
      const closed = once(replacement.ws, "close");
      authorized = false;
      await rooms.maintain();
      expect((await closed)[0]).toBe(4003);
    } finally {
      for (const ws of sockets) ws.terminate();
      await service.close();
    }
  }, 15000);
});
