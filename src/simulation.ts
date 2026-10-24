import { ground, mulberry, rocks } from "./terrain.js";

export { ground } from "./terrain.js";
export const PROTOCOL = 2;
export const STEP = 1 / 20;
export const MODULES: Record<
  string,
  { mat: number; water: number; r: number; power: number }
> = {
  flag: { mat: 0, water: 0, r: 1.2, power: 0 },
  solar: { mat: 30, water: 0, r: 3.6, power: 0 },
  hab: { mat: 60, water: 0, r: 6.2, power: 1 },
  green: { mat: 50, water: 10, r: 5.6, power: 1 },
  oxy: { mat: 40, water: 0, r: 3.8, power: 2 },
  ice: { mat: 45, water: 0, r: 3.6, power: 1 },
  mine: { mat: 45, water: 0, r: 4.2, power: 2 },
  dish: { mat: 35, water: 0, r: 3.4, power: 1 }
};
export const WEAPONS: Record<
  string,
  {
    mat: number;
    water: number;
    shards: number;
    damage: number;
    rate: number;
    range: number;
    heat: number;
  }
> = {
  pistol: {
    mat: 40,
    water: 0,
    shards: 0,
    damage: 18,
    rate: 3.4,
    range: 150,
    heat: 0.13
  },
  rifle: {
    mat: 110,
    water: 15,
    shards: 0,
    damage: 11,
    rate: 9,
    range: 190,
    heat: 0.055
  },
  lance: {
    mat: 220,
    water: 40,
    shards: 6,
    damage: 120,
    rate: 0.85,
    range: 230,
    heat: 0.42
  }
};
export type Building = {
  uid: number;
  id: string;
  x: number;
  z: number;
  rot: number;
  fy: number;
};
export type Input = {
  seq: number;
  forward: number;
  right: number;
  yaw: number;
  pitch: number;
  run: boolean;
  jump: boolean;
  fire: boolean;
  weapon: string;
};
export const idleInput = (): Input => ({
  seq: 0,
  forward: 0,
  right: 0,
  yaw: 0,
  pitch: 0,
  run: false,
  jump: false,
  fire: false,
  weapon: "pistol"
});
export type Player = {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  onGround: boolean;
  hp: number;
  o2: number;
  weapons: string[];
  shards: number;
  heat: number;
  over: boolean;
  cool: number;
  seq: number;
  online: boolean;
};
export type Node = {
  uid: number;
  x: number;
  z: number;
  type: "mat" | "ice";
  readyAt: number;
};
export type Alien = {
  uid: number;
  type: "drone" | "crawler";
  x: number;
  y: number;
  z: number;
  hp: number;
  r: number;
  cool: number;
  target: string | null;
};
export type Loot = { uid: number; x: number; z: number; amount: number };
export type World = {
  v: 1;
  revision: number;
  next: number;
  time: number;
  colony: {
    v: 1;
    mods: Building[];
    res: Record<string, number>;
    pop: number;
    sol: number;
    done: Record<string, boolean>;
    landers: [];
    next: number;
  };
  rates: Record<string, number>;
  nodes: Node[];
  players: Record<string, Player>;
  aliens: Alien[];
  loot: Loot[];
  raid: {
    state: "calm" | "warn" | "active";
    next: number;
    t: number;
    count: number;
  };
};
export type Action =
  | { type: "collect"; uid: number }
  | { type: "build"; module: string; x: number; z: number; rot: number }
  | { type: "recycle"; uid: number }
  | { type: "craft"; weapon: string };
export type GameEvent =
  | {
      type: "shot";
      player: string;
      weapon: string;
      from: number[];
      to: number[];
    }
  | { type: "notice"; text: string };
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

export function createWorld(): World {
  const r = mulberry(735),
    nodes: Node[] = [];
  for (let i = 0; i < 26; i++) {
    let x = 0,
      z = 0;
    for (let k = 0; k < 20; k++) {
      const a = r() * Math.PI * 2,
        d = 30 + r() * 330;
      x = Math.cos(a) * d;
      z = Math.sin(a) * d;
      if (Math.abs(ground(x + 1, z) - ground(x - 1, z)) < 0.8) break;
    }
    nodes.push({ uid: i + 1, x, z, type: i < 18 ? "mat" : "ice", readyAt: 0 });
  }
  return {
    v: 1,
    revision: 0,
    next: 100,
    time: 0,
    colony: {
      v: 1,
      mods: [],
      res: { mat: 160, water: 20, food: 12, o2: 12 },
      pop: 0,
      sol: 0,
      done: {},
      landers: [],
      next: 1
    },
    rates: {},
    nodes,
    players: {},
    aliens: [],
    loot: [],
    raid: { state: "calm", next: 90, t: 0, count: 0 }
  };
}
export function createPlayer(id: string, name: string, slot: number): Player {
  const x = (slot - 1.5) * 2,
    z = 9;
  return {
    id,
    name,
    x,
    y: ground(x, z),
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    onGround: true,
    hp: 100,
    o2: 1,
    weapons: ["hands", "pistol"],
    shards: 0,
    heat: 0,
    over: false,
    cool: 0,
    seq: 0,
    online: true
  };
}
function local(b: Building, x: number, z: number) {
  const c = Math.cos(b.rot),
    s = Math.sin(b.rot),
    dx = x - b.x,
    dz = z - b.z;
  return [dx * c - dz * s, dx * s + dz * c];
}
function sheltered(w: World, p: Player) {
  return (
    distance(p, { x: 0, z: 0 }) < 10 ||
    w.colony.mods.some((b) => b.id === "hab" && distance(p, b) < 4.7)
  );
}
export function movePlayer(
  w: World,
  p: Player,
  input: Input,
  dt: number
): void {
  p.yaw = input.yaw;
  p.pitch = input.pitch;
  let f = input.forward,
    r = input.right;
  const m = Math.hypot(f, r);
  if (m > 1) {
    f /= m;
    r /= m;
  }
  const speed = 3.2 * (input.run ? 1.8 : 1),
    fx = -Math.sin(p.yaw),
    fz = -Math.cos(p.yaw),
    k = Math.min(1, (p.onGround ? 9 : 1.2) * dt);
  p.vx += ((fx * f - fz * r) * speed - p.vx) * k;
  p.vz += ((fz * f + fx * r) * speed - p.vz) * k;
  p.vy -= 1.62 * dt;
  if (input.jump && p.onGround) {
    p.vy = 3.3;
    p.onGround = false;
  }
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  p.y += p.vy * dt;
  const colliders = [
    ...rocks,
    { x: 0, z: 0, r: 3 },
    ...w.colony.mods
      .filter((b) => b.id !== "flag" && b.id !== "hab")
      .map((b) => ({ x: b.x, z: b.z, r: MODULES[b.id].r * 0.82 }))
  ];
  for (const c of colliders) {
    const d = distance(p, c),
      r0 = c.r + 0.35;
    if (d < r0) {
      p.x = c.x + (d > 0.0001 ? (p.x - c.x) / d : 1) * r0;
      p.z = c.z + (d > 0.0001 ? (p.z - c.z) / d : 0) * r0;
    }
  }
  const rr = Math.hypot(p.x, p.z);
  if (rr > 1400) {
    p.x *= 1400 / rr;
    p.z *= 1400 / rr;
  }
  let floor = ground(p.x, p.z);
  for (const b of w.colony.mods) {
    if (b.id !== "hab") continue;
    let [lx, lz] = local(b, p.x, p.z);
    const d = Math.hypot(lx, lz);
    if (d > 8) continue;
    if (d > 4.62 && d < 5.4 && !(Math.abs(lx) < 0.6 && lz > 0)) {
      const t = d < 5 ? 4.62 : 5.4;
      lx *= t / d;
      lz *= t / d;
    }
    if (lz > 4.75 && lz < 7.4 && Math.abs(lx) > 0.6 && Math.abs(lx) < 1.02)
      lx = Math.sign(lx) * (Math.abs(lx) < 0.81 ? 0.6 : 1.02);
    const c = Math.cos(b.rot),
      s = Math.sin(b.rot);
    p.x = b.x + lx * c + lz * s;
    p.z = b.z - lx * s + lz * c;
    if (Math.hypot(lx, lz) < 5.2 || (Math.abs(lx) < 0.95 && lz > 4 && lz < 7.4))
      floor = Math.max(floor, b.fy);
    if (Math.hypot(lx, lz) < 4.7 && p.y > b.fy + 3.9) {
      p.y = b.fy + 3.9;
      p.vy = Math.min(0, p.vy);
    }
  }
  if (p.y <= floor) {
    p.y = floor;
    p.vy = 0;
    p.onGround = true;
  } else p.onGround = p.y - floor < 0.05;
  p.seq = input.seq;
}
export function applyAction(w: World, p: Player, a: Action): string | null {
  if (a.type === "collect") {
    const n = w.nodes.find((n) => n.uid === a.uid);
    if (!n || n.readyAt > w.time || distance(p, n) > 5)
      return "That deposit is unavailable or too far away.";
    n.readyAt = w.time + 90;
    w.colony.res[n.type === "mat" ? "mat" : "water"] +=
      n.type === "mat" ? 25 : 12;
  } else if (a.type === "build") {
    const d = MODULES[a.module];
    const error = placementError(w, p, a.module, a.x, a.z);
    if (error) return error;
    let fy = ground(a.x, a.z);
    if (a.module === "hab") {
      for (let i = 0; i < 10; i++) {
        const t = (i / 10) * Math.PI * 2;
        fy = Math.max(
          fy,
          ground(a.x + Math.cos(t) * 5.3, a.z + Math.sin(t) * 5.3)
        );
      }
      for (const z of [6, 7.3])
        fy = Math.max(
          fy,
          ground(a.x + z * Math.sin(a.rot), a.z + z * Math.cos(a.rot))
        );
      fy += 0.12;
    }
    w.colony.res.mat -= d.mat;
    w.colony.res.water -= d.water;
    w.colony.mods.push({
      uid: w.next++,
      id: a.module,
      x: a.x,
      z: a.z,
      rot: a.rot,
      fy
    });
    w.colony.done[a.module] = true;
  } else if (a.type === "recycle") {
    const b = w.colony.mods.find((b) => b.uid === a.uid);
    if (!b || distance(p, b) > 12) return "That building is too far away.";
    w.colony.mods = w.colony.mods.filter((m) => m.uid !== b.uid);
    w.colony.res.mat += Math.floor(MODULES[b.id].mat / 2);
  } else if (a.type === "craft") {
    const d = WEAPONS[a.weapon];
    if (!d || p.weapons.includes(a.weapon))
      return "That weapon cannot be crafted.";
    if (
      w.colony.res.mat < d.mat ||
      w.colony.res.water < d.water ||
      p.shards < d.shards
    )
      return "Not enough resources.";
    w.colony.res.mat -= d.mat;
    w.colony.res.water -= d.water;
    p.shards -= d.shards;
    p.weapons.push(a.weapon);
  }
  w.revision++;
  return null;
}
export function placementError(
  w: World,
  p: Pick<Player, "id" | "x" | "z">,
  module: string,
  x: number,
  z: number
): string | null {
  const d = MODULES[module],
    at = { x, z };
  if (!d) return "Unknown module.";
  if (w.colony.mods.length >= 200)
    return "This colony has reached its building limit.";
  if (distance(p, at) > 32 || Math.hypot(x, z) > 1100)
    return "Build closer to your astronaut.";
  if (module === "flag" && w.colony.mods.some((b) => b.id === "flag"))
    return "The colony already has a flag.";
  if (w.colony.res.mat < d.mat || w.colony.res.water < d.water)
    return "Not enough shared resources.";
  if (
    distance(p, at) < d.r + 0.6 ||
    Object.values(w.players).some(
      (other) =>
        other.id !== p.id && other.online && distance(other, at) < d.r + 0.6
    )
  )
    return "An astronaut is standing there.";
  if (Math.hypot(x, z) < d.r + 5) return "Too close to the lander.";
  if (
    w.colony.mods.some((b) => distance(b, at) < d.r + MODULES[b.id].r + 0.4) ||
    rocks.some((c) => distance(c, at) < d.r + c.r)
  )
    return "Too close to another structure or rock.";
  const hs = [
    [d.r, 0],
    [-d.r, 0],
    [0, d.r],
    [0, -d.r],
    [0, 0]
  ].map(([dx, dz]) => ground(x + dx, z + dz));
  if (Math.max(...hs) - Math.min(...hs) > Math.max(0.9, d.r * 0.32))
    return "Ground is too uneven here.";
  return null;
}
export function raySphere(
  o: number[],
  d: number[],
  c: number[],
  r: number
): number | null {
  const x = o[0] - c[0],
    y = o[1] - c[1],
    z = o[2] - c[2],
    b = x * d[0] + y * d[1] + z * d[2],
    q = b * b - (x * x + y * y + z * z - r * r);
  if (q < 0) return null;
  const near = -b - Math.sqrt(q),
    far = -b + Math.sqrt(q);
  return near >= 0 ? near : far >= 0 ? far : null;
}
function blocked(w: World, o: number[], d: number[], max: number): number {
  let best = max;
  for (const c of [
    ...rocks,
    ...w.colony.mods
      .filter((b) => b.id !== "flag")
      .map((b) => ({ x: b.x, z: b.z, r: MODULES[b.id].r * 0.82 }))
  ]) {
    const y = ground(c.x, c.z) + (c.r > 3 ? 2 : c.r * 0.7),
      t = raySphere(o, d, [c.x, y, c.z], c.r);
    if (t !== null && t < best) best = t;
  }
  for (let t = 0.5; t < best; t += 0.5)
    if (o[1] + d[1] * t < ground(o[0] + d[0] * t, o[2] + d[2] * t)) return t;
  return best;
}
function respawn(p: Player) {
  p.x = 0;
  p.z = 9;
  p.y = ground(0, 9);
  p.vx = p.vy = p.vz = 0;
  p.hp = 100;
  p.o2 = 1;
}
function shot(w: World, p: Player, input: Input, events: GameEvent[]) {
  const gun = WEAPONS[input.weapon];
  if (!gun || !p.weapons.includes(input.weapon) || p.cool > 0 || p.over) return;
  p.cool = 1 / gun.rate;
  p.heat += gun.heat;
  if (p.heat >= 1) p.over = true;
  const cp = Math.cos(p.pitch),
    o = [p.x, p.y + 1.65, p.z],
    d = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
  let best = blocked(w, o, d, gun.range),
    hit: Alien | undefined;
  for (const a of w.aliens) {
    const t = raySphere(o, d, [a.x, a.y, a.z], a.r);
    if (t !== null && t < best) {
      best = t;
      hit = a;
    }
  }
  const to = o.map((v, i) => v + d[i] * best);
  events.push({
    type: "shot",
    player: p.id,
    weapon: input.weapon,
    from: o,
    to
  });
  if (hit) hit.hp -= gun.damage;
  if (input.weapon === "lance")
    for (const a of w.aliens)
      if (a !== hit && Math.hypot(a.x - to[0], a.y - to[1], a.z - to[2]) < 6)
        a.hp -= gun.damage * 0.5;
}
function colonyStep(w: World, dt: number) {
  const c = w.colony,
    n: Record<string, number> = {};
  for (const b of c.mods) n[b.id] = (n[b.id] || 0) + 1;
  const count = (id: string) => n[id] || 0;
  const gen = 2 + count("solar") * 3,
    use = c.mods.reduce((s, b) => s + MODULES[b.id].power, 0),
    eff = use > 0 ? Math.min(1, gen / use) : 1;
  const water = count("ice") * 3 * eff,
    oxy =
      count("oxy") *
      eff *
      (c.res.water > 0.2 ? 1 : clamp(water / (count("oxy") + 1e-6), 0, 1));
  w.rates = {
    power: gen - use,
    eff,
    cap: count("hab") * 4,
    o2: oxy * 4 - c.pop,
    food: count("green") * 4 * eff - c.pop,
    water: water - oxy,
    mat: count("mine") * 12 * eff
  };
  if (c.pop >= 2) c.done.pop2 = true;
  if (c.pop >= 10) c.done.pop10 = true;
  if (c.pop >= 30) c.done.pop30 = true;
  if (c.pop > 0 && w.rates.o2 >= 0 && w.rates.food >= 0) c.done.self = true;
  const before = Math.floor(c.sol);
  c.sol += dt / 45;
  for (const id of ["mat", "water", "food", "o2"])
    c.res[id] = clamp(
      c.res[id] + (w.rates[id] * dt) / 45,
      0,
      id === "mat" ? 1e7 : id === "water" ? 500 : 300
    );
  if (Math.floor(c.sol) > before) {
    if ((c.res.o2 <= 0 || c.res.food <= 0) && c.pop > 0) c.pop--;
    else if (count("dish") && c.res.o2 > c.pop + 4 && c.res.food > c.pop + 4) {
      const n = Math.min(w.rates.cap - c.pop, 2 + count("dish"));
      if (n > 0) {
        c.pop += n;
        c.res.mat += 20;
      }
    }
  }
}
export function stepWorld(
  w: World,
  inputs: Map<string, Input | Input[]>,
  dt = STEP
): GameEvent[] {
  const events: GameEvent[] = [],
    players = Object.values(w.players).filter((p) => p.online);
  if (!players.length) return events;
  w.time += dt;
  colonyStep(w, dt);
  for (const p of players) {
    const input = inputs.get(p.id),
      frames = Array.isArray(input)
        ? input
        : [input || { ...idleInput(), seq: p.seq, yaw: p.yaw, pitch: p.pitch }];
    p.cool = Math.max(0, p.cool - dt);
    p.heat = Math.max(0, p.heat - dt * (p.over ? 0.45 : 0.6));
    if (p.over && p.heat < 0.25) p.over = false;
    for (const frame of frames) {
      movePlayer(w, p, frame, dt);
      if (frame.fire) shot(w, p, frame, events);
    }
    const safe = sheltered(w, p);
    p.o2 = clamp(p.o2 + dt * (safe ? 0.2 : -1 / 480), 0, 1);
    if (p.o2 <= 0) {
      respawn(p);
      events.push({
        type: "notice",
        text: p.name + " returned to the lander for air."
      });
    }
    if (safe && w.raid.state !== "active") p.hp = Math.min(100, p.hp + dt * 6);
    for (const loot of w.loot)
      if (loot.amount && distance(p, loot) < 2.4) {
        p.shards += loot.amount;
        loot.amount = 0;
      }
  }
  w.loot = w.loot.filter((l) => l.amount > 0);
  const r = w.raid;
  r.t += dt;
  if (r.state === "calm" && w.time >= r.next) {
    r.state = "warn";
    r.t = 0;
    events.push({
      type: "notice",
      text: "Alien raid incoming. Prepare to defend the colony."
    });
  }
  if (r.state === "warn" && r.t >= 12) {
    r.state = "active";
    r.t = 0;
    r.count++;
    const random = mulberry(r.count * 319);
    for (let i = 0; i < Math.min(16, 3 + r.count * 2); i++) {
      const a = random() * Math.PI * 2,
        x = Math.cos(a) * 85,
        z = Math.sin(a) * 85,
        type = i % 3 === 2 ? "crawler" : "drone";
      w.aliens.push({
        uid: w.next++,
        type,
        x,
        y: ground(x, z) + (type === "drone" ? 7 : 0.9),
        z,
        hp: type === "drone" ? 54 : 90,
        r: type === "drone" ? 1.2 : 1,
        cool: 2,
        target: null
      });
    }
  }
  for (const a of w.aliens) {
    if (a.hp <= 0) continue;
    a.cool -= dt;
    const targets = players.filter((p) => !sheltered(w, p));
    const p = targets.sort((p, q) => distance(p, a) - distance(q, a))[0];
    a.target = p?.id || null;
    if (!p) continue;
    const d = distance(a, p) || 1,
      stop = a.type === "drone" ? 16 : 1.8,
      speed = a.type === "drone" ? 6 : 4;
    if (d > stop) {
      a.x += ((p.x - a.x) / d) * Math.min(speed * dt, d - stop);
      a.z += ((p.z - a.z) / d) * Math.min(speed * dt, d - stop);
    }
    a.y = ground(a.x, a.z) + (a.type === "drone" ? 7 : 0.9);
    if (d < (a.type === "drone" ? 45 : 2.5) && a.cool <= 0) {
      const o = [a.x, a.y, a.z],
        v = [p.x - a.x, p.y + 1.2 - a.y, p.z - a.z],
        len = Math.hypot(...v),
        dir = v.map((n) => n / len);
      if (blocked(w, o, dir, len) >= len - 0.5) {
        p.hp -= a.type === "drone" ? 10 : 14;
        if (p.hp <= 0) {
          respawn(p);
          events.push({
            type: "notice",
            text: p.name + " was carried back to the lander."
          });
        }
      }
      a.cool = 1.5;
    }
  }
  for (const a of w.aliens)
    if (a.hp <= 0 && w.loot.length < 200)
      w.loot.push({
        uid: w.next++,
        x: a.x,
        z: a.z,
        amount: a.type === "drone" ? 1 : 2
      });
  w.aliens = w.aliens.filter((a) => a.hp > 0);
  if (r.state === "active" && (!w.aliens.length || r.t >= 110)) {
    events.push({
      type: "notice",
      text: w.aliens.length ? "The aliens retreated." : "Raid repelled!"
    });
    r.state = "calm";
    r.next = w.time + 100;
    r.t = 0;
    w.aliens = [];
  }
  w.revision++;
  return events;
}
