(() => {
'use strict';
const MP = { active: false, connected: false, ready: false, paused: false, ws: null, world: null, pred: null, offset: { x: 0, y: 0, z: 0 }, pending: [], commands: new Map(), avatars: new Map(), seq: 0, actionId: 0, accumulator: 0, moveAt: 0, retry: null, retryCount: 0, generation: 0, room: '', id: '', solo: null, modules: '', shot: false };

/* ================= physics core (no DOM, no THREE) ================= */
const g0 = 9.80665, RE = 6371000, MU = 3.986004418e14;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const soundSpeed = h => h < 11000 ? 340.3 - 0.0041 * h : h < 20000 ? 295.1 : Math.min(329, 295.1 + (h - 20000) * 0.0011);

const ROCKETS = [
  { id: 'wren', name: 'Wren', cls: 'Light launcher', blurb: 'Small, quick and cheap. It punches into space in under two minutes, but reaching orbit takes a careful pilot.',
    dest: ['orbit'], payloadKind: 'sat',
    s1: { len: 16, r: 0.75, dry: 4000, fuel: 36000, Fsl: 700e3, Fvac: 780e3, isp: 300, engines: 1, bell: 1.5 },
    s2: { len: 5, r: 0.75, dry: 900, fuel: 5800, F: 110e3, isp: 340, bell: 1.3 },
    fairLen: 3.6, payload: 300, fairing: 200, fins: true,
    livery: { body: 0xefece4, s2: 0xefece4, band: 0xd8442f, dark: 0x22262e, fair: 0xefece4 } },
  { id: 'kestrel', name: 'Kestrel', cls: 'Medium launcher', blurb: 'The workhorse. Nine-engine-class booster with grid fins, comfortable margins to low Earth orbit.',
    dest: ['orbit'], payloadKind: 'sat',
    s1: { len: 36, r: 1.85, dry: 22000, fuel: 210000, Fsl: 5.8e6, Fvac: 6.4e6, isp: 320, engines: 3, bell: 2.6 },
    s2: { len: 12, r: 1.85, dry: 4500, fuel: 42000, F: 950e3, isp: 365, bell: 3 },
    fairLen: 10, payload: 2500, fairing: 1500, gridFins: true, legs: true,
    livery: { body: 0xf2f0ea, s2: 0xf2f0ea, band: 0x1d2129, dark: 0x22262e, fair: 0xf2f0ea } },
  { id: 'heron', name: 'Heron', cls: 'Moon rocket', blurb: 'An orange-tanked heavy lifter carrying a two-crew lunar lander inside its nose. Your ticket to the Moon.',
    dest: ['orbit', 'moon'], payloadKind: 'moon',
    s1: { len: 46, r: 2.6, dry: 30000, fuel: 380000, Fsl: 10.5e6, Fvac: 11.4e6, isp: 320, engines: 5, bell: 3.2 },
    s2: { len: 18, r: 2.6, dry: 6000, fuel: 100000, F: 1.8e6, isp: 365, bell: 3.6 },
    fairLen: 15, payload: 12000, fairing: 2500,
    livery: { body: 0xc9692c, s2: 0xf0eee8, band: 0x1d2129, dark: 0x22262e, fair: 0xf0eee8 } },
  { id: 'condor', name: 'Condor', cls: 'Super-heavy', blurb: 'Steel super-heavy with two strap-on boosters. It carries a Mars lander with a heat shield and can go anywhere.',
    dest: ['orbit', 'moon', 'mars'], payloadKind: 'mars', boosters: { n: 2, r: 1.9, len: 40 },
    s1: { len: 60, r: 4.2, dry: 60000, fuel: 900000, Fsl: 24e6, Fvac: 26e6, isp: 325, engines: 7, bell: 3.6 },
    s2: { len: 24, r: 4.2, dry: 10000, fuel: 160000, F: 3.2e6, isp: 370, bell: 4.5 },
    fairLen: 22, payload: 25000, fairing: 4000, gridFins: true,
    livery: { body: 0xb7bcc4, s2: 0xc5cad1, band: 0x1a1d23, dark: 0x22262e, fair: 0xc5cad1 } },
  { id: 'seraph', name: 'Seraph', cls: 'Plasma starship', blurb: 'A single-stage starship powered by a plasma reactor built from stolen alien technology. Its light-speed drive can take you to another star.',
    dest: ['orbit', 'moon', 'mars', 'proxima'], payloadKind: 'none', single: true,
    s1: { len: 42, r: 3.2, dry: 70000, fuel: 120000, Fsl: 4.6e6, Fvac: 5.0e6, isp: 2600, engines: 3, bell: 2.4 },
    s2: { len: 0, r: 3.2, dry: 0, fuel: 0, F: 1, isp: 1, bell: 0.1 },
    fairLen: 10, payload: 20000, fairing: 0,
    livery: { body: 0xe9ecf0, s2: 0xe9ecf0, band: 0x3ad8ff, dark: 0x1c2028, fair: 0xe9ecf0 } }
];
for (const R of ROCKETS) {
  R.md1 = R.s1.Fvac / (R.s1.isp * g0);
  R.md2 = R.s2.F / (R.s2.isp * g0);
  R.cda1 = 0.35 * Math.PI * R.s1.r * R.s1.r * (R.boosters ? 1.7 : 1);
  R.cda2 = 0.35 * Math.PI * R.s2.r * R.s2.r;
  R.is = R.s1.r * 1.3;
  R.sepOff = R.s1.len + R.is;
  R.totalLen = R.sepOff + R.s2.len + R.fairLen;
  R.liftMass = R.s1.dry + R.s1.fuel + R.s2.dry + R.s2.fuel + R.payload + R.fairing;
}

const BODIES = {
  moon: { id: 'moon', name: 'Moon', base: 'Moon base', day: 'Day', g: 1.62, R: 1737400,
    lander: { dry: 7000, fuel: 8000, F: 45000, isp: 311 }, travelDays: 3.2, solar: 3 },
  mars: { id: 'mars', name: 'Mars', base: 'Mars colony', day: 'Sol', g: 3.71, R: 3389500,
    lander: { dry: 12000, fuel: 13000, F: 190000, isp: 330 }, travelDays: 259, solar: 2 },
  proxima: { id: 'proxima', name: 'Proxima b', base: 'Proxima outpost', day: 'Cycle', g: 8.2, R: 7.16e6,
    lander: { dry: 12000, fuel: 14000, F: 440000, isp: 420 }, travelDays: 1548, solar: 1.5 }
};

/* ---------- launch: planar flight over a spherical Earth ---------- */
function lpNew(R) {
  return { phase: 'pad', met: 0, th: 0, h: 0, vx: 0, vy: 0, p: 0, thr: 1, spool: 0, engine: false,
    stage: 1, f1: R.s1.fuel, f2: R.s2.fuel, fairing: true, pro: false, auto: false, ign: 0, armT: 0,
    flags: {}, maxQ: 0, maxV: 0, maxG: 1, maxH: 0, overload: 0, load: 0, q: 0, mach: 0, g: 1,
    rho: 1.225, pr: 1, ap: null, pe: null, esc: false, dead: false, reason: '', tf: 0, ev: [], umb: 0 };
}
function lpMass(S, R) { return (S.stage === 1 ? R.s1.dry + S.f1 : 0) + R.s2.dry + S.f2 + R.payload + (S.fairing ? R.fairing : 0); }
function lpEv(S, type, text) { S.ev.push({ type, text }); }
function lpSeparate(S, R) {
  const sp = Math.sin(S.p), cp = Math.cos(S.p), r = RE + S.h;
  const half = R.s1.len / 2;
  const deb = { kind: 's1', th: S.th + sp * half / r, h: S.h + cp * half, vx: S.vx - sp * 3, vy: S.vy - cp * 3, p: S.p, vr: (Math.random() - 0.5) * 0.18, t: 0, cda: 14 * R.s1.r, m: R.s1.dry + S.f1 };
  S.th += sp * R.sepOff / r; S.h += cp * R.sepOff; S.vx += sp * 1.5; S.vy += cp * 1.5;
  S.stage = 2; S.spool = 0; S.ign = 1.2; S.engine = true; S.armT = 0;
  lpEv(S, 'sep', S.f1 > 0 ? 'Stage separation (fuel left)' : 'Stage separation');
  return deb;
}
function lpFairing(S, R) {
  const sp = Math.sin(S.p), cp = Math.cos(S.p), r = RE + S.h;
  const base = (S.stage === 1 ? R.sepOff : 0) + R.s2.len + R.fairLen / 2;
  const out = [];
  for (const side of [-1, 1]) {
    out.push({ kind: side < 0 ? 'fl' : 'fr', th: S.th + sp * base / r, h: S.h + cp * base, vx: S.vx + cp * side * 5, vy: S.vy - sp * side * 5, p: S.p, vr: side * 0.35, t: 0, cda: 4, m: R.fairing / 2 });
  }
  S.fairing = false;
  lpEv(S, 'fairing', 'Payload fairing jettisoned');
  return out;
}
function lpOrbit(S) {
  const rr = RE + S.h, v2 = S.vx * S.vx + S.vy * S.vy, E = v2 / 2 - MU / rr, hA = rr * S.vx;
  if (E < 0) {
    const a = -MU / (2 * E), e = Math.sqrt(Math.max(0, 1 + 2 * E * hA * hA / (MU * MU)));
    S.ap = a * (1 + e) - RE; S.pe = a * (1 - e) - RE; S.esc = false;
  } else { S.esc = true; S.ap = Infinity; S.pe = null; }
}
// input: {man: -1..1}
function lpStep(S, R, dt, inp, debrisOut) {
  const F = S.flags;
  if (S.dead || S.phase === 'landed') { S.tf = 0; return; }
  if (S.armT > 0) S.armT -= dt;
  const hh = Math.max(0, S.h);
  const v = Math.hypot(S.vx, S.vy);
  const velAng = Math.atan2(S.vx, S.vy);
  const flying = S.phase !== 'pad' && S.phase !== 'spool' && S.phase !== 'ready' && F.liftoff;

  if (S.auto && S.phase === 'flight') lpAuto(S, R, dt, debrisOut);
  else if (inp.man && flying) {
    S.p += inp.man * 0.105 * dt;
    if (S.pro) S.pro = false;
  } else if (S.pro && flying && v > 40) {
    S.p += clamp(angDiff(velAng, S.p), -0.22 * dt, 0.22 * dt);
  }
  S.p = angDiff(S.p, 0);

  if (S.ign > 0) { S.ign -= dt; if (S.ign <= 0) { S.ign = 0; lpEv(S, 'ign2', 'Stage 2 ignition'); } }
  const hasFuel = S.stage === 1 ? S.f1 > 0 : S.f2 > 0;
  const lit = S.engine && hasFuel && S.ign <= 0;
  if (lit) S.spool = Math.min(1, S.spool + dt / (S.stage === 1 ? 2.4 : 0.9));
  else S.spool = Math.max(0, S.spool - dt * 2.5);
  const tf = S.thr * S.spool;
  S.tf = hasFuel ? tf : 0;

  const pr = hh > 160000 ? 0 : Math.exp(-hh / 8400);
  const rho = 1.225 * pr;
  let T = 0, md = 0;
  if (hasFuel && tf > 0) {
    if (S.stage === 1) { T = (R.s1.Fvac - (R.s1.Fvac - R.s1.Fsl) * pr) * tf; md = R.md1 * tf; }
    else { T = R.s2.F * tf * (1 - 0.55 * pr); md = R.md2 * tf; }
  }
  if (md > 0) {
    if (S.stage === 1) { S.f1 -= md * dt; if (S.f1 <= 0) { S.f1 = 0; if (!F.meco) { F.meco = 1; lpEv(S, 'meco', 'Stage 1 burnout'); } } }
    else { S.f2 -= md * dt; if (S.f2 <= 0) { S.f2 = 0; if (!F.seco) { F.seco = 1; lpEv(S, 'seco', 'Upper stage out of fuel'); } } }
  }
  if (S.phase === 'spool' && S.spool >= 1) { S.phase = 'ready'; lpEv(S, 'full', 'Full thrust, clamps holding'); }

  const mass = lpMass(S, R);
  const cda = S.stage === 1 ? R.cda1 : R.cda2;
  const r = RE + hh, g = MU / (r * r);
  const D = 0.5 * rho * v * v * cda;
  const sp = Math.sin(S.p), cp = Math.cos(S.p);
  let fx = T * sp, fy = T * cp;
  if (v > 0.01) { fx -= D * S.vx / v; fy -= D * S.vy / v; }
  const ax = fx / mass - S.vx * S.vy / r;
  const ay = fy / mass - g + S.vx * S.vx / r;
  S.q = 0.5 * rho * v * v; S.rho = rho; S.pr = pr; S.mach = v / soundSpeed(hh);

  if (S.phase === 'pad' || S.phase === 'spool' || S.phase === 'ready') { S.g = 1; return; }

  S.met += dt;
  S.umb = Math.min(1, S.umb + dt / 1.6);
  S.vx += ax * dt; S.vy += ay * dt;
  S.th += S.vx / (RE + Math.max(0, S.h)) * dt; S.h += S.vy * dt;

  if (S.h <= 0) {
    if (!F.liftoff) { S.h = 0; if (S.vy < 0) S.vy = 0; S.vx = 0; }
    else {
      const imp = Math.hypot(S.vx, S.vy);
      S.h = 0;
      if (imp > 7) { S.dead = true; S.reason = 'crash'; S.impact = imp; lpEv(S, 'crash', 'Impact'); return; }
      S.vx = 0; S.vy = 0; S.phase = 'landed'; S.engine = false; lpEv(S, 'landed', 'Touchdown'); return;
    }
  }
  const grounded = S.h <= 0.01 && !F.liftoff;
  S.g = grounded ? 1 : Math.hypot(fx, fy) / mass / g0;
  S.maxG = Math.max(S.maxG, S.g); S.maxV = Math.max(S.maxV, v); S.maxH = Math.max(S.maxH, S.h); S.maxQ = Math.max(S.maxQ, S.q);

  if (v > 30 && F.liftoff) S.load = S.q * Math.sin(Math.abs(angDiff(velAng, S.p))) / 1000; else S.load = 0;
  if (S.load > 9) { S.overload += dt; if (S.overload > 0.5) { S.dead = true; S.reason = 'breakup'; lpEv(S, 'breakup', 'Vehicle broke apart'); return; } }
  else S.overload = Math.max(0, S.overload - dt);

  lpOrbit(S);
  if (!F.liftoff && S.h > 1) { F.liftoff = 1; lpEv(S, 'liftoff', 'Liftoff'); }
  if (!F.tower && S.h > R.totalLen + 10) { F.tower = 1; lpEv(S, 'tower', 'Tower cleared'); }
  if (!F.mach && S.mach >= 1) { F.mach = 1; lpEv(S, 'mach', 'Supersonic, Mach 1'); }
  if (!F.maxq && S.maxQ > 8000 && S.q < S.maxQ * 0.96 && S.vy > 0) { F.maxq = 1; lpEv(S, 'maxq', `Max Q, ${(S.maxQ / 1000).toFixed(1)} kPa`); }
  if (!F.wings && S.h >= 80000) { F.wings = 1; lpEv(S, 'wings', '80 km, astronaut wings altitude'); }
  if (!F.space && S.h >= 100000) { F.space = 1; lpEv(S, 'space', 'Crossed the Kármán line'); }
  if (S.fairing && S.h >= 105000 && debrisOut) for (const d of lpFairing(S, R)) debrisOut.push(d);
  if (!F.orbit && S.h >= 100000 && S.pe !== null && S.pe >= 100000) { F.orbit = 1; lpEv(S, 'orbit', 'Orbit achieved'); }
  if (!F.esc && S.esc && S.h > 100000) { F.esc = 1; lpEv(S, 'esc', 'Escape velocity reached'); }
}
// flight computer: gravity turn, auto-staging, circularise above 140 km
function lpAuto(S, R, dt, debrisOut) {
  const v = Math.hypot(S.vx, S.vy), velAng = Math.atan2(S.vx, S.vy);
  const ap = S.ap === null ? 0 : S.ap;
  let target, gmax = 4;
  if (S.h < 900 || v < 60) target = 0;
  else if (ap < 150000 && S.h < 70000) {
    target = Math.min(1.38, 1.42 * Math.pow((S.h - 900) / 55000, 0.45));
    if (S.q > 2500) target = clamp(target, velAng - 0.06, velAng + 0.06);
  } else {
    const vyDes = clamp((150000 - S.h) / 40, -80, 120);
    target = Math.PI / 2 - clamp((vyDes - S.vy) * 0.0025, -0.25, 0.55);
    if (S.q > 2500) target = clamp(target, velAng - 0.06, velAng + 0.06);
    gmax = 2.5;
  }
  S.p += clamp(angDiff(target, S.p), -0.2 * dt, 0.2 * dt);
  const mass = lpMass(S, R), F = S.stage === 1 ? R.s1.Fvac : R.s2.F;
  S.thr = Math.min(1, gmax * g0 * mass / F);
  if (S.pe !== null && S.pe > 120000) { S.thr = 0; if (S.stage === 2) S.engine = false; S.auto = false; lpEv(S, 'autodone', 'Autopilot: orbit reached, engine off'); }
  if (S.stage === 1 && S.f1 <= 0 && S.spool < 0.05 && debrisOut) debrisOut.push(lpSeparate(S, R));
}
function lpDebrisStep(d, dt) {
  const hh = Math.max(0, d.h), r = RE + hh, rho = hh > 160000 ? 0 : 1.225 * Math.exp(-hh / 8400);
  const v = Math.hypot(d.vx, d.vy), D = 0.5 * rho * v * v * d.cda, g = MU / (r * r);
  let ax = -d.vx * d.vy / r, ay = -g + d.vx * d.vx / r;
  if (v > 0.01) { ax -= D * d.vx / v / d.m; ay -= D * d.vy / v / d.m; }
  d.vx += ax * dt; d.vy += ay * dt; d.th += d.vx / r * dt; d.h += d.vy * dt; d.p += d.vr * dt; d.t += dt;
}

/* ---------- powered landing on the Moon or Mars ---------- */
function ldNew(B) {
  return { x: -440, y: 2300, z: 90, vx: 17, vy: -46, vz: -3, tx: 0, tz: 0, cx: 0, cz: 0, thr: 0, fuel: B.lander.fuel,
    landed: false, crashed: false, auto: false, t: 0, alt: 2300, impact: 0 };
}
// inp: {tx, tz: tilt command -1..1 in world x/z, thr: 0..1}
function ldStep(L, B, dt, inp, groundAt) {
  if (L.landed || L.crashed) return;
  L.t += dt;
  const m = B.lander.dry + L.fuel;
  if (L.auto) ldAuto(L, B, groundAt);
  else { L.cx = inp.tx * 0.42; L.cz = inp.tz * 0.42; L.thr = inp.thr; }
  const rate = 1.3 * dt;
  L.tx += clamp(L.cx - L.tx, -rate, rate); L.tz += clamp(L.cz - L.tz, -rate, rate);
  let thr = L.fuel > 0 ? clamp(L.thr, 0, 1) : 0;
  const sx = Math.sin(L.tx), sz = Math.sin(L.tz), cy = Math.sqrt(Math.max(0, 1 - sx * sx - sz * sz));
  const a = B.lander.F * thr / m;
  L.vx += sx * a * dt; L.vz += sz * a * dt; L.vy += (cy * a - B.g) * dt;
  L.fuel = Math.max(0, L.fuel - B.lander.F / (B.lander.isp * g0) * thr * dt);
  L.x += L.vx * dt; L.y += L.vy * dt; L.z += L.vz * dt;
  L.thrEff = thr;
  const gnd = groundAt(L.x, L.z);
  L.alt = L.y - gnd;
  if (L.alt <= 0) {
    const hs = Math.hypot(L.vx, L.vz), tilt = Math.acos(clamp(cy, -1, 1));
    L.impact = -L.vy; L.hsImpact = hs;
    L.y = gnd; L.alt = 0;
    if (L.vy > -3.6 && hs < 2.6 && tilt < 0.27) { L.landed = true; } else { L.crashed = true; }
    L.vx = L.vy = L.vz = 0; L.thr = 0; L.thrEff = 0;
  }
}
function ldAuto(L, B, groundAt) {
  const alt = L.y - groundAt(L.x, L.z);
  const m = B.lander.dry + L.fuel, amax = B.lander.F / m;
  const dist = Math.hypot(L.x, L.z);
  let vdx = 0, vdz = 0;
  if (dist > 1.5 && alt > 20) { const vd = clamp(dist * 0.07, 0, 24); vdx = -L.x / dist * vd; vdz = -L.z / dist * vd; }
  const ax = clamp((vdx - L.vx) * 0.55, -amax * 0.4, amax * 0.4), az = clamp((vdz - L.vz) * 0.55, -amax * 0.4, amax * 0.4);
  L.cx = clamp(Math.asin(clamp(ax / amax, -0.4, 0.4)), -0.4, 0.4);
  L.cz = clamp(Math.asin(clamp(az / amax, -0.4, 0.4)), -0.4, 0.4);
  const ab = Math.max(0.3, amax * 0.6 - B.g);
  let vyDes = -Math.sqrt(2 * ab * Math.max(0, alt - 6));
  vyDes = Math.max(vyDes, -70);
  if (dist > 140 && alt < 260) vyDes = Math.max(vyDes, (200 - alt) * 0.1);
  if (alt < 14) vyDes = -1.4;
  const cy = Math.cos(Math.hypot(L.tx, L.tz));
  const ayDes = (vyDes - L.vy) * 1.5 + B.g;
  L.thr = clamp(ayDes / (amax * Math.max(0.6, cy)), 0, 1);
}
/* ================= rendering setup ================= */
const $ = id => document.getElementById(id);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(pointer: coarse)').matches;
function fatal(msg) { const d = document.createElement('div'); d.className = 'nogl'; d.textContent = msg; document.body.append(d); throw new Error(msg); }
if (!window.THREE) fatal('The 3D engine could not load. Check your connection and reload the page.');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
} catch (e) { fatal('This game needs WebGL, which your browser or device has turned off.'); }
renderer.setPixelRatio(Math.min(COARSE ? 1.75 : 2, window.devicePixelRatio || 1));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1e13);
const skyCam = new THREE.PerspectiveCamera(50, 1, 1, 3e4);
const U_PSCALE = { value: 500 };
let VW = 1, VH = 1;
function onResize() {
  VW = window.innerWidth; VH = window.innerHeight;
  renderer.setSize(VW, VH, false);
  camera.aspect = skyCam.aspect = VW / VH;
  camera.updateProjectionMatrix(); skyCam.updateProjectionMatrix();
  U_PSCALE.value = VH * renderer.getPixelRatio() / (2 * Math.tan(50 * Math.PI / 360));
  if (typeof gfxResize === 'function') gfxResize();
}
addEventListener('resize', onResize);
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TMP = V3(), TMP2 = V3();

/* ================= noise ================= */
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const PERM = (() => { const r = mulberry(91), a = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } const p = new Uint8Array(512); for (let i = 0; i < 512; i++) p[i] = a[i & 255]; return p; })();
function n3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let u = x - xi, v = y - yi, w = z - zi;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
  const X = xi & 255, Y = yi & 255, Z = zi & 255, P = PERM;
  const A = P[X] + Y, B = P[X + 1] + Y;
  const AA = P[A] + Z, AB = P[A + 1] + Z, BA = P[B] + Z, BB = P[B + 1] + Z;
  const x1 = P[AA] + (P[BA] - P[AA]) * u, x2 = P[AB] + (P[BB] - P[AB]) * u;
  const x3 = P[AA + 1] + (P[BA + 1] - P[AA + 1]) * u, x4 = P[AB + 1] + (P[BB + 1] - P[AB + 1]) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return (y1 + (y2 - y1) * w) / 255;
}
function fbm3(x, y, z, o) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * n3(x * f, y * f, z * f); n += a; f *= 2.03; a *= 0.5; } return s / n; }
function n2(x, y) { return n3(x, y, 0.37); }
function fbm2(x, y, o) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * n3(x * f, y * f, 0.37 + i * 7.1); n += a; f *= 2.03; a *= 0.5; } return s / n; }
// tileable 2D noise (period p cells)
function n2p(x, y, p) {
  const xi = Math.floor(x), yi = Math.floor(y); let u = x - xi, v = y - yi; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const h = (i, j) => PERM[(PERM[((i % p) + p) % p] + ((j % p) + p) % p) & 511];
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) / 255;
}

/* ================= procedural textures ================= */
function pixCanvas(w, h, fill) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), img = x.createImageData(w, h); fill(img.data, w, h); x.putImageData(img, 0, 0); return c;
}
function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
}
const SITE = V3(0, Math.cos(62 * Math.PI / 180), -Math.sin(62 * Math.PI / 180)); // launch site on the unrotated sphere, 28° N
function sphereLoop(w, h, d, fn) {
  let k = 0;
  for (let j = 0; j < h; j++) {
    const th = (j + 0.5) / h * Math.PI, st = Math.sin(th), ct = Math.cos(th);
    for (let i = 0; i < w; i++, k += 4) {
      const ph = (i + 0.5) / w * Math.PI * 2;
      fn(d, k, -Math.cos(ph) * st, ct, Math.sin(ph) * st);
    }
  }
}
const texCache = {};
function earthTextures() {
  if (texCache.earth) return texCache.earth;
  const W = COARSE ? 768 : 1024, H = W / 2;
  const color = pixCanvas(W, H, (d, w, h) => sphereLoop(w, h, d, (d, k, x, y, z) => {
    let e = fbm3(x * 1.7 + 3, y * 1.7, z * 1.7, 5) - 0.5 + 0.07 * (n3(x * 9, y * 9, z * 9) - 0.5);
    const dx = x - SITE.x, dy = y - SITE.y, dz = z - SITE.z;
    e += 0.3 * Math.exp(-(dx * dx + dy * dy + dz * dz) / 0.012);
    const ex = dx - 0.13; e -= 0.22 * Math.exp(-(ex * ex + dy * dy + dz * dz) / 0.01);
    const lat = Math.abs(y);
    let r, g, b;
    if (e < 0.02) {
      const t = clamp(-e * 4.5, 0, 1);
      r = lerp(30, 6, t); g = lerp(96, 28, t); b = lerp(146, 70, t);
    } else {
      const m = fbm3(x * 3 + 10, y * 3, z * 3, 4);
      const dry = clamp((m - 0.42) * 3, 0, 1) * clamp(1 - Math.abs(lat - 0.36) * 3.2, 0, 1);
      r = lerp(52, 196, dry); g = lerp(94, 172, dry); b = lerp(46, 118, dry);
      if (e > 0.17) { const t = clamp((e - 0.17) * 5, 0, 1); r = lerp(r, 112, t); g = lerp(g, 98, t); b = lerp(b, 82, t); }
      if (e < 0.04) { r += 14; g += 12; b += 8; }
    }
    if (lat > 0.84 + 0.06 * n3(x * 5, y * 5, z * 5)) { r = 234; g = 240; b = 246; }
    d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
  }));
  const CW = COARSE ? 512 : 1024;
  const clouds = pixCanvas(CW, CW / 2, (d, w, h) => sphereLoop(w, h, d, (d, k, x, y, z) => {
    const n = fbm3(x * 2.2 + 20, y * 4.2, z * 2.2, 5);
    const dx = x - SITE.x, dy = y - SITE.y, dz = z - SITE.z;
    const a = ss(0.5, 0.72, n) * (1 - 0.75 * Math.exp(-(dx * dx + dy * dy + dz * dz) / 0.004));
    d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = a * 235;
  }));
  const rough = pixCanvas(512, 256, (d, w, h) => { const src = color.getContext('2d').getImageData(0, 0, color.width, color.height).data, sx = color.width / w; let k = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++, k += 4) { const q = ((Math.floor(j * sx) * color.width) + Math.floor(i * sx)) * 4, ocean = src[q + 2] > src[q] + 30 && src[q + 2] > src[q + 1] - 10; const v = ocean ? 95 : 245; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255; } });
  return texCache.earth = { color: toTex(color), clouds: toTex(clouds), rough: toTex(rough, false) };
}
function moonTexture() {
  if (texCache.moon) return texCache.moon;
  const W = 1024, H = 512;
  const c = pixCanvas(W, H, (d, w, h) => sphereLoop(w, h, d, (d, k, x, y, z) => {
    const m = fbm3(x * 1.4 + 5, y * 1.4, z * 1.4, 4), f = fbm3(x * 8, y * 8, z * 8, 4);
    let g = 150 + (f - 0.5) * 70;
    if (m > 0.53) g *= lerp(1, 0.58, ss(0.53, 0.6, m));
    d[k] = g; d[k + 1] = g * 0.98; d[k + 2] = g * 0.95; d[k + 3] = 255;
  }));
  const x = c.getContext('2d'), r = mulberry(4);
  for (let i = 0; i < 320; i++) {
    const cx = r() * W, cy = H * 0.08 + r() * H * 0.84, rad = 2 + Math.pow(r(), 3) * 34;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(40,40,40,.35)'); g.addColorStop(0.75, 'rgba(60,60,60,.18)'); g.addColorStop(0.9, 'rgba(235,235,230,.35)'); g.addColorStop(1, 'rgba(235,235,230,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rad, rad, 0, 0, Math.PI * 2); x.fill();
  }
  return texCache.moon = toTex(c);
}
function marsTexture() {
  if (texCache.mars) return texCache.mars;
  const c = pixCanvas(1024, 512, (d, w, h) => sphereLoop(w, h, d, (d, k, x, y, z) => {
    const n = fbm3(x * 2 + 9, y * 2, z * 2, 5), f = fbm3(x * 9, y * 9, z * 9, 3);
    let r = 188 + (f - 0.5) * 60, g = 92 + (f - 0.5) * 34, b = 52 + (f - 0.5) * 20;
    if (n > 0.55) { const t = ss(0.55, 0.64, n) * 0.45; r *= 1 - t; g *= 1 - t; b *= 1 - t * 0.7; }
    if (Math.abs(y) < 0.12 && x > 0.2 && Math.abs(y + 0.05 + 0.04 * Math.sin(z * 9)) < 0.018) { r *= 0.6; g *= 0.55; b *= 0.6; }
    if (Math.abs(y) > 0.9 + 0.04 * n3(x * 6, y * 6, z * 6)) { r = 238; g = 232; b = 226; }
    d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
  }));
  return texCache.mars = toTex(c);
}
function detailTexture() {
  if (texCache.detail) return texCache.detail;
  const S = 256, P = 16;
  const c = pixCanvas(S, S, (d, w, h) => {
    let k = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++, k += 4) {
      const u = i / w * P, v = j / h * P;
      const n = 0.5 * n2p(u, v, P) + 0.3 * n2p(u * 2, v * 2, P * 2) + 0.2 * n2p(u * 4, v * 4, P * 4);
      const g = 196 + (n - 0.5) * 70 + (Math.random() - 0.5) * 34;
      d[k] = d[k + 1] = d[k + 2] = clamp(g, 0, 255); d[k + 3] = 255;
    }
  });
  const x = c.getContext('2d'), r = mulberry(21);
  for (let i = 0; i < 140; i++) { const px = r() * S, py = r() * S, rad = 1 + Math.pow(r(), 3) * 9;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { const gg = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, rad); gg.addColorStop(0, 'rgba(60,60,60,.45)'); gg.addColorStop(0.7, 'rgba(90,90,90,.2)'); gg.addColorStop(0.85, 'rgba(255,255,255,.28)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gg; x.beginPath(); x.arc(px + ox, py + oy, rad, 0, Math.PI * 2); x.fill(); } }
  for (let i = 0; i < 900; i++) { const px = r() * S, py = r() * S, s = 0.6 + r() * 1.6; x.fillStyle = `rgba(${r() < 0.5 ? '40,40,40' : '255,255,255'},${0.15 + r() * 0.3})`; x.fillRect(px, py, s, s); }
  const t = toTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return texCache.detail = t;
}
function scrubTexture() {
  if (texCache.scrub) return texCache.scrub;
  const S = 256, P = 8;
  const c = pixCanvas(S, S, (d, w, h) => {
    let k = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++, k += 4) {
      const n = 0.6 * n2p(i / w * P, j / h * P, P) + 0.4 * n2p(i / w * P * 4, j / h * P * 4, P * 4);
      const t = clamp((n - 0.35) * 2, 0, 1);
      d[k] = lerp(70, 128, t) + (Math.random() - .5) * 14; d[k + 1] = lerp(96, 116, t) + (Math.random() - .5) * 14; d[k + 2] = lerp(52, 74, t); d[k + 3] = 255;
    }
  });
  const t = toTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return texCache.scrub = t;
}
function glowTexture() {
  if (texCache.glow) return texCache.glow;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,.7)'); g.addColorStop(0.45, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return texCache.glow = new THREE.CanvasTexture(c);
}

/* ================= shaders ================= */
const LOGV = '\n#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const LOGF = '\n#include <logdepthbuf_pars_fragment>\n';
function plumeMaterial(core, edge) {
  return new THREE.ShaderMaterial({
    uniforms: { uCore: { value: new THREE.Color(core) }, uEdge: { value: new THREE.Color(edge) }, uI: { value: 0 }, uLen: { value: 10 }, uEnd: { value: 0.5 }, uBulge: { value: 0 }, uDia: { value: 0 }, uNR: { value: 1 }, uT: { value: 0 } },
    vertexShader: `${LOGV}
      uniform float uLen; uniform float uEnd; uniform float uBulge;
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){
        float t = -position.y;
        float rf = mix(1.0, uEnd, pow(t, 0.75)) + uBulge * sin(t * 3.14159);
        vec3 p = vec3(position.x * rf, position.y * uLen, position.z * rf);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vT = t; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `${LOGF}
      uniform vec3 uCore; uniform vec3 uEdge; uniform float uI; uniform float uDia; uniform float uLen; uniform float uNR; uniform float uT;
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){
        #include <logdepthbuf_fragment>
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.2);
        float fl = 0.9 + 0.1 * sin(uT * 61.0 + vT * 23.0);
        float a = pow(1.0 - vT, 1.4) * uI * edge * fl;
        float d = pow(0.5 + 0.5 * cos(vT * uLen / (uNR * 2.4) * 6.2832), 10.0) * uDia * (1.0 - vT * 1.6);
        vec3 c = mix(uCore, uEdge, smoothstep(0.0, 0.7, vT)) + vec3(1.0, 0.95, 0.85) * max(d, 0.0);
        gl_FragColor = vec4(c * (a + max(d, 0.0) * 0.6), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
}
const PLUME_GEO = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 28, 14, true); g.translate(0, -0.5, 0); return g; })();
function makePlume(nozzleR, vacuumStyle, coreC, edgeC) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(PLUME_GEO, plumeMaterial(coreC ? 0xbfefff : 0xffc88a, edgeC || (vacuumStyle ? 0x7a6cff : 0xff5a1a)));
  const core = new THREE.Mesh(PLUME_GEO, plumeMaterial(coreC || 0xfff6e8, coreC ? 0x7fd3ff : 0xffb060));
  outer.scale.set(nozzleR, 1, nozzleR); core.scale.set(nozzleR * 0.62, 1, nozzleR * 0.62);
  outer.frustumCulled = core.frustumCulled = false;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa860, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  g.add(outer, core, glow); g.userData = { outer, core, glow, nr: nozzleR };
  g.visible = false;
  return g;
}
function setPlume(pl, tf, pr, t) {
  const u = pl.userData, vac = 1 - pr;
  pl.visible = tf > 0.02;
  if (!pl.visible) return;
  const len = (u.nr * 9 + u.nr * 14 * tf) * (1 + 1.6 * vac) * (RM ? 1 : 0.94 + Math.random() * 0.12);
  for (const [m, lf, wi] of [[u.outer, 1, 0.75], [u.core, 0.45, 1]]) {
    const un = m.material.uniforms;
    un.uI.value = tf * wi; un.uLen.value = len * lf; un.uEnd.value = lerp(0.45, 5.5, vac * vac) * (lf < 1 ? 0.6 : 1); un.uBulge.value = vac * 0.7 * lf;
    un.uDia.value = lf < 1 ? clamp(pr * 1.6 - 0.2, 0, 1) * tf : 0; un.uNR.value = u.nr; un.uT.value = t;
  }
  const gs = u.nr * (5 + 7 * vac) * tf;
  u.glow.scale.set(gs, gs, 1); u.glow.position.y = -u.nr * 0.6; u.glow.material.opacity = 0.75 * tf;
}
// soft particle points (smoke, dust, fire)
function particleSystem(max, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max), col = new Float32Array(max * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: U_PSCALE },
    vertexShader: `${LOGV}
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale;
      varying float vA; varying vec3 vC;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 1.0, 900.0); gl_Position = projectionMatrix * mv; vA = aAlpha; vC = aColor;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `${LOGF}
      varying float vA; varying vec3 vC;
      void main(){
        #include <logdepthbuf_fragment>
        vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d) * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC * (${additive ? 'a' : '1.0'}), ${additive ? '1.0' : 'a'}); }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  return { pts, pos, size, alpha, col, geo, max, list: [] };
}
function flushParticles(ps, n) {
  const g = ps.geo; g.setDrawRange(0, n);
  for (const k of ['position', 'aSize', 'aAlpha', 'aColor']) g.attributes[k].needsUpdate = true;
}

/* ================= sky scene (rendered first, behind everything) ================= */
const skyScene = new THREE.Scene();
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(2e4, 48, 24), new THREE.ShaderMaterial({
  uniforms: { uTop: { value: new THREE.Color(0x000000) }, uHor: { value: new THREE.Color(0x000000) }, uBot: { value: new THREE.Color(0x000000) }, uSun: { value: V3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) }, uHalo: { value: 0.0 }, uDisc: { value: 1.0 } },
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBot; uniform vec3 uSun; uniform vec3 uSunCol; uniform float uHalo; uniform float uDisc; varying vec3 vD;
    void main(){ vec3 d = normalize(vD); float y = d.y;
      vec3 c = y > 0.0 ? mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.45)) : mix(uHor, uBot, pow(clamp(-y, 0.0, 1.0), 0.35));
      float s = max(dot(d, normalize(uSun)), 0.0);
      c += uSunCol * (smoothstep(0.99985, 0.99993, s) * 6.0 * uDisc + pow(s, 900.0) * 2.0 + pow(s, 14.0) * uHalo);
      gl_FragColor = vec4(c, 1.0); }`,
  side: THREE.BackSide, depthWrite: false, depthTest: false
}));
skyDome.renderOrder = -10;
skyScene.add(skyDome);
const starsMat = new THREE.ShaderMaterial({
  uniforms: { uO: { value: 1 }, uPR: { value: renderer.getPixelRatio() } },
  vertexShader: `attribute float aS; attribute float aB; uniform float uPR; varying float vB; void main(){ vB = aB; gl_PointSize = aS * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uO; varying float vB; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)) * vB * uO; gl_FragColor = vec4(vec3(0.92, 0.95, 1.0) * a, 1.0); }`,
  blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
});
const stars = (() => {
  const N = 4200, r = mulberry(11), p = new Float32Array(N * 3), s = new Float32Array(N), b = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let x, y, z, d; do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; d = x * x + y * y + z * z; } while (d > 1 || d < 0.01);
    d = Math.sqrt(d); const band = Math.abs(y / d) < 0.18 && r() < 0.5;
    p[i * 3] = x / d * 1.5e4; p[i * 3 + 1] = (band ? y * 0.3 : y) / d * 1.5e4; p[i * 3 + 2] = z / d * 1.5e4;
    const m = Math.pow(r(), 6); s[i] = 1.2 + m * 3.6; b[i] = 0.3 + m * 0.7 + r() * 0.2;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1)); g.setAttribute('aB', new THREE.BufferAttribute(b, 1));
  const pts = new THREE.Points(g, starsMat); pts.renderOrder = -9; pts.frustumCulled = false; return pts;
})();
skyScene.add(stars);
const skyLight = new THREE.DirectionalLight(0xffffff, 1.6);
skyScene.add(skyLight, new THREE.AmbientLight(0xffffff, 0.02));
const farGroup = new THREE.Group(); skyScene.add(farGroup);
function setSky(cfg) {
  const u = skyDome.material.uniforms;
  u.uTop.value.set(cfg.top); u.uHor.value.set(cfg.hor); u.uBot.value.set(cfg.bot ?? cfg.hor);
  u.uHalo.value = cfg.halo ?? 0; if (cfg.sunCol) u.uSunCol.value.set(cfg.sunCol); else u.uSunCol.value.setRGB(1, 0.95, 0.85); u.uDisc.value = cfg.disc ?? 1;
  starsMat.uniforms.uO.value = cfg.stars ?? 1;
}
function setSkySun(dir) { skyDome.material.uniforms.uSun.value.copy(dir).normalize(); skyLight.position.copy(dir).normalize(); }
// a far-away body drawn in the sky pass at an apparent angular radius
function farBody(tex, radiusDeg, emissive) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, emissive: emissive || 0x000000 }));
  m.userData.deg = radiusDeg; farGroup.add(m); return m;
}
function placeFar(m, dir, dist = 1.2e4) { m.position.copy(dir).normalize().multiplyScalar(dist); const r = dist * Math.tan(m.userData.deg * Math.PI / 180); m.scale.setScalar(r); }

/* ================= model builders ================= */
const std = (color, rough = 0.5, metal = 0.1, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra));
const MAT = {
  dark: std(0x23272f, 0.6, 0.3), engine: std(0x4a4f57, 0.32, 0.85), foil: std(0xd9a640, 0.3, 0.95), white: std(0xeceae4, 0.5, 0.05),
  glass: std(0x0d141c, 0.08, 0.7), panel: std(0x1d3a78, 0.25, 0.7, { emissive: 0x050c22 }), steel: std(0xa9aeb6, 0.35, 0.8),
  amber: std(0xffb547, 0.45, 0.1), redLamp: std(0xff4433, 0.4, 0, { emissive: 0xff2211, emissiveIntensity: 2 })
};
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }
function bellGeo(rt, rb, len) {
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(lerp(rt, rb, Math.pow(t, 0.62)), -t * len)); }
  return new THREE.LatheGeometry(pts, 24);
}
function bodyTexture(color, name, foam) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024;
  const x = c.getContext('2d'); const col = new THREE.Color(color);
  x.fillStyle = '#' + col.getHexString(); x.fillRect(0, 0, 512, 1024);
  if (foam) { for (let i = 0; i < 1024; i += 3) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; x.fillRect(0, i, 512, 3); } }
  x.fillStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < 1024; i += 128) x.fillRect(0, i, 512, 2);
  if (name) {
    x.font = '800 92px "Saira Condensed", "Arial Narrow", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = foam ? 'rgba(20,22,26,.85)' : 'rgba(24,27,33,.88)';
    for (const u of [0.25, 0.75]) { x.save(); x.translate(u * 512, 520); x.rotate(-Math.PI / 2); x.fillText(name.toUpperCase().split('').join(' '), 0, 0); x.restore(); }
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
}
function buildSatellite(r) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(r * 1.1, r * 1.3, r * 1.1), MAT.foil, 0, r * 0.75, 0));
  const pg = new THREE.BoxGeometry(r * 2.2, 0.05, r * 0.9);
  g.add(mesh(pg, MAT.panel, r * 1.7, r * 0.8, 0), mesh(pg, MAT.panel, -r * 1.7, r * 0.8, 0));
  const dish = mesh(new THREE.SphereGeometry(r * 0.45, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), MAT.white, 0, r * 1.45, 0); dish.rotation.x = Math.PI; g.add(dish);
  g.userData.h = r * 1.6;
  return g;
}
function legBetween(g, a, b, rad, mat) {
  const d = TMP.copy(b).sub(a), len = d.length();
  const m = mesh(new THREE.CylinderGeometry(rad, rad, len, 8), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); g.add(m); return m;
}
function buildLander(kind) {
  const g = new THREE.Group();
  if (kind === 'mars' || kind === 'proxima') {
    const hull = std(0xe9e6df, 0.45, 0.15), stripe = std(kind === 'proxima' ? 0x3ad8ff : 0xffb547, 0.5, 0.1);
    g.add(mesh(new THREE.CylinderGeometry(2.6, 2.9, 2.6, 28), hull, 0, 2.6, 0));
    g.add(mesh(new THREE.CylinderGeometry(2.62, 2.62, 0.35, 28), stripe, 0, 3.4, 0));
    g.add(mesh(new THREE.CylinderGeometry(1.0, 2.6, 2.8, 28), hull, 0, 5.3, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.5, 1.0, 0.7, 20), MAT.dark, 0, 7.05, 0));
    const win = mesh(new THREE.BoxGeometry(1.4, 0.55, 0.2), MAT.glass, 0, 5.0, 1.95); win.rotation.x = -0.5; g.add(win);
    g.add(mesh(new THREE.BoxGeometry(1.1, 1.7, 0.2), MAT.dark, 0, 2.55, 2.86));
    g.add(mesh(new THREE.CylinderGeometry(2.95, 2.95, 0.3, 28), std(0x5a4234, 0.8, 0.1), 0, 1.25, 0));
    const b = mesh(bellGeo(0.5, 1.1, 1.1), MAT.engine, 0, 1.15, 0); g.add(b);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
      legBetween(g, V3(ca * 2.6, 2.2, sa * 2.6), V3(ca * 3.9, 0.15, sa * 3.9), 0.14, MAT.steel);
      legBetween(g, V3(ca * 2.2, 1.4, sa * 2.2), V3(ca * 3.9, 0.15, sa * 3.9), 0.09, MAT.steel);
      g.add(mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.14, 14), MAT.steel, ca * 3.9, 0.07, sa * 3.9));
    }
    g.userData = { h: 7.4, foot: 3.9, bellY: 0.05, nozzle: 1.0, hatch: V3(0, 0, 3.3) };
  } else {
    g.add(mesh(new THREE.CylinderGeometry(2.1, 2.1, 1.8, 8), MAT.foil, 0, 2.2, 0));
    g.add(mesh(new THREE.CylinderGeometry(2.14, 2.14, 0.12, 8), MAT.dark, 0, 3.1, 0));
    const cab = mesh(new THREE.CylinderGeometry(1.35, 1.65, 2.0, 6), std(0xb9bcc2, 0.5, 0.4), 0, 4.15, 0); g.add(cab);
    const win = mesh(new THREE.BoxGeometry(0.9, 0.5, 0.15), MAT.glass, 0, 4.5, 1.42); win.rotation.x = -0.25; g.add(win);
    g.add(mesh(new THREE.BoxGeometry(0.85, 1.0, 0.2), MAT.dark, 0, 3.6, 1.55));
    const dish = mesh(new THREE.SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), MAT.white, 0.9, 5.6, -0.6); dish.rotation.x = 2.4; g.add(dish);
    legBetween(g, V3(0.9, 5.15, -0.6), V3(0.9, 5.6, -0.6), 0.04, MAT.steel);
    for (const [x, z] of [[1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5]]) g.add(mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), MAT.dark, x * 0.9, 4.9, z * 0.9));
    g.add(mesh(bellGeo(0.4, 0.85, 1.0), MAT.engine, 0, 1.3, 0));
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      legBetween(g, V3(ca * 1.95, 2.6, sa * 1.95), V3(ca * 3.3, 0.15, sa * 3.3), 0.1, MAT.foil);
      legBetween(g, V3(ca * 1.9, 1.5, sa * 1.9), V3(ca * 3.3, 0.15, sa * 3.3), 0.07, MAT.steel);
      g.add(mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.12, 14), MAT.steel, ca * 3.3, 0.06, sa * 3.3));
    }
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.12), MAT.steel, 0, 0.5 + i * 0.36, 2.55 + i * 0.12));
    g.userData = { h: 5.9, foot: 3.3, bellY: 0.3, nozzle: 0.85, hatch: V3(0, 0, 3.2) };
  }
  return g;
}
function buildRocket(R) {
  if (R.id === 'seraph') return buildSeraph(R);
  const L = R.livery, root = new THREE.Group();
  const s1 = new THREE.Group(), s2 = new THREE.Group(), pay = new THREE.Group();
  const r1 = R.s1.r, len1 = R.s1.len;
  const bodyMat = std(0xffffff, 0.48, 0.08, { map: bodyTexture(L.body, R.name, R.id === 'heron') });
  const darkM = std(L.dark, 0.6, 0.3), bandM = std(L.band, 0.55, 0.1);
  s1.add(mesh(new THREE.CylinderGeometry(r1, r1, len1, 40), bodyMat, 0, len1 / 2, 0));
  s1.add(mesh(new THREE.CylinderGeometry(r1 * 1.01, r1 * 1.01, r1 * 0.9, 40), darkM, 0, r1 * 0.45, 0));
  if (R.id === 'kestrel' || R.id === 'wren') {
    const hg = new THREE.CylinderGeometry(r1 * 1.006, r1 * 1.006, r1 * 0.8, 40, 1, true, 0, Math.PI);
    const a = mesh(hg, bandM, 0, len1 - r1 * 1.6, 0), b = mesh(hg, bandM, 0, len1 - r1 * 2.4, 0); b.rotation.y = Math.PI; s1.add(a, b);
  } else s1.add(mesh(new THREE.CylinderGeometry(r1 * 1.006, r1 * 1.006, r1 * 0.25, 40), bandM, 0, len1 * 0.62, 0));
  const n = R.s1.engines, eb = n === 1 ? r1 * 0.8 : n === 3 ? r1 * 0.42 : r1 * 0.3, ring = n === 3 ? r1 * 0.5 : r1 * 0.62;
  const bg = bellGeo(eb * 0.4, eb, R.s1.bell);
  for (let i = 0; i < n; i++) {
    let x = 0, z = 0;
    if (n === 3) { const a = i / 3 * Math.PI * 2; x = Math.cos(a) * ring; z = Math.sin(a) * ring; }
    else if (n > 3 && i > 0) { const a = (i - 1) / (n - 1) * Math.PI * 2; x = Math.cos(a) * ring; z = Math.sin(a) * ring; }
    s1.add(mesh(bg, MAT.engine, x, 0, z));
  }
  if (R.gridFins) for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, f = mesh(new THREE.BoxGeometry(r1 * 0.7, r1 * 0.08, r1 * 0.55), darkM, Math.cos(a) * r1 * 1.3, len1 - r1 * 0.5, Math.sin(a) * r1 * 1.3); f.rotation.y = -a; s1.add(f); }
  if (R.legs) for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, f = mesh(new THREE.BoxGeometry(r1 * 0.22, len1 * 0.26, r1 * 0.16), darkM, Math.cos(a) * r1 * 1.02, len1 * 0.15, Math.sin(a) * r1 * 1.02); f.rotation.y = -a; s1.add(f); }
  if (R.fins) for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(r1 * 1.4, -r1 * 0.4); shape.lineTo(r1 * 1.4, r1 * 0.6); shape.lineTo(0, r1 * 2.6); shape.lineTo(0, 0);
    const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }); fg.translate(0, 0, -0.03);
    const f = mesh(fg, bandM, Math.cos(a) * r1 * 0.95, r1 * 0.5, Math.sin(a) * r1 * 0.95); f.rotation.y = -a; s1.add(f);
  }
  if (R.boosters) {
    const B = R.boosters, bm = std(0xffffff, 0.48, 0.1, { map: bodyTexture(L.body, '', false) });
    for (const sx of [-1, 1]) {
      const x = sx * (r1 + B.r + 0.15);
      s1.add(mesh(new THREE.CylinderGeometry(B.r, B.r, B.len, 28), bm, x, B.len / 2 + 1, 0));
      s1.add(mesh(new THREE.ConeGeometry(B.r, B.r * 3, 28), bm, x, B.len + 1 + B.r * 1.5, 0));
      s1.add(mesh(bellGeo(B.r * 0.35, B.r * 0.8, R.s1.bell * 0.8), MAT.engine, x, 1, 0));
      s1.add(mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), darkM, x - sx * (B.r + 0.1), B.len * 0.8, 0));
    }
  }
  s1.add(mesh(new THREE.CylinderGeometry(r1, r1, R.is, 40), darkM, 0, len1 + R.is / 2, 0));
  // stage 2
  const r2 = R.s2.r;
  s2.add(mesh(new THREE.CylinderGeometry(r2, r2, R.s2.len, 40), std(L.s2, 0.48, 0.08), 0, R.s2.len / 2, 0));
  s2.add(mesh(new THREE.CylinderGeometry(r2 * 1.006, r2 * 1.006, r2 * 0.18, 40), darkM, 0, r2 * 0.3, 0));
  s2.add(mesh(bellGeo(r2 * 0.22, r2 * 0.7, R.s2.bell), MAT.engine, 0, 0, 0));
  s2.position.y = R.sepOff;
  // payload + fairing
  pay.position.y = R.s2.len; s2.add(pay);
  pay.add(mesh(new THREE.CylinderGeometry(r2 * 0.45, r2 * 0.9, r2 * 0.4, 28), darkM, 0, r2 * 0.2, 0));
  let cargo;
  if (R.payloadKind === 'sat') cargo = buildSatellite(r2 * 0.6);
  else { cargo = buildLander(R.payloadKind); const s = Math.min(r2 * 0.93 / cargo.userData.foot, R.fairLen * 0.8 / cargo.userData.h); cargo.scale.setScalar(s); }
  cargo.position.y = r2 * 0.4; pay.add(cargo);
  const fpts = []; for (let i = 0; i <= 18; i++) { const t = i / 18; fpts.push(new THREE.Vector2(r2 * 1.02 * Math.pow(Math.cos(t * Math.PI / 2), 0.62) + 0.001, t * R.fairLen)); }
  const fairMat = std(L.fair, 0.45, 0.08, { side: THREE.DoubleSide });
  const fL = mesh(new THREE.LatheGeometry(fpts, 28, Math.PI, Math.PI), fairMat), fR = mesh(new THREE.LatheGeometry(fpts, 28, 0, Math.PI), fairMat);
  pay.add(fL, fR);
  // plumes
  const p1 = makePlume(n === 1 ? eb : r1 * 0.95, false); p1.position.y = -R.s1.bell; s1.add(p1);
  const p2 = makePlume(r2 * 0.7, true); p2.position.y = -R.s2.bell; s2.add(p2);
  root.add(s1, s2);
  return { root, s1, s2, pay, fL, fR, p1, p2, cargo };
}
function buildTower(R) {
  const g = new THREE.Group(), H = R.totalLen + 10, w = 6, m = std(0xa2412f, 0.65, 0.4);
  const x0 = -(R.s1.r + (R.boosters ? R.boosters.r * 2 + 0.5 : 0) + 8);
  const post = new THREE.BoxGeometry(0.4, H + 4.3, 0.4);
  for (const [dx, dz] of [[0, 0], [w, 0], [0, w], [w, w]]) g.add(mesh(post, m, x0 - w + dx, (H - 4.3) / 2, -w / 2 + dz));
  const bar = new THREE.BoxGeometry(w, 0.3, 0.3), barz = new THREE.BoxGeometry(0.3, 0.3, w);
  for (let y = 4; y < H; y += 6) { g.add(mesh(bar, m, x0 - w / 2, y, -w / 2), mesh(bar, m, x0 - w / 2, y, w / 2), mesh(barz, m, x0 - w, y, 0), mesh(barz, m, x0, y, 0)); }
  const dg = new THREE.BoxGeometry(0.22, Math.hypot(w, 6), 0.22);
  for (let y = 4; y + 6 < H; y += 6) for (const z of [-w / 2, w / 2]) { const d = mesh(dg, m, x0 - w / 2, y + 3, z); d.rotation.z = Math.atan2(w, 6) * (z > 0 ? 1 : -1); g.add(d); }
  g.add(mesh(new THREE.SphereGeometry(0.5, 10, 8), MAT.redLamp, x0 - w / 2, H + 0.6, 0));
  const arms = [];
  for (const ah of [R.sepOff * 0.6 + R.s1.bell, R.sepOff + R.s2.len * 0.5 + R.s1.bell]) {
    const pivot = new THREE.Group(); pivot.position.set(x0, ah, 0);
    const len = -x0 - R.s1.r + 0.3;
    pivot.add(mesh(new THREE.BoxGeometry(len, 1.1, 1.4), std(0x7d8088, 0.5, 0.5), len / 2, 0, 0));
    g.add(pivot); arms.push(pivot);
  }
  g.userData.arms = arms;
  return g;
}
/* ================= shared game state, camera, helpers ================= */
const GAME = { mode: 'boot', rocket: ROCKETS[1], dest: 'orbit', warp: 1, t: 0 };
const keys = {};
const touch = { L: 0, R: 0, sx: 0, sy: 0, burn: 0 };
function setText(el, text) { if (el.textContent !== text) el.textContent = text; }
const cache = {};
function set(id, text, tone) {
  const k = text + '|' + (tone || '');
  if (cache[id] === k) return; cache[id] = k;
  const el = $(id); el.textContent = text;
  if (tone !== undefined) { if (tone) el.dataset.tone = tone; else delete el.dataset.tone; }
}
const fmtAlt = h => Math.abs(h) < 1000 ? `${Math.max(0, h).toFixed(0)} m` : `${(h / 1000).toFixed(h < 100000 ? 2 : 1)} km`;
const fmtKm = h => `${(h / 1000).toLocaleString('en-GB', { maximumFractionDigits: h < 1e6 ? 1 : 0 })} km`;
const rotZ = (x, y, th, out) => { const c = Math.cos(th), s = Math.sin(th); out.x = x * c - y * s; out.y = x * s + y * c; return out; };

// orbit-style camera used by the hangar, launch, transfer and landing views
function makeOC(o) { return Object.assign({ yaw: 0.6, pitch: 0.15, dist: 100, tYaw: null, tPitch: null, tDist: null, min: 5, max: 1e8, target: V3(), minPitch: -1.45, maxPitch: 1.45 }, o); }
function ocPreset(oc, yaw, pitch, dist) { oc.tYaw = yaw; oc.tPitch = pitch; oc.tDist = dist; }
function ocApply(oc, dt, groundY) {
  const k = 1 - Math.exp(-dt * 3.5);
  if (oc.tYaw !== null) { oc.yaw += angDiff(oc.tYaw, oc.yaw) * k; if (Math.abs(angDiff(oc.tYaw, oc.yaw)) < 0.002) oc.tYaw = null; }
  if (oc.tPitch !== null) { oc.pitch += (oc.tPitch - oc.pitch) * k; if (Math.abs(oc.tPitch - oc.pitch) < 0.002) oc.tPitch = null; }
  if (oc.tDist !== null) { oc.dist = Math.exp(lerp(Math.log(oc.dist), Math.log(oc.tDist), k)); if (Math.abs(oc.tDist / oc.dist - 1) < 0.003) oc.tDist = null; }
  oc.dist = clamp(oc.dist, oc.min, oc.max);
  let p = clamp(oc.pitch, oc.minPitch, oc.maxPitch);
  if (groundY !== undefined) { const mp = Math.asin(clamp((groundY + 1.5 - oc.target.y) / oc.dist, -1, 1)); if (p < mp) p = mp; }
  oc.pitch = p;
  const cp = Math.cos(p);
  camera.position.set(oc.target.x + oc.dist * cp * Math.sin(oc.yaw), oc.target.y + oc.dist * Math.sin(p), oc.target.z + oc.dist * cp * Math.cos(oc.yaw));
  camera.up.set(0, 1, 0); camera.lookAt(oc.target);
}
let activeOC = null;
// pointer handling on the canvas: drag to orbit/look, wheel and pinch to zoom
const ptrs = new Map(); let pinch0 = 0, dragMoved = 0;
const cv = $('gl');
cv.addEventListener('pointerdown', e => {
  audioInit();
  if (GAME.mode === 'surface') { surfacePointerDown(e); return; }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragMoved = 0;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
  hideLookHint();
});
cv.addEventListener('pointermove', e => {
  if (GAME.mode === 'surface') { surfacePointerMove(e); return; }
  const p = ptrs.get(e.pointerId); if (!p || !activeOC) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; dragMoved += Math.abs(dx) + Math.abs(dy);
  if (ptrs.size === 1) { activeOC.yaw -= dx * 0.006; activeOC.pitch = clamp(activeOC.pitch + dy * 0.005, activeOC.minPitch, activeOC.maxPitch); activeOC.tYaw = activeOC.tPitch = null; }
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0 > 0) { activeOC.dist *= pinch0 / d; activeOC.tDist = null; } pinch0 = d;
  }
});
const ptrUp = e => { if (GAME.mode === 'surface') { surfacePointerUp(e); return; } ptrs.delete(e.pointerId); pinch0 = 0; };
cv.addEventListener('pointerup', ptrUp); cv.addEventListener('pointercancel', ptrUp);
cv.addEventListener('wheel', e => { e.preventDefault(); if (GAME.mode === 'surface') { const n0 = performance.now(); if (SU.build) { if (n0 - (cv._wt || 0) > 140) { cv._wt = n0; cycleBuild(e.deltaY > 0 ? 1 : -1); } return; } const n = performance.now(); if (n - (cv._wt || 0) > 140) { cv._wt = n; cycleWeapon(e.deltaY > 0 ? 1 : -1); } return; } if (activeOC) { activeOC.dist *= Math.exp(e.deltaY * 0.0012); activeOC.tDist = null; hideLookHint(); } }, { passive: false });
cv.addEventListener('contextmenu', e => e.preventDefault());
let lookHintT = 0;
function hideLookHint() { const h = $('lookHint'); if (h) h.style.opacity = 0; }

/* ================= LAUNCH ================= */
const launchScene = new THREE.Scene();
const earthGroup = new THREE.Group(); launchScene.add(earthGroup);
const sunLight = new THREE.DirectionalLight(0xfff2e2, 2.7); launchScene.add(sunLight, sunLight.target);
const hemi = new THREE.HemisphereLight(0xa8ccff, 0x55603f, 0.6); launchScene.add(hemi);
const ambL = new THREE.AmbientLight(0x2a3346, 0.12); launchScene.add(ambL);
const engineLight = new THREE.PointLight(0xffa050, 0, 500, 2); launchScene.add(engineLight);
const SUN_E = V3(0.35, 0.62, 0.70).normalize(), MOON_E = V3(-0.3, 0.55, -0.78).normalize(), MARS_E = V3(0.55, 0.32, -0.77).normalize();
const LW = { built: false };
const smokePS = particleSystem(COARSE ? 550 : 1000, false), firePS = particleSystem(400, true);
launchScene.add(smokePS.pts, firePS.pts);
const vapor = mesh(new THREE.ConeGeometry(1, 1, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
const atmoMat = new THREE.ShaderMaterial({
  uniforms: { uC: { value: V3() }, uR: { value: RE }, uSun: { value: V3(0, 1, 0) }, uI: { value: 1 } },
  vertexShader: `${LOGV} varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }`,
  fragmentShader: `${LOGF} uniform vec3 uC; uniform float uR; uniform vec3 uSun; uniform float uI; varying vec3 vW;
    void main(){
      #include <logdepthbuf_fragment>
      vec3 d = normalize(vW - cameraPosition); vec3 oc = uC - cameraPosition; float t = max(dot(oc, d), 0.0);
      vec3 cp = cameraPosition + d * t; float b = length(cp - uC); float h = max(b - uR, 0.0);
      float dens = exp(-h / 24000.0); vec3 n = normalize(cp - uC);
      float sun = clamp(dot(n, uSun) * 1.4 + 0.3, 0.0, 1.0);
      vec3 col = mix(vec3(0.18, 0.42, 1.0), vec3(0.62, 0.8, 1.0), dens);
      float a = dens * sun * uI; gl_FragColor = vec4(col * a, 1.0); }`,
  side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
});
function buildLaunchWorld() {
  if (LW.built) return;
  const tx = earthTextures();
  LW.earth = mesh(new THREE.SphereGeometry(RE - 6, 192, 96), std(0xffffff, 0.85, 0, { map: tx.color, roughnessMap: tx.rough, envMapIntensity: 0.12 }));
  LW.earth.rotation.x = 62 * Math.PI / 180;
  LW.clouds = mesh(new THREE.SphereGeometry(RE + 6500, 128, 64), new THREE.MeshStandardMaterial({ map: tx.clouds, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1 }));
  LW.clouds.rotation.x = 62 * Math.PI / 180;
  LW.atmo = mesh(new THREE.SphereGeometry(RE + 250e3, 128, 64), atmoMat);
  earthGroup.add(LW.earth, LW.clouds, LW.atmo);
  // launch site, in the tangent plane at the top of the sphere
  const site = new THREE.Group(); site.position.set(0, RE, 0); earthGroup.add(site); LW.site = site;
  const img = tx.color.image.getContext('2d');
  const th = Math.acos(SITE.y), ph = (Math.atan2(SITE.z, -SITE.x) + Math.PI * 2) % (Math.PI * 2);
  const px = img.getImageData(Math.floor(ph / (Math.PI * 2) * tx.color.image.width), Math.floor(th / Math.PI * tx.color.image.height), 1, 1).data;
  const dt = detailTexture().clone(); dt.needsUpdate = true; dt.repeat.set(900, 900);
  const disk = mesh(new THREE.CircleGeometry(30000, 96), std(new THREE.Color(`rgb(${px[0]},${px[1]},${px[2]})`).multiplyScalar(1.2), 0.95, 0, { map: dt }), 0, -4.6, 0);
  disk.rotation.x = -Math.PI / 2; site.add(disk); LW.disk = disk;
  const scrub = scrubTexture().clone(); scrub.needsUpdate = true; scrub.repeat.set(18, 18);
  const field = mesh(new THREE.CircleGeometry(900, 64), std(0xffffff, 0.95, 0, { map: scrub }), 0, -4.5, 0); field.rotation.x = -Math.PI / 2; site.add(field);
  site.add(mesh(new THREE.BoxGeometry(110, 0.6, 110), std(0x7e7c76, 0.95, 0, { envMapIntensity: 0.4 }), 0, -4.3, 0));
  site.add(mesh(new THREE.BoxGeometry(16, 4, 16), std(0x55575c, 0.8, 0.2), 0, -2, 0));
  site.add(mesh(new THREE.BoxGeometry(7, 0.2, 60), std(0x1a1c20, 0.9, 0), 0, -3.95, 0));
  for (const [x, z, w, h, d] of [[160, -90, 60, 34, 40], [-170, 120, 40, 18, 30], [220, 140, 24, 10, 24]]) site.add(mesh(new THREE.BoxGeometry(w, h, d), std(0xdcdad3, 0.7, 0.05), x, h / 2 - 4.3, z));
  site.add(mesh(new THREE.CylinderGeometry(4, 4, 30, 16), std(0xdcdad3, 0.6, 0.2), -80, 11, -60));
  site.add(mesh(new THREE.SphereGeometry(7, 20, 12), std(0xdcdad3, 0.6, 0.2), -80, 28, -60));
  LW.moonFar = farBody(moonTexture(), 0.26);
  LW.marsFar = farBody(marsTexture(), 0.06, 0x3a1206);
  // orbit preview line
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(361 * 3), 3));
  LW.orbit = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.85 }));
  LW.orbit.frustumCulled = false; LW.orbit.visible = false; earthGroup.add(LW.orbit);
  for (const o of site.children) if (o.isMesh) o.receiveShadow = true;
  setupShadow(sunLight, 80, 1, 3000);
  LW.built = true;
}

const LS = { S: null, R: null, rock: null, tower: null, debris: [], newDeb: [], oc: makeOC({ yaw: 0.55, pitch: 0.1, dist: 120 }), view: 0, orbitT: 0, tli: 0, ended: false };
const VIEWS = ['Chase', 'Earth', 'Space', 'Wide'];
function enterLaunch() {
  const R = GAME.rocket;
  buildLaunchWorld();
  if (LS.rock) launchScene.remove(LS.rock.root);
  for (const d of LS.debris) launchScene.remove(d.obj);
  if (LS.tower) LW.site.remove(LS.tower);
  LS.R = R; LS.S = lpNew(R); if (R.single) LS.S.fairing = false; LS.rock = buildRocket(R); launchScene.add(LS.rock.root); shadowAll(LS.rock.root, true, true);
  LS.rock.p1.traverse(o => { o.castShadow = o.receiveShadow = false; }); LS.rock.p2.traverse(o => { o.castShadow = o.receiveShadow = false; });
  LS.rock.root.add(vapor);
  LS.tower = buildTower(R); shadowAll(LS.tower, true, false); LW.site.add(LS.tower); LW.site.position.y = RE - R.s1.bell;
  LS.debris = []; LS.newDeb = []; LS.tli = 0; LS.ended = false;
  smokePS.list.length = 0; firePS.list.length = 0;
  GAME.warp = 1; syncWarp();
  LS.view = 0; const L = R.totalLen;
  Object.assign(LS.oc, { yaw: 0.75, pitch: 0.12, dist: L * 2.2 + 30, min: Math.max(6, L * 0.6), max: 6e7, tYaw: null, tPitch: null, tDist: null });
  activeOC = LS.oc;
  $('lName').textContent = R.name;
  $('f1Pct').previousElementSibling.textContent = R.single ? 'Plasma fuel' : 'Stage 1';
  $('f2Pct').closest('.fuel > div').hidden = !!R.single;
  logList.length = 0; addEvent(`${R.name} on the pad, all systems go`);
  set('viewBtn', 'View: Chase'); syncPro(); syncThr(); syncAuto();
  $('lookHint').style.opacity = 1;
  hideBanner();
  showMode('launch');
}
const logList = [];
function clockStr() {
  const S = LS.S; if (!S || !S.flags.release) return 'T−00:00';
  const t = Math.floor(S.met), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return `T+${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function addEvent(text) {
  logList.push({ t: LS.S && LS.S.flags.release ? clockStr() : 'PAD', text });
  if (logList.length > 6) logList.shift();
  const ol = $('log'); ol.textContent = '';
  for (const e of logList) { const li = document.createElement('li'), tm = document.createElement('time'); tm.textContent = e.t; li.append(tm, document.createTextNode(e.text)); ol.append(li); }
}
function launchPrimary() {
  audioInit();
  const S = LS.S, R = LS.R;
  if (S.dead || S.phase === 'landed') { enterLaunch(); return; }
  if (S.phase === 'pad') { S.engine = true; S.phase = 'spool'; addEvent('Engine start'); return; }
  if (S.phase === 'spool') return;
  if (S.phase === 'ready') { S.phase = 'flight'; S.flags.release = true; addEvent('Clamps released'); clunk(0.5); return; }
  if (S.phase === 'flight') {
    if (canTransfer()) { startTLI(); return; }
    if (S.stage === 1 && !R.single) { if (S.f1 > 0 && S.armT <= 0) { S.armT = 2.5; return; } attachDebris(lpSeparate(S, R)); clunk(1); return; }
    if ((R.single ? S.f1 : S.f2) > 0) { S.engine = !S.engine; addEvent(S.engine ? 'Engine relit' : 'Engine shut down'); }
  }
}
const canTransfer = () => { const S = LS.S; return GAME.dest !== 'orbit' && S.flags.orbit && S.pe >= 100000 && !LS.tli && !S.dead; };
function startTLI() {
  const S = LS.S; S.auto = false; syncAuto(); LS.tli = 5; S.engine = false; S.thr = 0; syncThr();
  addEvent(LS.R.single ? 'Light-speed drive spooling up' : GAME.dest === 'moon' ? 'Trans-lunar injection burn' : 'Trans-Mars injection burn');
  GAME.warp = 1; syncWarp(); hideBanner();
  LS.view = 0; set('viewBtn', 'View: Chase'); ocPreset(LS.oc, LS.oc.yaw + 0.6, 0.15, curLen() * 2.4 + 20);
}
function curLen() { const R = LS.R, S = LS.S; return S.stage === 1 ? R.totalLen : R.s2.len + (S.fairing ? R.fairLen : R.fairLen * 0.6); }
function attachDebris(d) {
  const R = LS.R, rk = LS.rock, c = new THREE.Group();
  if (d.kind === 's1') {
    rk.root.remove(rk.s1); rk.s1.position.set(0, -R.s1.len / 2, 0); c.add(rk.s1); rk.p1.visible = false;
    rk.s2.position.y = 0;
  } else {
    const half = d.kind === 'fl' ? rk.fL : rk.fR;
    rk.pay.remove(half); half.position.set(0, -R.fairLen / 2, 0); c.add(half);
  }
  launchScene.add(c); d.obj = c; LS.debris.push(d);
}
function setViewLaunch(i) {
  const S = LS.S, L = curLen();
  LS.view = (i + VIEWS.length) % VIEWS.length; set('viewBtn', 'View: ' + VIEWS[LS.view]);
  const oc = LS.oc;
  if (LS.view === 0) ocPreset(oc, oc.yaw, 0.12, L * 2.2 + 30);
  if (LS.view === 1) ocPreset(oc, oc.yaw, 1.25, Math.max(L * 3 + 40, S.h * 0.25));
  if (LS.view === 2) ocPreset(oc, oc.yaw, -1.2, L * 2.6 + 30);
  if (LS.view === 3) ocPreset(oc, oc.yaw, 0.35, S.h > 60000 ? RE * 2.6 : Math.max(700, S.h * 3 + 400));
}
function explode(atE, vel, scale) {
  for (let i = 0; i < 220; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1), sp = Math.random() * (i < 90 ? 70 : 30) * scale;
    const dx = Math.sin(b) * Math.cos(a), dy = Math.sin(b) * Math.sin(a), dz = Math.cos(b), k = i < 70 ? 1 : i < 100 ? 2 : 0;
    const p = { x: atE.x + dx * 4, y: atE.y + dy * 4, z: atE.z + dz * 4, vx: vel.x * 0.25 + dx * sp * (k === 2 ? 2.4 : 1), vy: vel.y * 0.25 + dy * sp * (k === 2 ? 2.4 : 1), vz: dz * sp, r: (k === 2 ? 0.8 : 6 + Math.random() * 10) * scale, gr: k === 2 ? 0 : (3 + Math.random() * 6) * scale, age: 0, life: k === 2 ? 1.5 + Math.random() : k === 1 ? 1.2 + Math.random() * 1.4 : 5 + Math.random() * 5, k };
    (k === 0 ? smokePS : firePS).list.push(p);
  }
}
function launchEvents() {
  const S = LS.S, R = LS.R;
  for (const e of S.ev) {
    if (e.type !== 'autodone') addEvent(e.text); else addEvent(e.text);
    if (e.type === 'space') showBanner('space');
    if (e.type === 'orbit') { showBanner(GAME.dest === 'orbit' ? 'orbitDone' : 'orbitGo'); S.auto = false; syncAuto(); }
    if (e.type === 'sep') clunk(1);
    if (e.type === 'crash' || e.type === 'breakup') {
      const up = V3(Math.sin(S.th), Math.cos(S.th), 0), Er = up.clone().multiplyScalar(RE + S.h);
      const ve = V3(Math.sin(S.th) * S.vy + Math.cos(S.th) * S.vx, Math.cos(S.th) * S.vy - Math.sin(S.th) * S.vx, 0);
      explode(Er.add(V3(Math.sin(S.th + S.p), Math.cos(S.th + S.p), 0).multiplyScalar(curLen() * 0.4)), ve, R.s1.r / 1.85);
      LS.rock.root.visible = false; LS.flash = 1; boom(); GAME.warp = 1; syncWarp();
      showBanner(e.type);
    }
    if (e.type === 'landed') showBanner('landedEarth');
  }
  S.ev.length = 0;
  for (const d of LS.newDeb) attachDebris(d);
  LS.newDeb.length = 0;
}
function emitSmoke(dt) {
  const S = LS.S, R = LS.R;
  if (S.dead) return;
  const tf = LS.tli > 0 ? 1 : S.tf;
  if (tf < 0.03) return;
  const dens = Math.min(1, S.pr * 1.6); if (dens < 0.02) return;
  const sc = R.s1.r / 1.85, th = S.th, phi = th + S.p;
  const up = [Math.sin(th), Math.cos(th)], east = [Math.cos(th), -Math.sin(th)], ax = [Math.sin(phi), Math.cos(phi)];
  const bell = S.stage === 1 ? R.s1.bell : R.s2.bell, rr = RE + S.h;
  const nx = up[0] * rr - ax[0] * bell, ny = up[1] * rr - ax[1] * bell;
  const ve = [up[0] * S.vy + east[0] * S.vx, up[1] * S.vy + east[1] * S.vx];
  const onPad = S.h < 40;
  const n = (onPad ? 260 : 130) * tf * dens * dt * (1 + sc * 0.4);
  const count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  for (let i = 0; i < count && smokePS.list.length < smokePS.max; i++) {
    if (onPad) {
      const a = Math.random() < 0.7 ? (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.9 : Math.random() * Math.PI * 2;
      const sp = (30 + Math.random() * 100) * (0.7 + sc * 0.3), ca = Math.cos(a), sa = Math.sin(a);
      smokePS.list.push({ x: up[0] * (RE - R.s1.bell - 2) + east[0] * ca * 6, y: up[1] * (RE - R.s1.bell - 2) + east[1] * ca * 6, z: sa * 6, vx: east[0] * ca * sp + up[0] * (4 + Math.random() * 16), vy: east[1] * ca * sp + up[1] * (4 + Math.random() * 16), vz: sa * sp, r: (3 + Math.random() * 4) * sc, gr: (4 + Math.random() * 6) * sc, age: 0, life: 5 + Math.random() * 6, k: 0, ux: up[0], uy: up[1] });
    } else {
      const ex = 30 + Math.random() * 40;
      smokePS.list.push({ x: nx, y: ny, z: (Math.random() - 0.5) * 2, vx: ve[0] * 0.2 - ax[0] * ex + (Math.random() - .5) * 14, vy: ve[1] * 0.2 - ax[1] * ex + (Math.random() - .5) * 14, vz: (Math.random() - .5) * 14, r: (2 + Math.random() * 2) * sc, gr: (2.5 + Math.random() * 3) * (1 + (1 - dens) * 2.5) * sc, age: 0, life: 3 + Math.random() * 3.5, k: 0, ux: up[0], uy: up[1] });
    }
  }
}
function stepParticles(ps, dt) {
  const L = ps.list;
  for (let i = L.length - 1; i >= 0; i--) {
    const p = L[i], kd = p.k === 2 ? 0.4 : p.k === 1 ? 1.8 : 0.9, f = Math.exp(-kd * dt);
    p.vx *= f; p.vy *= f; p.vz *= f;
    if (p.k === 0 && p.ux !== undefined) { p.vx += p.ux * 0.9 * dt; p.vy += p.uy * 0.9 * dt; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.r += p.gr * dt; p.gr *= Math.exp(-0.2 * dt); p.age += dt;
    if (p.age > p.life) { L[i] = L[L.length - 1]; L.pop(); }
  }
}
function writeParticles(ps, Erx, Ery, th, smoke) {
  const c = Math.cos(th), s = Math.sin(th); let n = 0;
  for (const p of ps.list) {
    const dx = p.x - Erx, dy = p.y - Ery;
    ps.pos[n * 3] = dx * c - dy * s; ps.pos[n * 3 + 1] = dx * s + dy * c; ps.pos[n * 3 + 2] = p.z;
    const t = p.age / p.life;
    ps.size[n] = p.r * 2;
    if (smoke) {
      const warm = Math.max(0, 1 - p.age * 1.6);
      ps.alpha[n] = Math.pow(1 - t, 1.4) * 0.55;
      ps.col[n * 3] = lerp(0.84, 1.0, warm); ps.col[n * 3 + 1] = lerp(0.84, 0.66, warm); ps.col[n * 3 + 2] = lerp(0.82, 0.36, warm);
    } else {
      ps.alpha[n] = (1 - t) * (p.k === 2 ? 1 : 0.8);
      ps.col[n * 3] = 1; ps.col[n * 3 + 1] = lerp(0.85, 0.35, t); ps.col[n * 3 + 2] = lerp(0.5, 0.1, t);
    }
    n++;
  }
  flushParticles(ps, n);
}
function updateOrbitLine() {
  const S = LS.S, rr = RE + S.h, th = S.th;
  const rx = Math.sin(th) * rr, ry = Math.cos(th) * rr;
  const vxE = Math.sin(th) * S.vy + Math.cos(th) * S.vx, vyE = Math.cos(th) * S.vy - Math.sin(th) * S.vx;
  const v2 = vxE * vxE + vyE * vyE, rv = rx * vxE + ry * vyE;
  const ex = ((v2 - MU / rr) * rx - rv * vxE) / MU, ey = ((v2 - MU / rr) * ry - rv * vyE) / MU;
  const e = Math.hypot(ex, ey), hA = rx * vyE - ry * vxE, p = hA * hA / MU;
  const w = Math.atan2(ey, ex), pos = LW.orbit.geometry.attributes.position.array;
  const lim = e < 1 ? Math.PI : Math.acos(-1 / e) * 0.97;
  for (let i = 0; i <= 360; i++) {
    const nu = -lim + 2 * lim * i / 360, r = p / (1 + e * Math.cos(nu));
    pos[i * 3] = r * Math.cos(w + nu); pos[i * 3 + 1] = r * Math.sin(w + nu); pos[i * 3 + 2] = 0;
  }
  LW.orbit.geometry.attributes.position.needsUpdate = true;
}
function updateLaunch(dt) {
  const S = LS.S, R = LS.R, rk = LS.rock;
  launchAutoRelease();
  const man =(keys.KeyD || keys.ArrowRight || touch.R ? 1 : 0) - (keys.KeyA || keys.ArrowLeft || touch.L ? 1 : 0);
  if (keys.KeyW || keys.ArrowUp) { S.thr = clamp(S.thr + 0.6 * dt, 0, 1); syncThr(); }
  if (keys.KeyS || keys.ArrowDown) { S.thr = clamp(S.thr - 0.6 * dt, 0, 1); syncThr(); }
  if (S.auto && (man || keys.KeyW || keys.KeyS)) { S.auto = false; syncAuto(); }
  if (S.h < 70000 && GAME.warp > 5) { GAME.warp = 5; syncWarp(); }
  const simDt = dt * GAME.warp, n = Math.max(1, Math.ceil(simDt / (1 / 120))), h = simDt / n;
  for (let i = 0; i < n; i++) { lpStep(S, R, h, { man }, LS.newDeb); emitSmoke(h); if (S.ev.length || LS.newDeb.length) launchEvents(); }
  if (S.auto) syncThr();
  for (const d of LS.debris) lpDebrisStep(d, simDt);
  stepParticles(smokePS, simDt); stepParticles(firePS, simDt);
  if (LS.tli > 0) { LS.tli -= dt; if (LS.tli <= 0) { transitionTo(() => enterTransfer()); LS.tli = -1; } }
  GAME.t += dt;
}
function renderLaunch(dt) {
  const S = LS.S, R = LS.R, rk = LS.rock, th = S.th, rr = RE + S.h;
  const Erx = Math.sin(th) * rr, Ery = Math.cos(th) * rr;
  earthGroup.rotation.z = th; earthGroup.position.set(0, -rr, 0);
  rk.root.rotation.z = -S.p;
  LW.clouds.rotation.y = GAME.t * 0.0004;
  const L = curLen();
  const ax = V3(Math.sin(S.p), Math.cos(S.p), 0);
  LS.oc.target.copy(ax).multiplyScalar(L * 0.5);
  LS.oc.min = Math.max(6, L * 0.6);
  ocApply(LS.oc, dt, S.h < 3000 ? -S.h - R.s1.bell - 4 : undefined);
  if (LS.tower) for (const a of LS.tower.userData.arms) a.rotation.y = -S.umb * 1.3;
  // shake near the ground
  if (!RM && !S.dead) { const sh = (S.tf * Math.min(1, S.pr * 1.5) * (S.h < 500 ? 1 : 0.4) + Math.min(1, S.q / 30000)) * 0.004 * LS.oc.dist / 100; camera.position.x += (Math.random() - .5) * sh * 10; camera.position.y += (Math.random() - .5) * sh * 10; }
  // debris
  for (let i = LS.debris.length - 1; i >= 0; i--) {
    const d = LS.debris[i], r2 = RE + d.h, dx = Math.sin(d.th) * r2 - Erx, dy = Math.cos(d.th) * r2 - Ery;
    rotZ(dx, dy, th, d.obj.position); d.obj.position.z = d.kind === 'fl' ? -d.t * 2 : d.kind === 'fr' ? d.t * 2 : 0;
    d.obj.rotation.z = -((d.th + d.p) - th);
    if (d.h < -20 || d.t > 400 || Math.hypot(dx, dy) > 4e6) { launchScene.remove(d.obj); LS.debris.splice(i, 1); }
  }
  // plumes
  const tf = LS.tli > 0 ? 1 : S.tf;
  if (S.stage === 1) setPlume(rk.p1, S.dead ? 0 : tf, S.pr, GAME.t); else rk.p1.visible = false;
  setPlume(rk.p2, S.dead || S.stage === 1 ? 0 : tf, S.pr, GAME.t);
  const bellE = S.stage === 1 ? R.s1.bell : R.s2.bell;
  engineLight.position.copy(ax).multiplyScalar(-bellE - 3);
  engineLight.intensity = S.dead ? 0 : tf * (S.h < 4000 ? 9 : 2.5) * (R.s1.r / 1.85 + 0.5);
  engineLight.distance = 300 * (R.s1.r / 1.85 + 0.5);
  // vapor cone
  const vap = clamp(1 - Math.abs(S.mach - 1.05) / 0.18, 0, 1) * clamp(S.pr * 2.5 - 0.3, 0, 1) * (S.dead ? 0 : 1);
  vapor.visible = vap > 0.02;
  if (vapor.visible) { const r0 = (S.stage === 1 ? R.s1.r : R.s2.r); vapor.scale.set(r0 * 3.6, r0 * 5, r0 * 3.6); vapor.position.y = L * 0.62; vapor.material.opacity = 0.32 * vap; }
  // particles
  writeParticles(smokePS, Erx, Ery, th, true); writeParticles(firePS, Erx, Ery, th, false);
  // lights and sky
  const sun = rotZ(SUN_E.x, SUN_E.y, th, V3()); sun.z = SUN_E.z;
  sunLight.position.copy(sun).multiplyScalar(1000).add(LS.oc.target); sunLight.target.position.copy(LS.oc.target); sunLight.target.updateMatrixWorld();
  sunLight.castShadow = shadowsOn() && S.h < 2500 && LS.oc.dist < 1500;
  if (sunLight.castShadow) { const c = sunLight.shadow.camera, sz = Math.max(40, L * 0.9 + 25); if (c.right !== sz) { c.left = c.bottom = -sz; c.right = c.top = sz; c.updateProjectionMatrix(); } }
  launchScene.environment = envMap(S.h < 25000 ? 'pad' : 'space'); GFX.bloomStr = 0.55;
  const pr = S.pr, f = Math.pow(Math.exp(-Math.max(0, S.h) / 9000), 0.35);
  hemi.intensity = 0.55 * Math.sqrt(pr); ambL.intensity = 0.08;
  const top = new THREE.Color(0x03050c).lerp(new THREE.Color(0x2a68c4), f), hor = new THREE.Color(0x05070e).lerp(new THREE.Color(0xa9cff0), f);
  setSky({ top, hor, bot: hor, halo: 0.4 * f, stars: ss(15000, 60000, S.h) * (LS.oc.dist > 2e5 ? 1 : 1) });
  setSkySun(sun);
  atmoMat.uniforms.uC.value.set(0, -rr, 0); atmoMat.uniforms.uSun.value.copy(sun); atmoMat.uniforms.uI.value = ss(8000, 60000, S.h) * 0.9 + ss(2e5, 1e6, LS.oc.dist) * 0.1;
  LW.disk.visible = S.h < 25000 || LS.oc.dist < 2e4;
  const md = rotZ(MOON_E.x, MOON_E.y, th, V3()); md.z = MOON_E.z; placeFar(LW.moonFar, md);
  const mr = rotZ(MARS_E.x, MARS_E.y, th, V3()); mr.z = MARS_E.z; placeFar(LW.marsFar, mr);
  LW.moonFar.visible = true; LW.marsFar.visible = true;
  // orbit line when zoomed out or high
  LS.orbitT -= dt;
  const showOrbit = (S.h > 25000 || LS.oc.dist > 3000) && Math.hypot(S.vx, S.vy) > 600;
  LW.orbit.visible = showOrbit;
  if (showOrbit && LS.orbitT <= 0) { updateOrbitLine(); LS.orbitT = 0.15; }
  if (LS.flash > 0) LS.flash = Math.max(0, LS.flash - dt * 1.5);
  renderer.toneMappingExposure = 1.05 + (LS.flash || 0) * 1.5;
  drawFrame(launchScene);
  launchHud();
  audioEngine(S.dead ? 0 : tf, 0.12 + 0.88 * Math.min(1, pr * 1.4), S.q);
}

function launchStatus() {
  const S = LS.S, F = S.flags;
  if (S.dead) return ['Vehicle lost', 'red'];
  if (LS.tli > 0) return ['Transfer burn', 'amber'];
  if (S.phase === 'landed') return ['Touchdown', 'green'];
  if (S.phase === 'pad') return ['On pad', ''];
  if (S.phase === 'spool') return ['Spool-up', 'amber'];
  if (S.phase === 'ready') return ['Clamps holding', 'amber'];
  if (F.orbit && S.pe >= 100000) return ['In orbit', 'green'];
  if (S.h >= 100000) return ['In space', 'cyan'];
  if (S.ign > 0) return ['Staging', 'amber'];
  if (S.auto) return ['Autopilot', 'cyan'];
  if (S.tf > 0.02) return ['Powered ascent', 'amber'];
  return [S.vy < 0 ? 'Falling' : 'Coasting', ''];
}
function launchPrompt() {
  const S = LS.S, F = S.flags, dname = { moon: 'the Moon', mars: 'Mars', proxima: 'Proxima b' }[GAME.dest];
  if (S.dead) return ['Press Try again to roll a new rocket out to the pad.', 'warn'];
  if (LS.tli > 0) return [`Burning for ${dname}. Hold on…`, 'good'];
  if (S.phase === 'landed') return ['Back on the ground in one piece.', 'good'];
  if (S.phase === 'pad') return ['Start the engine. Drag the view to look around first if you like.', ''];
  if (S.phase === 'spool') return [`Engine spooling up · ${Math.round(S.spool * 100)}% thrust`, ''];
  if (S.phase === 'ready') return [S.thr < 0.6 ? 'Throttle too low to lift off. Push it up, then release the clamps.' : 'Full thrust. Release the clamps to lift off.', ''];
  if (S.load > 4) return ['High aero load! Point the nose along your direction of travel.', 'warn'];
  if (S.armT > 0) return ['Stage 1 still has fuel. Press again to drop it anyway.', 'warn'];
  if (canTransfer()) return [LS.R.single ? `In orbit. Engage the light-speed drive for ${dname}.` : `In orbit. Fire the transfer burn to head for ${dname}.`, 'good'];
  if (S.stage === 1 && S.f1 <= 0) return ['Stage 1 is empty. Separate the stage to light the upper engine.', 'warn'];
  if (S.ign > 0) return ['Stage separated. Upper engine lighting…', ''];
  if (F.orbit && S.pe >= 100000) return [`Stable orbit · ${fmtKm(S.pe)} × ${fmtKm(S.ap)}. Try View: Wide or Earth.`, 'good'];
  if (S.auto) return ['Autopilot is flying a gravity turn to orbit. Tilt or throttle to take over.', ''];
  if (S.stage === 2 && S.f2 <= 0) return [S.pe !== null && S.pe < 100000 ? 'Out of fuel on a suborbital arc. What goes up will come back down.' : 'Out of fuel.', ''];
  if (S.h >= 100000) return ['You\'re in space. For orbit, burn sideways until periapsis is above 100 km.', ''];
  if (S.h < 1500 && !S.pro && Math.abs(S.p) < 0.05) return ['Climbing. Past 1 km, tilt gently east (▶ or D), or switch on Prograde or Autopilot.', ''];
  if (S.h < 1500 && S.vy < 1 && S.tf < 0.4) return ['Not enough thrust. Push the throttle up.', 'warn'];
  if (!F.maxq && S.q > 15000) return ['Passing through max aerodynamic pressure. Hold steady.', ''];
  if (S.stage === 2) return ['Upper stage burning. Lower the nose toward the horizon to build orbital speed.', ''];
  return ['Gravity turn: let the nose follow your travel direction as you climb.', ''];
}
function launchPrimaryState() {
  const S = LS.S;
  if (S.dead || S.phase === 'landed') return ['Try again', '', false, false];
  if (LS.tli > 0) return ['Burning…', 'ghost', true, false];
  if (S.phase === 'pad') return ['Start engine', '', false, true];
  if (S.phase === 'spool') return [`Spooling ${Math.round(S.spool * 100)}%`, 'ghost', true, false];
  if (S.phase === 'ready') return ['Release clamps', '', false, true];
  if (canTransfer()) return [LS.R.single ? 'Jump to light speed' : GAME.dest === 'moon' ? 'Burn for the Moon' : 'Burn for Mars', '', false, true];
  if (LS.R.single) return S.engine ? ['Engine off', 'ghost', false, false] : ['Relight engine', '', false, false];
  if (S.stage === 1) return S.f1 <= 0 ? ['Separate stage', '', false, true] : S.armT > 0 ? ['Confirm separation', 'armed', false, false] : ['Separate stage', 'ghost', false, false];
  if (S.f2 <= 0) return ['Out of fuel', 'ghost', true, false];
  if (S.ign > 0) return ['Igniting…', 'ghost', true, false];
  return S.engine ? ['Engine off', 'ghost', false, false] : ['Relight engine', '', false, false];
}
const mapAlt = h => Math.sqrt(clamp(h, 0, 500000) / 500000);
(function buildLadder() {
  const tr = $('track');
  for (const [h, name, alt, key] of [[12000, 'Airliners', '12 km'], [35000, 'Weather balloons', '35 km'], [80000, 'Astronaut wings', '80 km'], [100000, 'Kármán line', '100 km', 1], [410000, 'Space station', '410 km']]) {
    const d = document.createElement('div'); d.className = 'mark' + (key ? ' key' : ''); d.style.setProperty('--p', mapAlt(h).toFixed(4));
    const sp = document.createElement('span'); sp.textContent = name; const b = document.createElement('b'); b.textContent = alt; sp.append(b); d.append(sp); tr.prepend(d);
  }
})();
function launchHud() {
  const S = LS.S, R = LS.R;
  set('clock', clockStr()); syncAuto();
  const [st, tone] = launchStatus(); set('chip', st, tone);
  const v = Math.hypot(S.vx, S.vy);
  set('tAlt', fmtAlt(S.h)); set('tSpd', `${v.toFixed(0)} m/s`); set('tVs', `${S.vy.toFixed(0)} m/s`); set('tHs', `${S.vx.toFixed(0)} m/s`);
  set('tMach', S.mach.toFixed(2)); set('tQ', `${(S.q / 1000).toFixed(1)} kPa`, S.load > 4 ? 'warn' : ''); set('tG', `${S.g.toFixed(1)} g`, S.g > 6 ? 'warn' : '');
  if (S.esc) { set('tAp', 'Escaping', 'good'); set('tPe', '—', ''); }
  else if (S.ap === null || !S.flags.liftoff || v < 150) { set('tAp', '—', ''); set('tPe', '—', ''); }
  else { set('tAp', fmtKm(S.ap), ''); set('tPe', S.pe < 0 ? 'Suborbital' : fmtKm(S.pe), S.pe >= 100000 ? 'good' : ''); }
  set('tRange', fmtKm(S.th * RE));
  const [lbl, cls, dis, pulse] = launchPrimaryState();
  set('primaryLabel', lbl);
  const pb = $('primary'), want = 'primary' + (cls ? ' ' + cls : '') + (pulse ? ' pulse' : '');
  if (pb.className !== want) pb.className = want; if (pb.disabled !== dis) pb.disabled = dis;
  const [pt, ptone] = launchPrompt(); set('prompt', pt, ptone);
  $('ship').style.bottom = (mapAlt(S.h) * 100).toFixed(2) + '%'; $('trail').style.height = (mapAlt(S.maxH) * 100).toFixed(2) + '%';
  const deg = S.p * 180 / Math.PI;
  $('noseG').setAttribute('transform', `rotate(${deg.toFixed(1)})`);
  const pg = $('progr');
  if (v > 20 && S.flags.liftoff) { const a = Math.atan2(S.vx, S.vy); pg.setAttribute('cx', (Math.sin(a) * 31).toFixed(1)); pg.setAttribute('cy', (-Math.cos(a) * 31).toFixed(1)); pg.style.opacity = 1; } else pg.style.opacity = 0.25;
  set('attK', `Pitch ${Math.round(deg)}°`);
  const f1 = S.stage === 1 ? S.f1 / R.s1.fuel : 0, f2 = S.f2 / R.s2.fuel;
  $('f1Bar').style.transform = `scaleX(${f1.toFixed(4)})`; $('f2Bar').style.transform = `scaleX(${f2.toFixed(4)})`;
  set('f1Pct', S.stage === 1 ? `${Math.ceil(f1 * 100)}%` : 'Dropped'); set('f2Pct', `${Math.ceil(f2 * 100)}%`);
  $('pitchL').classList.toggle('on', !!(keys.KeyA || keys.ArrowLeft || touch.L)); $('pitchR').classList.toggle('on', !!(keys.KeyD || keys.ArrowRight || touch.R));
}
function syncPro() { $('proBtn').setAttribute('aria-pressed', String(!!(LS.S && LS.S.pro))); }
function syncAuto() { $('autoBtn').setAttribute('aria-pressed', String(!!(LS.S && LS.S.auto))); }
function syncThr() { if (!LS.S) return; const el = $('thr'), v = Math.round(LS.S.thr * 100); if (+el.value !== v) el.value = v; el.style.setProperty('--fill', v + '%'); setText($('thrOut'), v + '%'); }
const WARPS = [1, 2, 5, 10, 50];
function syncWarp() { setText($('warpBtn'), `Warp ${GAME.warp}×`); }
function cycleWarp(dir) { const i = WARPS.indexOf(GAME.warp); GAME.warp = WARPS[clamp(i + dir, 0, WARPS.length - 1)]; if (dir > 0 && i === WARPS.length - 1) GAME.warp = 1; if (LS.S && LS.S.h < 70000 && GAME.warp > 5) GAME.warp = dir > 0 && i >= 2 ? 1 : Math.min(GAME.warp, 5); syncWarp(); }
$('thr').addEventListener('input', e => { if (!LS.S) return; LS.S.thr = e.target.value / 100; if (LS.S.auto) { LS.S.auto = false; syncAuto(); } syncThr(); });
$('primary').addEventListener('click', launchPrimary);
$('proBtn').addEventListener('click', () => { LS.S.pro = !LS.S.pro; if (LS.S.pro) LS.S.auto = false; syncPro(); syncAuto(); });
$('autoBtn').addEventListener('click', toggleAutoLaunch);
function toggleAutoLaunch() { const S = LS.S; if (!S || S.dead) return; S.auto = !S.auto; if (S.auto) { S.pro = false; if (S.phase === 'pad') { S.engine = true; S.phase = 'spool'; addEvent('Engine start'); } } syncAuto(); syncPro(); }
$('warpBtn').addEventListener('click', () => cycleWarp(1));
$('viewBtn').addEventListener('click', () => setViewLaunch(LS.view + 1));
for (const [id, k] of [['pitchL', 'L'], ['pitchR', 'R']]) {
  const el = $(id);
  el.addEventListener('pointerdown', e => { touch[k] = 1; try { el.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
  const up = () => { touch[k] = 0; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
// the autopilot may release the clamps itself once spooled
function launchAutoRelease() { const S = LS.S; if (S && S.auto && S.phase === 'ready') { S.phase = 'flight'; S.flags.release = true; addEvent('Clamps released'); clunk(0.5); } }
/* ================= TRANSFER (map view of the trip) ================= */
const transferScene = new THREE.Scene();
const TR = { oc: makeOC({ min: 1, max: 4000 }), t: 0, dur: 16, fast: false, view: 0, o: null };
const trLight = new THREE.DirectionalLight(0xffffff, 2.4); transferScene.add(trLight, new THREE.AmbientLight(0x30384a, 0.25));
const trSunLight = new THREE.PointLight(0xfff2dd, 2.6, 0, 0); transferScene.add(trSunLight);
function fresnelShell(r, color) {
  return mesh(new THREE.SphereGeometry(r, 64, 32), new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(color) } },
    vertexShader: `${LOGV} varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv;
      #include <logdepthbuf_vertex>
    }`,
    fragmentShader: `${LOGF} uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){
      #include <logdepthbuf_fragment>
      float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(uC * f * 1.3, 1.0); }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
}
function ringLine(r, color, op) {
  const pts = []; for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, -Math.sin(a) * r)); }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: op }));
}
function solveKepler(M, e) { let E = M; for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E; }
function enterTransfer() {
  if (GAME.rocket.single) { enterWarp(); return; }
  TR.warp = false;
  const dest = GAME.dest, o = {};
  while (transferScene.children.length > 3) transferScene.remove(transferScene.children[3]);
  const ex = earthTextures();
  if (dest === 'moon') {
    o.unit = 1e6; o.rp = 6.571; o.ra = 384.4 - 1.9; o.mu = MU;
    o.earth = mesh(new THREE.SphereGeometry(6.371, 96, 48), std(0xffffff, 0.85, 0, { map: ex.color }));
    o.earth.add(mesh(new THREE.SphereGeometry(6.4, 64, 32), new THREE.MeshStandardMaterial({ map: ex.clouds, transparent: true, depthWrite: false })), fresnelShell(6.55, 0x5d9bff));
    o.dest = mesh(new THREE.SphereGeometry(1.737, 64, 32), std(0xffffff, 1, 0, { map: moonTexture() })); o.destR = 1.737;
    transferScene.add(o.earth, o.dest, ringLine(384.4, 0x8d98b0, 0.18));
    trLight.visible = true; trSunLight.visible = false; trLight.position.set(1, 0.25, 0.5);
    o.labels = [['Earth', o.earth, ''], ['Moon', o.dest, '']];
    TR.oc.min = 0.5; TR.oc.max = 2500;
  } else {
    o.unit = 1e9; o.rp = 149.6; o.ra = 227.9; o.mu = 1.327e20;
    const sun = mesh(new THREE.SphereGeometry(0.696, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff1d0 }));
    const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sg.scale.set(40, 40, 1); sun.add(sg);
    o.earth = mesh(new THREE.SphereGeometry(2.2, 64, 32), std(0xffffff, 0.85, 0, { map: ex.color })); o.earth.add(fresnelShell(2.28, 0x5d9bff));
    o.dest = mesh(new THREE.SphereGeometry(1.6, 64, 32), std(0xffffff, 1, 0, { map: marsTexture() })); o.destR = 1.6; o.dest.add(fresnelShell(1.66, 0xd08a5a));
    transferScene.add(sun, o.earth, o.dest, ringLine(149.6, 0x5d9bff, 0.25), ringLine(227.9, 0xd08a5a, 0.25));
    trLight.visible = false; trSunLight.visible = true;
    o.labels = [['Sun', sun, ''], ['Earth', o.earth, 'not to scale'], ['Mars', o.dest, 'not to scale']];
    TR.oc.min = 1; TR.oc.max = 4000;
  }
  o.a = (o.rp + o.ra) / 2; o.e = (o.ra - o.rp) / (o.ra + o.rp); o.b = o.a * Math.sqrt(1 - o.e * o.e);
  const path = []; for (let i = 0; i <= 400; i++) { const E = i / 400 * Math.PI; path.push(new THREE.Vector3(o.a * (Math.cos(E) - o.e), 0, -o.b * Math.sin(E))); }
  o.path = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), new THREE.LineDashedMaterial({ color: 0xffb547, dashSize: o.a * 0.012, gapSize: o.a * 0.008, transparent: true, opacity: 0.7 }));
  o.path.computeLineDistances(); transferScene.add(o.path);
  o.ship = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  transferScene.add(o.ship);
  const lab = $('labels'); lab.textContent = ''; o.lblEls = [];
  for (const [name, obj, sub] of o.labels.concat([['You', o.ship, '']])) {
    const d = document.createElement('div'); d.className = 'lbl' + (name === 'You' ? ' you' : ''); d.textContent = name;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; d.append(s); }
    lab.append(d); o.lblEls.push([d, obj]);
  }
  TR.o = o; TR.t = 0; TR.fast = false; TR.view = 0; TR.done = false;
  Object.assign(TR.oc, { yaw: -0.4, pitch: 0.55, dist: dest === 'moon' ? 45 : 70, tYaw: null, tPitch: null, tDist: null });
  activeOC = TR.oc;
  const B = BODIES[dest];
  set('trBrand', dest === 'moon' ? 'To the Moon' : 'To Mars');
  set('trTitle', dest === 'moon' ? 'Coasting to the Moon' : 'Cruising to Mars');
  set('trEyebrow', dest === 'moon' ? 'Trans-lunar coast · about 3 days' : 'Interplanetary cruise · about 8.5 months');
  setText($('trSpeed'), 'Faster'); set('trView', 'View: Ship');
  setSky({ top: 0x000000, hor: 0x000000, stars: 1, halo: 0, disc: 0 });
  transferScene.environment = envMap('space');
  showMode('transfer');
}
function trState(t) {
  const o = TR.o, dest = GAME.dest;
  const E = solveKepler(Math.PI * t, o.e);
  const ship = V3(o.a * (Math.cos(E) - o.e), 0, -o.b * Math.sin(E));
  let earthP, destP;
  if (dest === 'moon') { earthP = V3(); const ph = Math.PI - (1 - t) * 0.69; destP = V3(Math.cos(ph) * 384.4, 0, -Math.sin(ph) * 384.4); }
  else { const pe = 4.46 * t, pm = Math.PI - 2.37 * (1 - t); earthP = V3(Math.cos(pe) * 149.6, 0, -Math.sin(pe) * 149.6); destP = V3(Math.cos(pm) * 227.9, 0, -Math.sin(pm) * 227.9); }
  if (t > 0.9) { const k = ss(0.9, 1, t), tgt = destP.clone().add(ship.clone().sub(destP).setLength(o.destR * 1.4)); ship.lerp(tgt, k); }
  return { ship, earthP, destP, r: Math.hypot(o.a * (Math.cos(E) - o.e), o.b * Math.sin(E)) };
}
function updateTransfer(dt) {
  if (!TR.done) {
    TR.t = Math.min(1, TR.t + dt / TR.dur * (TR.fast ? 4 : 1));
    if (TR.t >= 1) { TR.done = true; transitionTo(() => enterDescent()); }
  }
  GAME.t += dt;
}
function renderTransfer(dt) {
  if (TR.warp) { renderWarp(dt); return; }
  const o = TR.o, st = trState(TR.t), B = BODIES[GAME.dest];
  o.ship.position.copy(st.ship); o.earth.position.copy(st.earthP); o.dest.position.copy(st.destP);
  o.earth.rotation.y += dt * 0.2; o.dest.rotation.y += dt * 0.05;
  const tgt = TR.view === 1 ? st.destP : TR.view === 2 ? V3(GAME.dest === 'moon' ? -190 : 0, 0, GAME.dest === 'moon' ? -60 : 0) : st.ship;
  TR.oc.target.lerp(tgt, TR.view === 0 ? 1 : 1 - Math.exp(-dt * 3));
  ocApply(TR.oc, dt);
  const ss_ = TR.oc.dist * 0.035; o.ship.scale.set(ss_, ss_, 1);
  if (GAME.dest === 'mars') trSunLight.position.set(0, 0, 0);
  setSkySun(GAME.dest === 'moon' ? V3(1, 0.25, 0.5) : st.ship.clone().negate());
  GFX.bloomStr = 0.85; drawFrame(transferScene);
  // labels
  for (const [el, obj] of o.lblEls) {
    TMP.copy(obj.position).project(camera);
    const vis = TMP.z < 1 && Math.abs(TMP.x) < 1.1 && Math.abs(TMP.y) < 1.1;
    el.style.display = vis ? '' : 'none';
    if (vis) el.style.transform = `translate(${((TMP.x + 1) / 2 * VW).toFixed(1)}px,${((1 - TMP.y) / 2 * VH).toFixed(1)}px) translate(-50%,-150%)`;
  }
  const days = TR.t * B.travelDays, left = (1 - TR.t) * B.travelDays;
  set('trDay', `Day ${days < 10 ? days.toFixed(1) : Math.floor(days)}`);
  const dist = Math.max(0, st.ship.distanceTo(st.destP) - o.destR) * o.unit;
  set('trDist', fmtKm(dist));
  const v = Math.sqrt(o.mu * (2 / (st.r * o.unit) - 1 / (o.a * o.unit)));
  set('trVel', `${(v / 1000).toFixed(2)} km/s`);
  set('trEta', left < 1 ? `${(left * 24).toFixed(0)} h` : `${left < 10 ? left.toFixed(1) : Math.round(left)} days`);
  set('trChip', TR.t > 0.9 ? 'Approach' : 'Coasting', TR.t > 0.9 ? 'amber' : 'cyan');
}
$('trSpeed').addEventListener('click', () => { TR.fast = !TR.fast; setText($('trSpeed'), TR.fast ? 'Normal speed' : 'Faster'); });
$('trSkip').addEventListener('click', () => { TR.t = Math.max(TR.t, 0.97); });
$('trView').addEventListener('click', () => setViewTransfer(TR.view + 1));
function setViewTransfer(i) {
  if (TR.warp) return;
  TR.view = (i + 3) % 3; set('trView', 'View: ' + ['Ship', 'Destination', 'Overview'][TR.view]);
  const m = GAME.dest === 'moon';
  if (TR.view === 0) ocPreset(TR.oc, TR.oc.yaw, 0.5, m ? 45 : 70);
  if (TR.view === 1) ocPreset(TR.oc, TR.oc.yaw, 0.35, m ? 9 : 9);
  if (TR.view === 2) ocPreset(TR.oc, -0.2, 1.1, m ? 650 : 700);
}

/* ================= TERRAIN (Moon / Mars) ================= */
const surfScene = new THREE.Scene();
const SF = { body: null, A: 1600, K: 6, seg: COARSE ? 300 : 400, heights: null, colliders: [], nodes: [], built: null };
const warpU = u => SF.A * (u + SF.K * u * u * u) / (1 + SF.K);
function unwarp(x) { let u = clamp(x / SF.A, -1, 1); for (let i = 0; i < 6; i++) { const f = (u + SF.K * u * u * u) / (1 + SF.K) - x / SF.A, d = (1 + 3 * SF.K * u * u) / (1 + SF.K); u -= f / d; } return clamp(u, -1, 1); }
function groundAt(x, z) {
  if (MP.active) return KarmanSim.ground(x, z);
  const n = SF.seg, fu = (unwarp(x) + 1) / 2 * n, fv = (unwarp(z) + 1) / 2 * n;
  const i = clamp(Math.floor(fu), 0, n - 1), j = clamp(Math.floor(fv), 0, n - 1);
  const xa = warpU(i / n * 2 - 1), xb = warpU((i + 1) / n * 2 - 1), za = warpU(j / n * 2 - 1), zb = warpU((j + 1) / n * 2 - 1);
  const u = clamp((x - xa) / (xb - xa), 0, 1), v = clamp((z - za) / (zb - za), 0, 1);
  const H = SF.heights, w = n + 1, a = H[j * w + i], b = H[j * w + i + 1], c = H[(j + 1) * w + i], d = H[(j + 1) * w + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function makeHeightFn(body) {
  const r = mulberry(body === 'moon' ? 77 : 313), craters = [];
  for (let i = 0; i < (body === 'moon' ? 110 : 45); i++) {
    const rad = body === 'moon' ? 4 + Math.pow(r(), 2.4) * 120 : 6 + Math.pow(r(), 2.6) * 90;
    const ang = r() * Math.PI * 2, dist = 140 + r() * 1150;
    craters.push([Math.cos(ang) * dist, Math.sin(ang) * dist, rad, rad * (0.18 + r() * 0.08)]);
  }
  for (let i = 0; i < 26; i++) { const ang = r() * Math.PI * 2, dist = 50 + r() * 250, rad = 1.5 + r() * 5; craters.push([Math.cos(ang) * dist, Math.sin(ang) * dist, rad, rad * 0.2]); }
  return (x, z) => {
    const rr = Math.hypot(x, z);
    let h;
    if (body === 'proxima') {
      h = (fbm2(x / 420 + 2, z / 420, 4) - 0.5) * 30 + (fbm2(x / 60, z / 60, 3) - 0.5) * 3 + (n2(x / 8, z / 8) - 0.5) * 0.4;
      const sp = 1 - Math.abs(fbm2(x / 160 + 9, z / 160, 3) - 0.5) * 2; h += Math.pow(Math.max(0, sp - 0.72) / 0.28, 2) * 55 * ss(220, 500, rr);
      h += ss(1050, 1550, rr) * 160;
      return h * ss(28, 120, rr);
    } else if (body === 'moon') {
      h = (fbm2(x / 600 + 3, z / 600, 4) - 0.5) * 46 + (fbm2(x / 90, z / 90, 3) - 0.5) * 7 + (n2(x / 9, z / 9) - 0.5) * 0.7;
      h += ss(900, 1500, rr) * (150 + (fbm2(x / 240, z / 240, 3) - 0.5) * 200);
    } else {
      const dune = Math.sin((x * 0.8 + z * 0.6) / 22 + fbm2(x / 120, z / 120, 2) * 6) * 1.3;
      h = (fbm2(x / 500 + 9, z / 500, 4) - 0.5) * 34 + (fbm2(x / 70, z / 70, 3) - 0.5) * 5 + dune * ss(60, 300, rr) + (n2(x / 8, z / 8) - 0.5) * 0.6;
      const mesa = ss(0.52, 0.58, fbm2(x / 380 + 40, z / 380, 3)) * 90;
      h += mesa * ss(500, 900, rr) + ss(1000, 1550, rr) * 140;
    }
    for (const c of craters) {
      const dx = x - c[0], dz = z - c[1]; if (Math.abs(dx) > c[2] * 1.7 || Math.abs(dz) > c[2] * 1.7) continue;
      const d = Math.hypot(dx, dz) / c[2];
      if (d < 1) h += c[3] * (d * d - 1) * 1.1; if (d < 1.7) h += c[3] * 0.38 * Math.exp(-Math.pow((d - 1) / 0.22, 2));
    }
    const f = ss(28, 120, rr);
    return h * f;
  };
}
function buildSurface(B) {
  if (SF.built === B.id) return;
  while (surfScene.children.length) surfScene.remove(surfScene.children[0]);
  SF.body = B.id;
  SF.seg = MP.active ? 400 : COARSE ? 300 : 400;
  const hf = makeHeightFn(B.id), n = SF.seg, w = n + 1;
  const pos = new Float32Array(w * w * 3), col = new Float32Array(w * w * 3), uv = new Float32Array(w * w * 2), H = new Float32Array(w * w);
  const moon = B.id === 'moon';
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = warpU(i / n * 2 - 1), z = warpU(j / n * 2 - 1), y = hf(x, z), k = j * w + i;
    H[k] = y; pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
    const nn = fbm2(x / 40 + 5, z / 40, 3), m = fbm2(x / 260, z / 260, 2);
    let c;
    if (moon) { const g = 0.27 + nn * 0.14 + (m - 0.5) * 0.1 + clamp(y / 400, -0.04, 0.1); c = [g, g * 0.985, g * 0.96]; }
    else if (B.id === 'proxima') { const t = clamp(nn * 1.3 - 0.15, 0, 1), mo = clamp((m - 0.4) * 2.5, 0, 1); c = [lerp(0.2, 0.3, t) * (1 - mo * 0.4), lerp(0.13, 0.17, t) + mo * 0.06, lerp(0.22, 0.26, t) + mo * 0.03]; if (y > 25) { const s2 = ss(25, 70, y); c = [lerp(c[0], 0.32, s2), lerp(c[1], 0.2, s2), lerp(c[2], 0.22, s2)]; } }
    else { const t = clamp(nn * 1.4 - 0.2, 0, 1), dk = clamp((m - 0.45) * 2.5, 0, 1) * 0.35; c = [lerp(0.62, 0.78, t) * (1 - dk), lerp(0.32, 0.47, t) * (1 - dk), lerp(0.18, 0.3, t) * (1 - dk * 0.8)]; if (y > 60) { const s = ss(60, 140, y); c = [lerp(c[0], 0.55, s), lerp(c[1], 0.36, s), lerp(c[2], 0.26, s)]; } }
    col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
  }
  const idx = new Uint32Array(n * n * 6); let q = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
  SF.heights = H;
  const terrain = new THREE.Mesh(geo, std(0xffffff, 0.96, 0, { vertexColors: true, map: detailTexture(), envMapIntensity: 0.3 }));
  terrain.receiveShadow = true; surfScene.add(terrain); SF.terrain = terrain;
  surfScene.environment = envMap(B.id);
  // rocks
  const r = mulberry(moon ? 5 : 9), N = MP.active ? 450 : COARSE ? 450 : 800;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), std(moon ? 0x8e8b85 : B.id === 'proxima' ? 0x3c2c44 : 0x8a4a2c, 0.9, 0, { flatShading: true, envMapIntensity: 0.4 }), N);
  rocks.castShadow = rocks.receiveShadow = true;
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler(), sc = V3(), p = V3();
  SF.colliders = [];
  for (let i = 0; i < N; i++) {
    let x, z, rr; do { const a = r() * Math.PI * 2; rr = 12 + Math.pow(r(), 1.4) * 1300; x = Math.cos(a) * rr; z = Math.sin(a) * rr; } while (Math.hypot(x, z) < 14);
    const s = (0.15 + Math.pow(r(), 3) * 2.2) * (rr > 400 ? 1.6 : 1);
    sc.set(s * (0.8 + r() * 0.5), s * (0.5 + r() * 0.5), s * (0.8 + r() * 0.5)); e.set(r() * 3, r() * 3, r() * 3); qq.setFromEuler(e);
    p.set(x, groundAt(x, z) + sc.y * 0.3, z); m4.compose(p, qq, sc); rocks.setMatrixAt(i, m4);
    if (s > 0.9 && rr < 450) SF.colliders.push({ x, z, r: s * 0.9, kind: 'rock' });
  }
  surfScene.add(rocks);
  // lights
  const prox = B.id === 'proxima';
  const sunDir = moon ? V3(0.6, 0.36, 0.45).normalize() : prox ? V3(0.72, 0.22, 0.42).normalize() : V3(0.45, 0.7, 0.35).normalize();
  const sl = new THREE.DirectionalLight(moon ? 0xffffff : prox ? 0xff9a6a : 0xffe6cc, moon ? 2.3 : prox ? 1.9 : 2.0); sl.position.copy(sunDir).multiplyScalar(100);
  sl.castShadow = true; setupShadow(sl, 45, 1, 600); SF.sun = sl;
  surfScene.add(sl, sl.target);
  surfScene.add(new THREE.HemisphereLight(moon ? 0x4a505c : prox ? 0x9a4a5a : 0xe6b48a, moon ? 0x45423c : prox ? 0x2a1a3a : 0x6a3a22, moon ? 0.25 : prox ? 0.7 : 0.5));
  SF.sunDir = sunDir;
  surfScene.fog = moon ? null : prox ? new THREE.Fog(0x4e2232, 160, 2300) : new THREE.Fog(0xcda07a, 250, 2700);
  if (prox) buildBioPlants();
  // landing zone and beacon
  const ring = mesh(new THREE.RingGeometry(9.6, 10, 64), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), 0, 0.08, 0); ring.rotation.x = -Math.PI / 2;
  const beam = mesh(new THREE.CylinderGeometry(0.8, 0.8, 600, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, 300, 0);
  surfScene.add(ring, beam); SF.ring = ring; SF.beam = beam;
  // resource deposits
  SF.nodes = [];
  for (let i = 0; i < 26; i++) {
    spawnNode(r, i < 18 ? 'mat' : 'ice');
    if (MP.active) { const n = SF.nodes[i], data = MP.world.nodes[i]; Object.assign(n, { uid: data.uid, x: data.x, z: data.z, y: groundAt(data.x, data.z), alive: data.readyAt <= MP.world.time }); n.obj.position.set(n.x, n.y, n.z); }
  }
  buildAnomalies(B);
  SF.built = B.id;
}
const NODE_MAT = { mat: std(0xffb547, 0.35, 0.3, { emissive: 0xff8a1a, emissiveIntensity: 1.0 }), ice: std(0x9fe6ff, 0.15, 0.1, { emissive: 0x3ab8ff, emissiveIntensity: 0.8, transparent: true, opacity: 0.9 }) };
function spawnNode(r, type) {
  let x, z; r = r || Math.random;
  for (let k = 0; k < 20; k++) { const a = r() * Math.PI * 2, d = 30 + r() * 330; x = Math.cos(a) * d; z = Math.sin(a) * d; if (Math.abs(groundAt(x + 1, z) - groundAt(x - 1, z)) < 0.8) break; }
  const g = new THREE.Group(), y = groundAt(x, z);
  for (let i = 0; i < 4; i++) { const c = mesh(new THREE.OctahedronGeometry(0.35 + Math.random() * 0.35, 0), NODE_MAT[type], (Math.random() - 0.5) * 1.2, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 1.2); c.scale.y = 1.6 + Math.random(); c.rotation.set(Math.random(), Math.random(), Math.random() * 0.4); g.add(c); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: type === 'mat' ? 0xff9a30 : 0x60c8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
  glow.scale.set(4, 4, 1); glow.position.y = 0.6; g.add(glow);
  g.position.set(x, y, z); surfScene.add(g);
  SF.nodes.push({ x, z, y, type, obj: g, alive: true, t: 0 });
}

/* ================= DESCENT ================= */
const DS = { L: null, B: null, lander: null, plume: null, oc: makeOC({ min: 10, max: 900 }), dust: particleSystem(600, false), done: false };
function enterDescent() {
  const B = BODIES[GAME.dest]; DS.B = B;
  showLoading(B.id === 'moon' ? 'Approaching the Moon…' : 'Entering Mars orbit…');
  setTimeout(() => {
    buildSurface(B);
    surfaceSkySetup(B);
    if (DS.lander) surfScene.remove(DS.lander);
    DS.lander = buildLander(B.id); surfScene.add(DS.lander); shadowAll(DS.lander, true, true);
    DS.plume = makePlume(DS.lander.userData.nozzle, true); DS.plume.position.y = DS.lander.userData.bellY; DS.lander.add(DS.plume);
    surfScene.add(DS.dust.pts); DS.dust.list.length = 0;
    const L = ldNew(B); L.y += groundAt(L.x, L.z); DS.L = L; DS.done = false;
    Object.assign(DS.oc, { yaw: Math.atan2(L.x, L.z), pitch: 0.22, dist: 34, tYaw: null, tPitch: null, tDist: null });
    activeOC = DS.oc;
    SF.beam.visible = true; SF.ring.visible = true;
    setThrDs(0); syncDsAuto();
    set('dsBrand', { moon: 'Lunar descent', mars: 'Mars descent', proxima: 'Proxima b descent' }[B.id]);
    renderColonyStatic(B);
    hideLoading(); hideBanner();
    showMode('descent');
    toast(B.id === 'moon' ? 'Lunar orbit reached. Steer for the amber beacon.' : B.id === 'proxima' ? 'Welcome to another star system. Gravity here is strong, so keep plenty of thrust.' : 'Heat shield and parachute done. Engines on — steer for the beacon.');
  }, 40);
}
function setThrDs(v) { DS.thrSet = clamp(v, 0, 1); const el = $('dsThr'), p = Math.round(DS.thrSet * 100); if (+el.value !== p) el.value = p; el.style.setProperty('--fill', p + '%'); setText($('dsThrOut'), p + '%'); }
function syncDsAuto() { $('dsAuto').setAttribute('aria-pressed', String(!!(DS.L && DS.L.auto))); }
$('dsThr').addEventListener('input', e => { setThrDs(e.target.value / 100); if (DS.L && DS.L.auto) { DS.L.auto = false; syncDsAuto(); } });
$('dsAuto').addEventListener('click', () => { if (!DS.L) return; DS.L.auto = !DS.L.auto; syncDsAuto(); });
const burnBtn = $('dsBurn');
burnBtn.addEventListener('pointerdown', e => { touch.burn = 1; try { burnBtn.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); audioInit(); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) burnBtn.addEventListener(ev, () => { touch.burn = 0; });
function camAxes(oc) { const fx = -Math.sin(oc.yaw), fz = -Math.cos(oc.yaw); return { fx, fz, rx: -fz, rz: fx }; }
function updateDescent(dt) {
  const L = DS.L, B = DS.B; if (!L) return;
  let iF = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + touch.sy;
  let iR = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touch.sx;
  const mag = Math.hypot(iF, iR); if (mag > 1) { iF /= mag; iR /= mag; }
  if (keys.KeyR) setThrDs(DS.thrSet + 0.7 * dt);
  if (keys.KeyF) setThrDs(DS.thrSet - 0.7 * dt);
  const burning = keys.Space || touch.burn;
  if (L.auto && (mag > 0.1 || burning || keys.KeyR || keys.KeyF)) { L.auto = false; syncDsAuto(); }
  const ax = camAxes(DS.oc);
  const inp = { tx: ax.rx * iR + ax.fx * iF, tz: ax.rz * iR + ax.fz * iF, thr: burning ? 1 : DS.thrSet };
  const n = 4;
  for (let i = 0; i < n; i++) ldStep(L, B, dt / n, inp, groundAt);
  if (L.auto) setThrDs(L.thr);
  // dust
  if (L.alt < 40 && L.thrEff > 0.05 && !L.crashed) {
    const g = groundAt(L.x, L.z), cnt = Math.floor(L.thrEff * (1 - L.alt / 40) * 300 * dt + Math.random());
    for (let i = 0; i < cnt && DS.dust.list.length < DS.dust.max; i++) {
      const a = Math.random() * Math.PI * 2, sp = 14 + Math.random() * 26;
      DS.dust.list.push({ x: L.x + Math.cos(a) * 2, y: g + 0.3, z: L.z + Math.sin(a) * 2, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 4, vz: Math.sin(a) * sp, r: 0.8 + Math.random(), gr: B.id === 'moon' ? 1.2 : 3, age: 0, life: 1.4 + Math.random() * 1.8 });
    }
  }
  stepDust(DS.dust, dt, B);
  if (!DS.done && (L.landed || L.crashed)) {
    DS.done = true;
    if (L.landed) { clunk(0.6); showBanner('touchdown'); }
    else { DS.flash = 1; boom(); explodeLocal(DS.dust, V3(L.x, L.y + 2, L.z)); DS.lander.visible = false; showBanner('landerCrash'); }
  }
  GAME.t += dt;
}
function stepDust(ps, dt, B) {
  const L = ps.list, drag = B.id === 'moon' ? 0 : 1.6, g = B.g;
  for (let i = L.length - 1; i >= 0; i--) {
    const p = L[i], f = Math.exp(-drag * dt);
    p.vx *= f; p.vz *= f; p.vy = p.vy * f - (p.fire ? -0.5 : g * 0.3) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += p.gr * dt; p.age += dt;
    if (p.age > p.life) { L[i] = L[L.length - 1]; L.pop(); }
  }
}
function writeDust(ps, B) {
  let n = 0; const moon = B.id === 'moon';
  for (const p of ps.list) {
    ps.pos[n * 3] = p.x; ps.pos[n * 3 + 1] = p.y; ps.pos[n * 3 + 2] = p.z; ps.size[n] = p.r * 2;
    const t = p.age / p.life; ps.alpha[n] = (1 - t) * (p.fire ? 0.9 : 0.5);
    if (p.fire) { ps.col[n * 3] = 1; ps.col[n * 3 + 1] = lerp(0.8, 0.3, t); ps.col[n * 3 + 2] = 0.15; }
    else if (moon) { ps.col[n * 3] = ps.col[n * 3 + 1] = ps.col[n * 3 + 2] = 0.62; }
    else { ps.col[n * 3] = 0.78; ps.col[n * 3 + 1] = 0.52; ps.col[n * 3 + 2] = 0.34; }
    n++;
  }
  flushParticles(ps, n);
}
function explodeLocal(ps, at) {
  for (let i = 0; i < 160 && ps.list.length < ps.max; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI / 2, sp = 5 + Math.random() * 25;
    ps.list.push({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * Math.cos(b) * sp, vy: Math.sin(b) * sp, vz: Math.sin(a) * Math.cos(b) * sp, r: 1 + Math.random() * 2, gr: 2, age: 0, life: 1.5 + Math.random() * 2, fire: i < 60 });
  }
}
function renderDescent(dt) {
  const L = DS.L, B = DS.B; if (!L) return;
  DS.lander.position.set(L.x, L.y, L.z); DS.lander.rotation.set(L.tz, 0, -L.tx);
  setPlume(DS.plume, L.crashed ? 0 : L.thrEff, B.id === 'moon' ? 0 : 0.02, GAME.t);
  DS.oc.target.set(L.x, L.y + 3, L.z);
  ocApply(DS.oc, dt, groundAt(camera.position.x, camera.position.z) + 1 - (L.y + 3) + DS.oc.target.y);
  SF.beam.material.opacity = 0.07 + 0.04 * Math.sin(GAME.t * 3) * (RM ? 0 : 1);
  sunFollow(L.x, L.y, L.z); GFX.bloomStr = 0.5;
  writeDust(DS.dust, B);
  drawFrame(surfScene);
  // hud
  const m = B.lander.dry + L.fuel, avail = B.lander.F / m - B.g, vs = L.vy, hs = Math.hypot(L.vx, L.vz);
  const need = vs < 0 ? vs * vs / (2 * Math.max(1, L.alt)) : 0;
  set('dsClock', fmtAlt(L.alt));
  set('dsAlt', fmtAlt(L.alt));
  set('dsVs', `${(-vs).toFixed(1)} m/s`, (L.alt < 60 && -vs > 3.5) || need > avail * 0.8 ? 'warn' : (-vs < 3.5 && L.alt < 30 ? 'good' : ''));
  set('dsHs', `${hs.toFixed(1)} m/s`, L.alt < 60 && hs > 2.5 ? 'warn' : '');
  set('dsTilt', `${Math.round(Math.hypot(L.tx, L.tz) * 180 / Math.PI)}°`);
  set('dsFuel', `${Math.ceil(L.fuel / B.lander.fuel * 100)}%`, L.fuel < B.lander.fuel * 0.15 ? 'warn' : '');
  set('dsZone', `${Math.hypot(L.x, L.z).toFixed(0)} m`);
  let pt = '', tone = '';
  if (L.crashed) { pt = 'The lander was destroyed on impact.'; tone = 'warn'; }
  else if (L.landed) { pt = 'Touchdown!'; tone = 'good'; }
  else if (L.fuel <= 0) { pt = 'Out of fuel!'; tone = 'warn'; }
  else if (need > avail * 0.8 && L.alt > 5) { pt = 'Falling too fast! Full throttle now.'; tone = 'warn'; }
  else if (L.auto) pt = 'Autoland is flying. Tilt or burn to take over.';
  else if (L.alt > 400) pt = 'Steer toward the amber beacon. Hold Burn to slow your fall.';
  else if (L.alt > 60) pt = 'Lean into your drift to cancel it. Aim to arrive slow.';
  else { pt = 'Touch down gently: under 3 m/s down, almost no drift, level.'; }
  set('dsPrompt', pt, tone);
  set('dsChip', L.landed ? 'Landed' : L.crashed ? 'Lost' : L.auto ? 'Autoland' : 'Powered descent', L.landed ? 'green' : L.crashed ? 'red' : L.auto ? 'cyan' : 'amber');
  audioEngine(L.crashed ? 0 : L.thrEff * 0.75, B.id === 'moon' ? 0.15 : 0.35, 0);
}

function sunFollow(x, y, z) {
  const l = SF.sun; if (!l) return;
  l.castShadow = shadowsOn();
  l.target.position.set(x, y, z); l.position.set(x + SF.sunDir.x * 200, y + SF.sunDir.y * 200, z + SF.sunDir.z * 200);
  l.target.updateMatrixWorld();
}
/* ================= SURFACE: first-person colony builder ================= */
const MODS = [
  { id: 'flag', name: 'Flag', cost: {}, r: 1.2, info: 'Claim the site' },
  { id: 'solar', name: 'Solar array', cost: { mat: 30 }, r: 3.6, info: 'Makes power' },
  { id: 'hab', name: 'Habitat', cost: { mat: 60 }, r: 6.2, info: 'Homes 4 colonists' },
  { id: 'green', name: 'Greenhouse', cost: { mat: 50, water: 10 }, r: 5.6, info: 'Food for 4' },
  { id: 'oxy', name: 'Oxygen plant', cost: { mat: 40 }, r: 3.8, info: 'Air for 4, uses water' },
  { id: 'ice', name: 'Ice extractor', cost: { mat: 45 }, r: 3.6, info: '+3 water a day' },
  { id: 'mine', name: 'Mining rig', cost: { mat: 45 }, r: 4.2, info: '+12 materials a day' },
  { id: 'dish', name: 'Comms dish', cost: { mat: 35 }, r: 3.4, info: 'Calls supply ships' }
];
const MODMAP = Object.fromEntries(MODS.map(m => [m.id, m]));
const POWER_USE = { hab: 1, green: 1, oxy: 2, ice: 1, mine: 2, dish: 1, solar: 0, flag: 0 };
const SOL = 45;
let CO = null;
const PL = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: true, o2: 1, locked: false, bob: 0 };
const SU = { objs: [], ghost: null, sel: null, rot: 0, build: false, aim: null, target: null, colonists: [], colIM: null, helmIM: null, saveT: 0, hudT: 0, oldLanders: [], earthFar: null, lookId: null, lx: 0, ly: 0, shortT: 0, rates: {} };

function newColony() { return { v: 1, mods: [], res: { mat: 160, water: 20, food: 12, o2: 12 }, pop: 0, sol: 0, done: {}, landers: [], next: 1 }; }
function loadColony(B) { const c = SAVE.colonies[B.id]; if (c && c.v === 1) return c; return (SAVE.colonies[B.id] = newColony()); }
function saveColony() { if (!CO || !SF.body) return; writeSave(true); }
function colonySummary(id) { const s = SAVE.colonies[id]; return s && (s.mods.length || s.pop) ? s : null; }

/* ---------- module models ---------- */
let flagTex = null;
function colonyFlag() {
  if (flagTex) return flagTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#14234a'; x.fillRect(0, 0, 256, 160);
  x.fillStyle = '#ffb547'; x.beginPath(); x.moveTo(0, 0); x.lineTo(110, 80); x.lineTo(0, 160); x.closePath(); x.fill();
  x.fillStyle = '#e9edf6'; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 10 : 24; x.lineTo(175 + Math.cos(a) * rr, 80 + Math.sin(a) * rr); } x.closePath(); x.fill();
  x.fillStyle = 'rgba(233,237,246,.85)'; x.fillRect(120, 128, 120, 6);
  flagTex = new THREE.CanvasTexture(c); flagTex.encoding = THREE.sRGBEncoding; return flagTex;
}
const MM = {
  hull: std(0xc6c3bc, 0.55, 0.1, { envMapIntensity: 0.6 }), hullDark: std(0x8d9098, 0.6, 0.4), window: std(0xffd59a, 0.3, 0, { emissive: 0xffb050, emissiveIntensity: 1.3 }),
  glass: std(0xbfe8ff, 0.05, 0.2, { transparent: true, opacity: 0.32, depthWrite: false }), plant: std(0x56c26a, 0.7, 0, { emissive: 0x1d6a2a, emissiveIntensity: 0.6 }),
  tank: std(0xd8dde4, 0.35, 0.5), blue: std(0x4fa6d8, 0.4, 0.3), pipe: std(0x6d727a, 0.4, 0.8), amber: std(0xffb547, 0.5, 0.2)
};
function shadowDisc(r) {
  const m = mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: glowTexture(), transparent: true, opacity: 0.5, depthWrite: false }), 0, 0.06, 0);
  m.rotation.x = -Math.PI / 2; return m;
}
function buildModule(id) {
  const g = new THREE.Group(); g.userData.id = id;
  if (id === 'flag') {
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 3, 8), MAT.steel, 0, 1.5, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), MAT.steel, 0.75, 2.95, 0).rotateZ(Math.PI / 2));
    const cloth = mesh(new THREE.PlaneGeometry(1.5, 0.94, 12, 4), new THREE.MeshStandardMaterial({ map: colonyFlag(), side: THREE.DoubleSide, roughness: 0.8 }), 0.76, 2.48, 0);
    g.add(cloth); g.userData.cloth = cloth;
  } else if (id === 'solar') {
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.2, 10), MAT.steel, 0, 1.1, 0));
    const arm = new THREE.Group(); arm.position.y = 2.2; g.add(arm);
    const pg = new THREE.BoxGeometry(2.8, 0.08, 2.0);
    for (const x of [-1.5, 1.5]) { const p = mesh(pg, MAT.panel, x, 0, 0); arm.add(p); arm.add(mesh(new THREE.BoxGeometry(2.82, 0.1, 0.06), MAT.steel, x, 0, 1.0)); }
    arm.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), MAT.dark));
    g.userData.arm = arm;
  } else if (id === 'hab') {
    buildHabitat(g);
  } else if (id === 'green') {
    g.add(mesh(new THREE.BoxGeometry(10.5, 0.4, 5.2), MM.hullDark, 0, 0.1, 0));
    const dome = mesh(new THREE.CylinderGeometry(2.5, 2.5, 10, 24, 1, true, 0, Math.PI), MM.glass, 0, 0.3, 0); dome.rotation.z = Math.PI / 2; dome.rotation.y = Math.PI / 2; dome.rotation.order = 'YXZ'; dome.rotation.set(0, 0, Math.PI / 2); g.add(dome);
    for (const z of [-1.2, 0, 1.2]) for (let x = -4.2; x <= 4.2; x += 1.4) { const p = mesh(new THREE.SphereGeometry(0.42, 8, 6), MM.plant, x, 0.75, z); p.scale.y = 0.8; g.add(p); }
    for (const x of [-5.1, 5.1]) g.add(mesh(new THREE.CylinderGeometry(2.55, 2.55, 0.2, 24, 1, false, 0, Math.PI), MM.hull, x, 0.3, 0).rotateZ(Math.PI / 2).rotateX(0));
  } else if (id === 'oxy') {
    for (const x of [-1.2, 1.2]) { g.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.2, 20), MM.tank, x, 1.8, 0)); g.add(mesh(new THREE.SphereGeometry(0.9, 20, 10), MM.tank, x, 3.4, 0)); g.add(mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.25, 20), MM.blue, x, 2.2, 0)); }
    g.add(mesh(new THREE.BoxGeometry(1.4, 1.2, 1.6), MM.hullDark, 0, 0.6, 1.6));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 8), MAT.steel, 0, 3.2, 0).rotateZ(Math.PI / 2));
  } else if (id === 'ice') {
    g.add(mesh(new THREE.BoxGeometry(3, 1.6, 2.2), MM.hull, 0, 0.8, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.2, 18), MM.blue, -1.9, 1.1, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8), MAT.steel, 1, 1.3, 0.6));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), MAT.dark, 1, 2.7, 0.6));
  } else if (id === 'mine') {
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; legBetween(g, V3(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6), V3(0, 6, 0), 0.12, MM.amber); }
    const head = new THREE.Group(); head.position.y = 3; g.add(head);
    head.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12), MM.hullDark));
    head.add(mesh(new THREE.ConeGeometry(0.4, 1.2, 12), MAT.steel, 0, -1.2, 0).rotateX(Math.PI));
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 8), MAT.steel, 0, 4.5, 0));
    g.add(mesh(new THREE.BoxGeometry(2, 1.2, 1.4), MM.hull, 2.4, 0.6, 1.2));
    g.userData.head = head;
  } else if (id === 'dish') {
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.4; legBetween(g, V3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4), V3(0, 2.4, 0), 0.07, MAT.steel); }
    const d = new THREE.Group(); d.position.y = 2.6; g.add(d);
    const bowl = mesh(new THREE.SphereGeometry(2.2, 28, 12, 0, Math.PI * 2, 0, Math.PI / 3.2), MM.hull); bowl.rotation.x = Math.PI; bowl.position.y = 2.0; d.add(bowl);
    d.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), MAT.steel, 0, 0.9, 0));
    const lamp = mesh(new THREE.SphereGeometry(0.12, 8, 6), MAT.redLamp, 0, 1.75, 0); d.add(lamp);
    d.rotation.set(-0.6, 0.8, 0); g.userData.lamp = lamp;
  }
  if (id !== 'flag') g.add(shadowDisc(MODMAP[id].r * 1.05));
  return g;
}
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x7fe3a4, transparent: true, opacity: 0.38, depthWrite: false });
function makeGhost(id) { const g = buildModule(id); g.traverse(o => { if (o.isMesh) o.material = ghostMat; }); return g; }

/* ---------- entering the surface ---------- */
function surfaceSkySetup(B) {
  if (!SU.starGlow) {
    SU.starGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff6a3a, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true })); SU.starGlow.scale.set(2600, 2600, 1); farGroup.add(SU.starGlow);
    SU.alphaCen = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff2c8, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true })); SU.alphaCen.scale.set(260, 260, 1); farGroup.add(SU.alphaCen);
  }
  SU.starGlow.visible = SU.alphaCen.visible = B.id === 'proxima';
  if (B.id === 'proxima') {
    setSky({ top: 0x1c0b26, hor: 0x8a3a2c, bot: 0x3a1a24, stars: 0.3, halo: 1.1, sunCol: new THREE.Color(1, 0.45, 0.25) });
    SU.starGlow.position.copy(SF.sunDir).multiplyScalar(1.1e4); SU.alphaCen.position.set(-0.5, 0.55, -0.67).normalize().multiplyScalar(1.1e4);
    if (SU.earthFar) SU.earthFar.visible = false;
  } else if (B.id === 'moon') {
    setSky({ top: 0x000000, hor: 0x020203, bot: 0x000000, stars: 0.9, halo: 0.05 });
    if (!SU.earthFar) SU.earthFar = farBody(earthTextures().color, 0.95);
    SU.earthFar.visible = true; placeFar(SU.earthFar, V3(-0.35, 0.62, -0.7));
  } else {
    setSky({ top: 0xa77a55, hor: 0xd9b48c, bot: 0xc9a07a, stars: 0, halo: 0.55, sunCol: new THREE.Color(0.8, 0.88, 1.0) });
    if (SU.earthFar) SU.earthFar.visible = false;
  }
  if (LW.moonFar) LW.moonFar.visible = false; if (LW.marsFar) LW.marsFar.visible = false;
  setSkySun(SF.sunDir);
}
function renderColonyStatic(B) {
  for (const o of SU.objs) surfScene.remove(o.obj);
  for (const o of SU.oldLanders) surfScene.remove(o);
  SU.objs = []; SU.oldLanders = [];
  CO = loadColony(B);
  for (const m of CO.mods) addModuleObj(m, true);
  for (const l of CO.landers) { const g = buildLander(B.id); shadowAll(g, true, true); g.position.set(l.x, groundAt(l.x, l.z), l.z); g.rotation.y = l.ry || 0; surfScene.add(g); SU.oldLanders.push(g); }
  ensureColonists();
}
function addModuleObj(m, instant) {
  const g = buildModule(m.id);
  if (m.id === 'hab' && m.fy === undefined) m.fy = habFloor(m);
  g.position.set(m.x, m.id === 'hab' ? m.fy : groundAt(m.x, m.z) - 0.05, m.z); g.rotation.y = m.rot;
  if (m.id === 'solar') { const s = SF.sunDir; const arm = g.userData.arm; arm.rotation.order = 'YXZ'; arm.rotation.set(Math.PI / 2 - Math.asin(s.y), Math.atan2(s.x, s.z) - m.rot, 0); }
  g.scale.setScalar(instant ? 1 : 0.01);
  shadowAll(g, true, true); g.traverse(o => { if (o.isMesh && o.material === MM.glass) o.castShadow = false; });
  surfScene.add(g);
  SU.objs.push({ m, obj: g, grow: instant ? 1 : 0 });
}
function enterSurface() {
  const B = DS.B;
  SF.beam.visible = false;
  const L = DS.L, lr = DS.lander.userData;
  PL.x = L.x; PL.z = L.z + lr.hatch.z + 1.2; PL.y = groundAt(PL.x, PL.z); PL.vx = PL.vy = PL.vz = 0; PL.pitch = -0.05; PL.o2 = 1; PL.yaw = Math.PI;
  SU.build = false; setBuild(false); SU.sel = null;
  DS.lander.rotation.set(0, 0, 0); DS.plume.visible = false;
  camera.near = 0.05; camera.updateProjectionMatrix();
  activeOC = null;
  rebuildColliders();
  ensureCombat(true); syncWeaponHud(); syncPowerHud(true);
  SF.ring.visible = false;
  set('cName', B.base);
  buildBarUI();
  renderGoals(true);
  showMode('surface');
  $('lockHint').hidden = COARSE;
  toast(B.id === 'moon' ? 'You are standing on the Moon. Plant your flag first.' : 'You are standing on Mars. Plant your flag first.', 'good');
}
function rebuildColliders() {
  SU.col = SF.colliders.slice();
  if (DS.lander) SU.col.push({ x: DS.L.x, z: DS.L.z, r: DS.lander.userData.foot * 0.75, kind: 'lander' });
  for (const l of CO.landers) SU.col.push({ x: l.x, z: l.z, r: 2.6, kind: 'old' });
  for (const o of SU.objs) if (o.m.id !== 'flag') SU.col.push({ x: o.m.x, z: o.m.z, r: o.m.id === 'hab' ? 5.3 : MODMAP[o.m.id].r * (o.m.id === 'green' ? 0.85 : 0.82), kind: 'mod', ref: o, hab: o.m.id === 'hab' });
}

/* ---------- pointer & look ---------- */
document.addEventListener('pointerlockchange', () => { PL.locked = document.pointerLockElement === cv; if (GAME.mode === 'surface') $('lockHint').hidden = PL.locked || COARSE || !$('landerMenu').hidden; });
document.addEventListener('mousemove', e => { if (GAME.mode === 'surface' && PL.locked) { PL.yaw -= e.movementX * 0.0022; PL.pitch = clamp(PL.pitch - e.movementY * 0.0022, -1.45, 1.45); } });
function surfacePointerDown(e) {
  if (!$('landerMenu').hidden) return;
  if (e.pointerType === 'mouse') {
    if (!PL.locked) {
      try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
      SU.lookId = e.pointerId; SU.lx = e.clientX; SU.ly = e.clientY; SU.dragFallback = true;
      return;
    }
    if (e.button === 0) { if (VM.cur && VM.cur !== 'hands' && !SU.build && $('craftPanel').hidden) { CB.firing = true; fireWeapon(); } else surfaceAction(); }
    return;
  }
  if (SU.lookId === null) { SU.lookId = e.pointerId; SU.lx = e.clientX; SU.ly = e.clientY; SU.tapT = performance.now(); SU.tapMove = 0; try { cv.setPointerCapture(e.pointerId); } catch (_) {} }
}
function surfacePointerMove(e) {
  if (e.pointerId !== SU.lookId || PL.locked) return;
  if (e.pointerType === 'mouse' && !(e.buttons & 1)) return;
  const dx = e.clientX - SU.lx, dy = e.clientY - SU.ly; SU.lx = e.clientX; SU.ly = e.clientY; SU.tapMove = (SU.tapMove || 0) + Math.abs(dx) + Math.abs(dy);
  const k = e.pointerType === 'mouse' ? 0.004 : 0.006;
  PL.yaw -= dx * k; PL.pitch = clamp(PL.pitch - dy * k, -1.45, 1.45);
}
function surfacePointerUp(e) {
  if (e.pointerId === SU.lookId) {
    if (e.pointerType !== 'mouse' && SU.build && SU.tapMove < 8 && performance.now() - SU.tapT < 300) surfaceAction();
    SU.lookId = null;
  }
}

/* ---------- aiming ---------- */
function camDir(out) { const cp = Math.cos(PL.pitch); return out.set(-Math.sin(PL.yaw) * cp, Math.sin(PL.pitch), -Math.cos(PL.yaw) * cp); }
function rayGround(o, d, maxT) {
  let prev = 0;
  for (let t = 0.4; t <= maxT; t += 0.4) {
    const y = o.y + d.y * t, x = o.x + d.x * t, z = o.z + d.z * t;
    if (y < groundAt(x, z)) { let a = prev, b = t; for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (o.y + d.y * m < groundAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; } return b; }
    prev = t;
  }
  return null;
}
function raySphere(o, d, cx, cy, cz, r) {
  const ox = cx - o.x, oy = cy - o.y, oz = cz - o.z, t = ox * d.x + oy * d.y + oz * d.z;
  if (t < 0) return null; const px = ox - d.x * t, py = oy - d.y * t, pz = oz - d.z * t;
  return px * px + py * py + pz * pz < r * r ? t : null;
}
function findTarget() {
  const o = camera.position, d = camDir(TMP2);
  let best = null, bt = 1e9;
  for (const n of SF.nodes) if (n.alive) { const t = raySphere(o, d, n.x, n.y + 0.5, n.z, 1.3); if (t !== null && t < 6 && t < bt) { bt = t; best = { kind: 'node', ref: n }; } }
  const L = DS.L;
  { const t = raySphere(o, d, L.x, L.y + 2.6, L.z, DS.lander.userData.foot * 0.9); if (t !== null && t < 10 && t < bt) { bt = t; best = { kind: 'lander' }; } }
  for (const ob of SU.objs) { const r = MODMAP[ob.m.id].r, t = raySphere(o, d, ob.m.x, groundAt(ob.m.x, ob.m.z) + Math.min(2.5, r * 0.5), ob.m.z, r); if (t !== null && t < 14 && t < bt) { bt = t; best = { kind: 'mod', ref: ob }; } }
  for (const w of CB.wrecks) { const t = raySphere(o, d, w.x, groundAt(w.x, w.z) + 0.4, w.z, w.r); if (t !== null && t < 7 && t < bt) { bt = t; best = { kind: 'wreck', ref: w }; } }
  const tg = rayGround(o, d, 40);
  if (best && tg !== null && tg + 0.5 < bt) best = null;
  return best;
}

/* ---------- actions ---------- */
function surfaceAction() {
  if (MP.active && SU.target && SU.target.kind === 'node' && !SU.build) { mpCommand({ type: 'collect', uid: SU.target.ref.uid }); return; }
  if (!$('landerMenu').hidden) return;
  if (SU.build) { tryPlace(); return; }
  const t = SU.target; if (!t) return;
  if (t.kind === 'node') {
    const n = t.ref; n.alive = false; n.t = 0;
    const amt = n.type === 'mat' ? 25 : 12; CO.res[n.type === 'mat' ? 'mat' : 'water'] += amt;
    toast(n.type === 'mat' ? `+${amt} materials` : `+${amt} water ice`, 'good'); clunk(0.25); CB.reach = 1;
    saveColony();
  } else if (t.kind === 'wreck') salvage(t.ref);
  else if (t.kind === 'lander') openLanderMenu();
  else if (t.kind === 'mod' && SU.recycleArmed === t.ref) {
    recycle(t.ref);
  }
}
function recycle(ob) {
  if (MP.active) { mpCommand({ type: 'recycle', uid: ob.m.uid }); SU.recycleArmed = null; return; }
  const def = MODMAP[ob.m.id];
  surfScene.remove(ob.obj); SU.objs.splice(SU.objs.indexOf(ob), 1);
  CO.mods.splice(CO.mods.indexOf(ob.m), 1);
  CO.res.mat += Math.floor((def.cost.mat || 0) / 2);
  rebuildColliders(); saveColony(); toast(`${def.name} recycled, +${Math.floor((def.cost.mat || 0) / 2)} materials`); SU.recycleArmed = null;
}
function openLanderMenu() {
  try { document.exitPointerLock(); } catch (_) {}
  PL.o2 = 1;
  const B = DS.B;
  set('lmTitle', 'Lander');
  set('lmBody', `Suit oxygen refilled. ${CO.pop ? `${CO.pop} colonists live in your ${B.base.toLowerCase()}.` : 'Your base is waiting to be built.'} The lander has enough fuel to fly you home whenever you're ready, and everything you build stays here.`);
  $('landerMenu').hidden = false; $('lockHint').hidden = true;
}
$('lmStay').addEventListener('click', () => { $('landerMenu').hidden = true; if (!COARSE) $('lockHint').hidden = PL.locked; });
$('lmHome').addEventListener('click', () => {
  if (MP.active) { mpStop(); enterHangar(); return; }
  $('landerMenu').hidden = true;
  CO.landers.push({ x: DS.L.x, z: DS.L.z, ry: 0 }); SAVE.resume = null; endRaid(true, true); CB.firing = false;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) {}
  const B = DS.B;
  transitionTo(() => { enterHangar(); toast(`Welcome home. Your ${B.base.toLowerCase()} will be waiting.`, 'good'); });
});
function canAfford(def) { for (const k in def.cost) if ((CO.res[k] || 0) < def.cost[k]) return false; return true; }
function costStr(def) { const p = []; if (def.cost.mat) p.push(`${def.cost.mat} mat`); if (def.cost.water) p.push(`${def.cost.water} water`); return p.length ? p.join(' · ') : 'free'; }
function buildBarUI() {
  const bar = $('buildBar'); bar.textContent = '';
  MODS.forEach((m, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'bitem'; b.dataset.id = m.id; b.setAttribute('aria-pressed', 'false');
    const t = document.createElement('b'); t.textContent = m.name; const s = document.createElement('span'); s.textContent = `${costStr(m)} · ${m.info}`;
    const k = document.createElement('kbd'); k.textContent = i + 1; k.style.justifySelf = 'start';
    b.append(t, s); if (!COARSE) b.append(k);
    b.addEventListener('click', () => selectBuild(m.id));
    bar.append(b);
  });
}
function refreshBuildBar() {
  for (const b of $('buildBar').children) {
    const def = MODMAP[b.dataset.id], hasFlag = def.id === 'flag' && CO.mods.some(m => m.id === 'flag');
    b.classList.toggle('poor', !canAfford(def) || hasFlag);
    b.setAttribute('aria-pressed', String(SU.sel === def.id));
  }
}
function setBuild(on) {
  SU.build = on; $('buildBar').hidden = !on; $('buildActs').hidden = !on;
  if (!on) { if (SU.ghost) surfScene.remove(SU.ghost); SU.ghost = null; SU.sel = null; }
  else if (!SU.sel) selectBuild(CO.mods.some(m => m.id === 'flag') ? 'solar' : 'flag');
  refreshBuildBar();
}
function cycleBuild(dir) { const i = MODS.findIndex(m => m.id === SU.sel); selectBuild(MODS[(i + dir + MODS.length) % MODS.length].id); }
function selectBuild(id) {
  SU.sel = id; if (SU.ghost) surfScene.remove(SU.ghost);
  SU.ghost = makeGhost(id); surfScene.add(SU.ghost); refreshBuildBar();
}
function placementCheck(id, x, z) {
  if (MP.active) return KarmanSim.placementError(MP.world, { id: MP.id, x: PL.x, z: PL.z }, id, x, z);
  const def = MODMAP[id], r = def.r;
  if (id === 'flag' && CO.mods.some(m => m.id === 'flag')) return 'You already planted your flag.';
  if (!canAfford(def)) return `Not enough ${(CO.res.mat || 0) < (def.cost.mat || 0) ? 'materials' : 'water'}. Collect glowing deposits or build a mining rig.`;
  const pd = Math.hypot(x - PL.x, z - PL.z);
  if (pd < r + 0.6) return 'Step back a little.';
  for (const o of SU.objs) if (Math.hypot(o.m.x - x, o.m.z - z) < r + MODMAP[o.m.id].r + 0.4) return 'Too close to another building.';
  if (Math.hypot(DS.L.x - x, DS.L.z - z) < r + DS.lander.userData.foot + 1) return 'Too close to the lander.';
  for (const l of CO.landers) if (Math.hypot(l.x - x, l.z - z) < r + 4) return 'Too close to an old lander.';
  const h = [groundAt(x + r, z), groundAt(x - r, z), groundAt(x, z + r), groundAt(x, z - r), groundAt(x, z)];
  if (Math.max(...h) - Math.min(...h) > Math.max(0.9, r * 0.32)) return 'Ground is too uneven here.';
  if (Math.hypot(x, z) > 1100) return 'Too far from the base.';
  return null;
}
function tryPlace() {
  if (!SU.sel || !SU.aim) return;
  const err = placementCheck(SU.sel, SU.aim.x, SU.aim.z);
  if (err) { toast(err, 'bad'); return; }
  if (MP.active) { mpCommand({ type: 'build', module: SU.sel, x: SU.aim.x, z: SU.aim.z, rot: SU.rot }); return; }
  const def = MODMAP[SU.sel];
  for (const k in def.cost) CO.res[k] -= def.cost[k];
  const m = { id: SU.sel, x: SU.aim.x, z: SU.aim.z, rot: SU.rot };
  CO.mods.push(m); addModuleObj(m, false); rebuildColliders(); clunk(0.4);
  toast(`${def.name} built`, 'good');
  checkGoals(); saveColony(); refreshBuildBar();
  if (SU.sel === 'flag') selectBuild('solar');
}
$('bPlace').addEventListener('click', tryPlace);
$('bRotate').addEventListener('click', () => { SU.rot += Math.PI / 8; });
$('bDone').addEventListener('click', () => setBuild(false));
$('tBuild').addEventListener('click', () => setBuild(!SU.build));
$('tUse').addEventListener('click', () => surfaceAction());
const jumpBtn = $('tJump');
jumpBtn.addEventListener('pointerdown', e => { touch.jump = 1; e.preventDefault(); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) jumpBtn.addEventListener(ev, () => { touch.jump = 0; });
$('objBtn').addEventListener('click', () => { const o = $('objList'); const open = !o.classList.contains('open'); o.classList.toggle('open', open); $('objBtn').setAttribute('aria-pressed', String(open)); });

/* ---------- goals ---------- */
const GOALS = [
  ['flag', 'Plant your flag', () => CO.mods.some(m => m.id === 'flag')],
  ['solar', 'Build a solar array for power', () => CO.mods.some(m => m.id === 'solar')],
  ['hab', 'Build a habitat', () => CO.mods.some(m => m.id === 'hab')],
  ['dish', 'Build a comms dish so supply ships can find you', () => CO.mods.some(m => m.id === 'dish')],
  ['pop2', 'Welcome your first colonists', () => CO.pop >= 2],
  ['self', 'Make enough air and food for everyone', () => CO.pop > 0 && SU.rates.o2 >= 0 && SU.rates.food >= 0],
  ['pop10', 'Grow to 10 colonists', () => CO.pop >= 10],
  ['pop30', 'Grow to 30 colonists, a real town', () => CO.pop >= 30]
];
function checkGoals() {
  let changed = false;
  for (const [id, text, fn] of GOALS) if (!CO.done[id] && fn()) { CO.done[id] = 1; changed = true; toast(`Goal complete: ${text}`, 'good'); }
  if (changed) { renderGoals(true); saveColony(); }
}
function renderGoals() {
  const ol = $('objList'); ol.textContent = ''; let next = false;
  for (const [id, text] of GOALS) {
    const li = document.createElement('li'); li.textContent = text;
    if (CO.done[id]) li.className = 'done'; else if (!next) { li.className = 'next'; next = true; }
    ol.append(li);
  }
}

/* ---------- colonists ---------- */
function ensureColonists() {
  if (!SU.colIM) {
    SU.colIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.32, 1.15, 10), std(0xeceae4, 0.6, 0.05), 40);
    SU.helmIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.27, 12, 8), std(0xffb547, 0.2, 0.7), 40);
    SU.colIM.count = SU.helmIM.count = 0;
  }
  if (!SU.colIM.parent) surfScene.add(SU.colIM, SU.helmIM);
  SU.colonists.length = 0;
}
function pickColTarget(c) {
  const list = SU.objs.filter(o => o.m.id !== 'flag');
  if (!list.length) { c.tx = c.x; c.tz = c.z; return; }
  const o = list[Math.floor(Math.random() * list.length)], r = MODMAP[o.m.id].r + 1.5 + Math.random() * 2, a = Math.random() * Math.PI * 2;
  c.tx = o.m.x + Math.cos(a) * r; c.tz = o.m.z + Math.sin(a) * r;
}
function updateColonists(dt) {
  const want = RAID.state === 'calm' ? Math.min(40, CO.pop) : 0;
  const habs = SU.objs.filter(o => o.m.id === 'hab');
  while (SU.colonists.length < want && habs.length) { const h = habs[SU.colonists.length % habs.length]; const c = { x: h.m.x + 6, z: h.m.z + 6, wait: Math.random() * 3, ph: Math.random() * 6 }; pickColTarget(c); SU.colonists.push(c); }
  SU.colonists.length = Math.min(SU.colonists.length, want);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V3(1, 1, 1), p = V3(), moon = SF.body === 'moon';
  SU.colonists.forEach((c, i) => {
    if (c.wait > 0) c.wait -= dt;
    else { const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz); if (d < 0.3) { c.wait = 2 + Math.random() * 5; pickColTarget(c); } else { const sp = 1.1 * dt; c.x += dx / d * Math.min(sp, d); c.z += dz / d * Math.min(sp, d); c.ph += dt * 7; } }
    const hop = c.wait > 0 ? 0 : Math.abs(Math.sin(c.ph)) * (moon ? 0.35 : 0.08);
    const y = groundAt(c.x, c.z) + hop;
    p.set(c.x, y + 0.6, c.z); m4.compose(p, q, s); SU.colIM.setMatrixAt(i, m4);
    p.set(c.x, y + 1.38, c.z); m4.compose(p, q, s); SU.helmIM.setMatrixAt(i, m4);
  });
  SU.colIM.count = SU.helmIM.count = SU.colonists.length;
  SU.colIM.instanceMatrix.needsUpdate = SU.helmIM.instanceMatrix.needsUpdate = true;
}

/* ---------- colony economy ---------- */
function colonyTick(dt) {
  if (MP.active) return;
  const B = DS.B, cnt = {};
  for (const o of SU.objs) cnt[o.m.id] = (cnt[o.m.id] || 0) + 1;
  const c = id => cnt[id] || 0;
  const gen = 2 + c('solar') * B.solar;
  let use = 0; for (const id in cnt) use += (POWER_USE[id] || 0) * cnt[id];
  const eff = use > 0 ? Math.min(1, gen / use) : 1;
  const waterIn = c('ice') * 3 * eff;
  const oxyRun = c('oxy') * eff * (CO.res.water > 0.2 ? 1 : clamp(waterIn / (c('oxy') + 1e-6), 0, 1));
  const R = SU.rates;
  R.power = gen - use; R.eff = eff; R.cap = c('hab') * 4;
  R.o2 = oxyRun * 4 - CO.pop; R.food = c('green') * 4 * eff - CO.pop; R.water = waterIn - oxyRun; R.mat = c('mine') * 12 * eff;
  const f = dt / SOL;
  CO.res.o2 = clamp(CO.res.o2 + R.o2 * f, 0, 300); CO.res.food = clamp(CO.res.food + R.food * f, 0, 300);
  CO.res.water = clamp(CO.res.water + R.water * f, 0, 500); CO.res.mat = Math.max(0, CO.res.mat + R.mat * f);
  const before = Math.floor(CO.sol); CO.sol += f;
  if (CO.pop > 0 && ((CO.res.food <= 0 && R.food < 0) || (CO.res.o2 <= 0 && R.o2 < 0))) {
    SU.shortT += f;
    if (SU.shortT > 0.5) { SU.shortT = 0; CO.pop -= 1; toast(`A colonist flew home: not enough ${CO.res.o2 <= 0 ? 'oxygen' : 'food'}.`, 'bad'); }
  } else SU.shortT = 0;
  if (Math.floor(CO.sol) > before) {
    const day = B.day;
    if (c('dish') > 0) {
      const room = R.cap - CO.pop;
      const ok = (R.o2 >= 0 || CO.res.o2 > CO.pop + 4) && (R.food >= 0 || CO.res.food > CO.pop + 4);
      if (room > 0 && ok) { const nArr = Math.min(room, 2 + c('dish')); CO.pop += nArr; CO.res.mat += 20; toast(`Supply ship landed: ${nArr} colonist${nArr > 1 ? 's' : ''} joined, +20 materials`, 'good'); }
      else if (room <= 0) toast(`${day} ${Math.floor(CO.sol) + 1}: a supply ship is waiting. Build a habitat for more colonists.`);
      else toast(`${day} ${Math.floor(CO.sol) + 1}: colonists won't come until you make more air and food.`, 'bad');
    }
    for (const n of SF.nodes) if (!n.alive) { n.t += 1; if (n.t >= 2) { n.alive = true; } }
  }
}

/* ---------- per-frame ---------- */
function updateSurface(dt) {
  const B = DS.B, moon = B.id === 'moon';
  const menuOpen = !$('landerMenu').hidden || !$('banner').hidden || !$('craftPanel').hidden || !$('savePanel').hidden || (MP.active && (!$('menu').hidden || !$('crewPanel').hidden || document.hidden || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)));
  let iF = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + touch.sy;
  let iR = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touch.sx;
  if (menuOpen) iF = iR = 0;
  const mag = Math.hypot(iF, iR); if (mag > 1) { iF /= mag; iR /= mag; }
  const run = keys.ShiftLeft || keys.ShiftRight ? 1.8 : 1, sp = (moon ? 3.2 : 3.6) * run;
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), rx = -fz, rz = fx;
  if (MP.active) { mpMove(dt, iF, iR, !!(keys.ShiftLeft || keys.ShiftRight), menuOpen); } else {
  const dvx = (fx * iF + rx * iR) * sp, dvz = (fz * iF + rz * iR) * sp;
  updateJetpack(dt, menuOpen);
  const ctl = PL.onGround ? 9 : PL.jetting ? 3.2 : 1.2, k = Math.min(1, ctl * dt);
  PL.vx += (dvx - PL.vx) * k; PL.vz += (dvz - PL.vz) * k;
  if (PW.t.dash > 0 && PW.dashDir) { PL.vx = PW.dashDir[0] * 34; PL.vz = PW.dashDir[1] * 34; }
  PL.vy -= B.g * dt;
  if ((keys.Space || touch.jump) && PL.onGround && !menuOpen) { PL.vy = jumpVel(); PL.onGround = false; }
  PL.x += PL.vx * dt; PL.y += PL.vy * dt; PL.z += PL.vz * dt;
  for (const c of SU.col) { if (c.hab) continue; const dx = PL.x - c.x, dz = PL.z - c.z, d = Math.hypot(dx, dz), m = c.r + 0.35; if (d < m && d > 1e-4) { PL.x = c.x + dx / d * m; PL.z = c.z + dz / d * m; } }
  habCollide();
  const rr = Math.hypot(PL.x, PL.z); if (rr > 1400) { PL.x *= 1400 / rr; PL.z *= 1400 / rr; }
  const gy = playerGround(PL.x, PL.z);
  if (PL.y <= gy) { PL.y = gy; PL.vy = 0; PL.onGround = true; } else PL.onGround = PL.y - gy < 0.05;
  if (PL.inHab && PL.y > PL.inHab.m.fy + 3.9) { PL.y = PL.inHab.m.fy + 3.9; PL.vy = Math.min(0, PL.vy); }
  const hs = Math.hypot(PL.vx, PL.vz);
  if (PL.onGround && hs > 0.3) PL.bob += dt * hs * 1.9;
  // suit oxygen
  const nearAir = Math.hypot(PL.x - DS.L.x, PL.z - DS.L.z) < 10 || SU.objs.some(o => o.m.id === 'hab' && Math.hypot(PL.x - o.m.x, PL.z - o.m.z) < 10);
  PL.o2 = nearAir ? Math.min(1, PL.o2 + dt * 0.2) : Math.max(0, PL.o2 - dt / 480);
  if (PL.o2 <= 0) {
    PL.o2 = 1; transitionTo(() => { PL.x = DS.L.x; PL.z = DS.L.z + DS.lander.userData.hatch.z + 1.2; PL.y = groundAt(PL.x, PL.z); toast('Your suit ran out of air. The crew carried you back to the lander.', 'bad'); });
  }
  }
  const hs = Math.hypot(PL.vx, PL.vz);
  // aim
  camera.position.set(PL.x, PL.y + 1.65 + (RM ? 0 : Math.sin(PL.bob) * 0.035), PL.z);
  camera.rotation.set(PL.pitch, PL.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
  SU.target = SU.build ? null : findTarget();
  if (SU.build && SU.ghost) {
    const d = camDir(TMP2), t = rayGround(camera.position, d, 32);
    let x, z; if (t !== null && t > 2) { x = camera.position.x + d.x * t; z = camera.position.z + d.z * t; } else { x = PL.x + fx * 10; z = PL.z + fz * 10; }
    SU.aim = { x, z };
    SU.ghost.position.set(x, groundAt(x, z), z); SU.ghost.rotation.y = SU.rot;
    const err = placementCheck(SU.sel, x, z); SU.aimErr = err;
    ghostMat.color.set(err ? 0xff6a58 : 0x7fe3a4);
  }
  // nodes respawn animation & module growth
  for (const n of SF.nodes) { const s = n.obj.scale.x, tgt = n.alive ? 1 : 0; n.obj.scale.setScalar(s + (tgt - s) * Math.min(1, dt * 6)); n.obj.visible = n.obj.scale.x > 0.02; n.obj.rotation.y += dt * 0.3; }
  for (const o of SU.objs) {
    if (o.grow < 1) { o.grow = Math.min(1, o.grow + dt / 1.3); const e = 1 - Math.pow(1 - o.grow, 3); o.obj.scale.set(1, e, 1).multiplyScalar(lerp(0.6, 1, e)); }
    const u = o.obj.userData;
    if (u.head) u.head.rotation.y += dt * 4;
    if (u.lamp) u.lamp.visible = Math.sin(GAME.t * 4) > 0;
    if (u.cloth && !moon) { const pa = u.cloth.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i) + 0.75; pa.setZ(i, Math.sin(x * 4 - GAME.t * 5) * 0.06 * x); } pa.needsUpdate = true; }
  }
  updateHabitats(dt);
  combatUpdate(dt, menuOpen);
  updateViewmodel(dt, PL.onGround && hs > 0.5);
  colonyTick(dt);
  updateColonists(dt);
  SU.saveT += dt; if (!MP.active && SU.saveT > 6) { SU.saveT = 0; saveColony(); checkGoals(); }
  GAME.t += dt;
}
function renderSurface(dt) {
  sunFollow(PL.x, PL.y, PL.z); GFX.bloomStr = 0.45; renderer.toneMappingExposure = 0.92; audioEngine(PL.jetting ? 0.5 : 0, 1, 0);
  vmScene.environment = surfScene.environment;
  drawFrame(surfScene, true);
  combatOverlays();
  SU.hudT -= dt; if (SU.hudT > 0) return; SU.hudT = 0.12;
  const B = DS.B, R = SU.rates, rs = v => (v >= 0 ? '+' : '') + (Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v));
  set('cSol', `${B.day} ${Math.floor(CO.sol) + 1}`);
  set('cPop', `${CO.pop} / ${R.cap || 0}`);
  set('cPower', `${R.power >= 0 ? '+' : ''}${R.power}`, R.power < 0 ? 'warn' : '');
  set('cMat', `${Math.floor(CO.res.mat)}${R.mat ? ' ' + rs(R.mat) : ''}`);
  set('cWater', `${Math.floor(CO.res.water)} ${rs(R.water)}`, R.water < 0 && CO.res.water < 5 ? 'warn' : '');
  set('cO2', `${Math.floor(CO.res.o2)} ${rs(R.o2)}`, R.o2 < 0 ? 'warn' : R.o2 > 0 ? 'good' : '');
  set('cFood', `${Math.floor(CO.res.food)} ${rs(R.food)}`, R.food < 0 ? 'warn' : R.food > 0 ? 'good' : '');
  $('suitBar').style.transform = `scaleX(${PL.o2.toFixed(3)})`;
  $('suitBar').parentElement.className = 'bar ' + (PL.o2 < 0.25 ? 'r' : 'g');
  set('suitPct', `${Math.ceil(PL.o2 * 100)}%`);
  let pt = '', tone = '';
  const t = SU.target; $('cross').classList.toggle('hot', !!t || SU.build);
  if (SU.build) { pt = SU.aimErr ? SU.aimErr : `Place the ${MODMAP[SU.sel].name.toLowerCase()} · ${COARSE ? 'tap Place' : 'click or press E'}`; tone = SU.aimErr ? 'warn' : 'good'; }
  else if (t && t.kind === 'node') pt = `${COARSE ? 'Use' : 'E'} · Collect ${t.ref.type === 'mat' ? 'materials (+25)' : 'water ice (+12)'}`;
  else if (t && t.kind === 'wreck') pt = `${COARSE ? 'Use' : 'E'} · Salvage alien technology (+${t.ref.tech})`;
  else if (PL.inHab && !t) pt = 'Inside the habitat · safe from raids · air and health refill here';
  else if (t && t.kind === 'lander') pt = `${COARSE ? 'Use' : 'E'} · Board the lander`;
  else if (t && t.kind === 'mod') { const d = MODMAP[t.ref.m.id]; pt = `${d.name} · ${d.info}${SU.recycleArmed === t.ref ? ` · press ${COARSE ? 'Use' : 'E'} to recycle` : COARSE ? '' : ' · X to recycle'}`; }
  else if (PL.o2 < 0.25) { pt = 'Suit oxygen low! Head back to the lander or a habitat.'; tone = 'warn'; }
  else if (RAID.state === 'warn' || RAID.state === 'active') { pt = RAID.seen ? 'They see you! Fight back or break line of sight behind cover.' : MP.active ? 'Shelter near the lander or inside a habitat. Defend your crew together.' : 'Stay out of the green scanner beam. Rocks and buildings hide you.'; tone = RAID.seen ? 'warn' : ''; }
  else if (!SAVE.profile.weapons.includes('pistol') && raidsOn()) pt = `Aliens raid every few days. Open the workshop (${COARSE ? 'Craft' : 'C'}) and craft a laser pistol.`;
  else if (!CO.done.flag) pt = `Open the build menu (${COARSE ? 'Build' : 'B'}) and plant your flag.`;
  else if (CO.res.mat < 30 && !CO.mods.some(m => m.id === 'mine')) pt = 'Low on materials. Walk to a glowing orange deposit and collect it.';
  else { const g = GOALS.find(gg => !CO.done[gg[0]]); pt = g ? `Next: ${g[1].toLowerCase()}.` : 'Your colony is thriving. Keep building!'; }
  set('sPrompt', pt, tone);
  combatHud();
  if (SU.build) refreshBuildBar();
}
/* ================= SURFACE COMBAT: hands, weapons, aliens, cosmic powers ================= */
const WEAPONS = {
  hands: { id: 'hands', name: 'Hands', key: '1' },
  pistol: { id: 'pistol', name: 'Laser pistol', key: '2', cost: { mat: 40 }, dmg: 18, rate: 3.4, heat: 0.13, color: 0xff5a3a, width: 0.035, range: 150, info: 'Quick, light, reliable' },
  rifle: { id: 'rifle', name: 'Laser rifle', key: '3', cost: { mat: 110, water: 15 }, dmg: 11, rate: 9, heat: 0.055, color: 0x45d6ff, width: 0.028, range: 190, info: 'Fully automatic beam' },
  lance: { id: 'lance', name: 'Plasma lance', key: '4', cost: { mat: 220, water: 40, shards: 6 }, dmg: 120, rate: 0.85, heat: 0.42, color: 0xc070ff, width: 0.1, range: 230, splash: 6, info: 'Heavy shot that hits an area' }
};
const WLIST = ['hands', 'pistol', 'rifle', 'lance'];
const POWERS = {
  leap: { id: 'leap', name: 'Moon Leap', src: 'Starfall meteorite', color: 0x8fd8ff, key: '', info: 'Passive: you jump more than twice as high' },
  dash: { id: 'dash', name: 'Phase Dash', src: 'Solar rift', color: 0xffb547, key: 'Q', cost: 20, cd: 2.5, dur: 0.28, info: 'Blink forward, untouchable while you move' },
  shield: { id: 'shield', name: 'Void Shield', src: 'Void crystals', color: 0xb07bff, key: 'F', cost: 35, cd: 12, dur: 8, info: 'Absorbs 60 damage' },
  slow: { id: 'slow', name: 'Chrono Slow', src: 'Time anomaly', color: 0x7fe3a4, key: 'T', cost: 45, cd: 18, dur: 6, info: 'Aliens and their shots slow to a crawl' },
  cloak: { id: 'cloak', name: 'Dark Cloak', src: 'Dark matter pool', color: 0xff6ad5, key: 'V', cost: 40, cd: 16, dur: 10, info: 'Aliens cannot see you' }
};
const PLIST = ['leap', 'dash', 'shield', 'slow', 'cloak'];
const CB = { group: new THREE.Group(), aliens: [], bolts: [], beams: [], shards: [], wrecks: [], fx: particleSystem(700, true), heat: 0, over: false, cool: 0, firing: false, kick: 0, reach: 0, flash: 0, hurt: 0, ts: 1, anoms: [], expoNear: null };
const PW = { hp: 100, energy: 60, t: { dash: 0, shield: 0, slow: 0, cloak: 0 }, cd: { dash: 0, shield: 0, slow: 0, cloak: 0 }, shieldHP: 0, dashDir: null };
const RAID = { state: 'calm', t: 0, ship: null, spot: { x: 0, z: 0, tx: 0, tz: 0 }, alarm: 0, last: null, seenT: 0, neverSeen: true, killed: 0, total: 0, siren: 0 };
CB.group.add(CB.fx.pts);

/* ---------- materials & shared geometry ---------- */
const AM = {
  shell: std(0x14262a, 0.28, 0.85), glow: std(0x0f2a1f, 0.4, 0, { emissive: 0x4dffb0, emissiveIntensity: 1.4 }), eye: std(0x200000, 0.3, 0, { emissive: 0xff3b2e, emissiveIntensity: 1.8 }),
  carapace: std(0x2a1838, 0.32, 0.6), spot: std(0x200020, 0.4, 0, { emissive: 0xff3fd0, emissiveIntensity: 1.4 }), leg: std(0x1a1024, 0.5, 0.4),
  hull: std(0x2a3036, 0.3, 0.9), dome: std(0x0a2a28, 0.1, 0.4, { emissive: 0x2affc0, emissiveIntensity: 0.6, transparent: true, opacity: 0.8 }),
  shard: std(0x2a0a40, 0.2, 0.3, { emissive: 0xb07bff, emissiveIntensity: 1.4 })
};
const BEAM_GEO = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, -0.5); return g; })();
const BOLT_MAT = new THREE.SpriteMaterial({ map: glowTexture(), color: 0x6dffb8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

/* ---------- first-person hands (rendered in their own layer) ---------- */
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(50, 1, 0.01, 30);
const vmSun = new THREE.DirectionalLight(0xffffff, 1.5); vmScene.add(vmSun, vmSun.target);
const vmHemi = new THREE.HemisphereLight(0xbcc6d8, 0x55504a, 0.45); vmScene.add(vmHemi);
const VMP = { rx: 0.15, ry: -0.14, rz: -0.42, lx: -0.16, ly: -0.15, lz: -0.36 };
const VM = { root: new THREE.Group(), right: null, left: null, guns: {}, cur: 'hands', draw: 1, swayX: 0, swayY: 0, lastYaw: 0, lastPitch: 0, muzzleFlash: null };
vmScene.add(VM.root);
function buildArm(side) {
  const g = new THREE.Group();
  const suit = std(0xd6d2ca, 0.85, 0, { envMapIntensity: 0.5 }), glove = std(0x9ea3aa, 0.75, 0, { envMapIntensity: 0.5 }), dark = std(0x2f333b, 0.55, 0.35), cuff = std(0xffb547, 0.5, 0.15);
  // forearm runs from the wrist down and back, leaving the frame at the bottom corner
  const fore = new THREE.Group(); g.add(fore);
  fore.quaternion.setFromUnitVectors(V3(0, 1, 0), V3(side * 0.28, -0.72, 0.64).normalize());
  fore.add(mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.5, 18), suit, 0, 0.29, 0));
  for (const y of [0.13, 0.24]) { const r = mesh(new THREE.TorusGeometry(0.05 + y * 0.03, 0.009, 8, 20), dark, 0, y, 0); r.rotation.x = Math.PI / 2; fore.add(r); }
  const c = mesh(new THREE.CylinderGeometry(0.047, 0.05, 0.045, 18), cuff, 0, 0.035, 0); fore.add(c);
  const palm = mesh(new THREE.SphereGeometry(1, 18, 12), glove, 0, 0, -0.01); palm.scale.set(0.05, 0.03, 0.062); g.add(palm);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group(); f.position.set(side * (-0.032 + i * 0.021), 0.008, -0.058); g.add(f);
    const s1 = mesh(new THREE.CylinderGeometry(0.0105, 0.0115, 0.036, 8), glove, 0, 0, -0.018); s1.rotation.x = Math.PI / 2; f.add(s1);
    const j = new THREE.Group(); j.position.z = -0.036; f.add(j);
    const s2 = mesh(new THREE.CylinderGeometry(0.0095, 0.0105, 0.03, 8), glove, 0, 0, -0.015); s2.rotation.x = Math.PI / 2; j.add(s2);
    j.add(mesh(new THREE.SphereGeometry(0.0098, 8, 6), glove, 0, 0, -0.03));
    fingers.push([f, j]);
  }
  const th = new THREE.Group(); th.position.set(side * -0.045, -0.006, -0.02); th.rotation.set(0, side * 0.7, side * 0.4); g.add(th);
  const ts = mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.045, 8), glove, 0, 0, -0.022); ts.rotation.x = Math.PI / 2; th.add(ts);
  return { g, fingers, thumb: th, curl: 0.3 };
}
function setCurl(arm, c) { arm.curl += (c - arm.curl) * 0.25; for (const [f, j] of arm.fingers) { f.rotation.x = -arm.curl * 0.9; j.rotation.x = -arm.curl * 1.1; } arm.thumb.rotation.x = -arm.curl * 0.6; }
function buildGun(id) {
  const g = new THREE.Group(), w = WEAPONS[id];
  const body = std(0x2a2e34, 0.45, 0.6, { envMapIntensity: 0.6 }), trim = std(0xa9a59d, 0.55, 0.2, { envMapIntensity: 0.6 }), glow = std(0x111111, 0.3, 0, { emissive: w.color, emissiveIntensity: 1.6 });
  if (id === 'pistol') {
    g.add(mesh(new THREE.BoxGeometry(0.045, 0.06, 0.2), body, 0, 0.04, -0.07));
    g.add(mesh(new THREE.BoxGeometry(0.038, 0.085, 0.045), trim, 0, -0.012, 0.005).rotateX(0.25));
    const bar = mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.09, 12), body, 0, 0.05, -0.2); bar.rotation.x = Math.PI / 2; g.add(bar);
    const ring = mesh(new THREE.TorusGeometry(0.02, 0.006, 8, 16), glow, 0, 0.05, -0.235); g.add(ring);
    g.add(mesh(new THREE.BoxGeometry(0.047, 0.012, 0.11), glow, 0, 0.068, -0.08));
    g.userData.muzzle = V3(0, 0.05, -0.25);
  } else if (id === 'rifle') {
    g.add(mesh(new THREE.BoxGeometry(0.055, 0.075, 0.5), body, 0, 0.04, -0.2));
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.09, 0.05), trim, 0, -0.015, 0.0).rotateX(0.25));
    const bar = mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.18, 12), body, 0, 0.045, -0.52); bar.rotation.x = Math.PI / 2; g.add(bar);
    const sc = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 12), body, 0, 0.1, -0.16); sc.rotation.x = Math.PI / 2; g.add(sc);
    g.add(mesh(new THREE.CircleGeometry(0.016, 12), glow, 0, 0.1, -0.096));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.058, 0.014, 0.05), glow, 0, 0.012, -0.12 - i * 0.07));
    g.userData.muzzle = V3(0, 0.045, -0.62); g.userData.grip = V3(0, -0.01, -0.34);
  } else {
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.09, 0.46), body, 0, 0.045, -0.18));
    for (const x of [-0.032, 0.032]) g.add(mesh(new THREE.BoxGeometry(0.014, 0.03, 0.34), trim, x, 0.06, -0.52));
    for (let i = 0; i < 3; i++) { const cap = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.07, 12), glow, 0, 0.11, -0.06 - i * 0.1); cap.rotation.z = Math.PI / 2; g.add(cap); }
    g.add(mesh(new THREE.BoxGeometry(0.045, 0.1, 0.06), trim, 0, -0.02, 0.0).rotateX(0.25));
    g.add(mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 18), glow, 0, 0.06, -0.69));
    g.userData.muzzle = V3(0, 0.06, -0.72); g.userData.grip = V3(0, -0.01, -0.36);
  }
  g.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return g;
}
function initViewmodel() {
  if (VM.right) return;
  VM.right = buildArm(1); VM.left = buildArm(-1);
  VM.root.add(VM.right.g, VM.left.g);
  for (const id of ['pistol', 'rifle', 'lance']) { const g = buildGun(id); g.visible = false; VM.right.g.add(g); g.position.set(0, 0.0, -0.01); VM.guns[id] = g; }
  VM.muzzleFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  VM.muzzleFlash.scale.set(0.12, 0.12, 1); VM.right.g.add(VM.muzzleFlash);
  VM.palmGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7fd3ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  VM.palmGlow.scale.set(0.09, 0.09, 1); VM.palmGlow.position.set(0, 0.04, -0.06); VM.left.g.add(VM.palmGlow);
  VM.root.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
}
function equip(id) {
  if (!SAVE.profile.weapons.includes(id)) { if (id !== 'hands') toast(`Craft the ${WEAPONS[id].name.toLowerCase()} first (C opens the workshop).`, 'bad'); return; }
  if (VM.cur === id) return;
  VM.cur = id; SAVE.profile.wpn = id; VM.draw = 0; CB.firing = false;
  for (const k in VM.guns) VM.guns[k].visible = k === id;
  syncWeaponHud();
}
function cycleWeapon(dir) {
  const own = WLIST.filter(w => SAVE.profile.weapons.includes(w)); let i = own.indexOf(VM.cur);
  equip(own[(i + dir + own.length) % own.length]);
}
function updateViewmodel(dt, moving) {
  initViewmodel();
  const R = VM.right, L = VM.left, armed = VM.cur !== 'hands', two = VM.cur === 'rifle' || VM.cur === 'lance';
  const halfW = 0.42 * Math.tan(25 * Math.PI / 180) * camera.aspect;
  const far = Math.sqrt(clamp(1.4 / camera.aspect, 1, 1.6));
  VMP.rx = clamp(halfW * 0.56, 0.06, 0.15) * far; VMP.lx = -clamp(halfW * 0.62, 0.06, 0.16) * far; VMP.ry = -0.14 * far; VMP.ly = -0.15 * far; VMP.rz = -0.42 * far; VMP.lz = -0.36 * far;
  VM.draw = Math.min(1, VM.draw + dt * 3.2);
  const dy = angDiff(PL.yaw, VM.lastYaw), dp = PL.pitch - VM.lastPitch; VM.lastYaw = PL.yaw; VM.lastPitch = PL.pitch;
  VM.swayX = clamp(VM.swayX * Math.exp(-dt * 8) + dy * 0.6, -0.06, 0.06); VM.swayY = clamp(VM.swayY * Math.exp(-dt * 8) - dp * 0.6, -0.05, 0.05);
  const bob = RM ? 0 : (moving ? Math.sin(PL.bob) * 0.012 : 0), bobx = RM ? 0 : (moving ? Math.cos(PL.bob * 0.5) * 0.012 : 0);
  CB.kick *= Math.exp(-dt * 12); CB.reach = Math.max(0, CB.reach - dt * 2.4);
  const drawOff = (1 - VM.draw) * 0.25, ovr = CB.over ? 0.08 : 0, reach = Math.sin(CB.reach * Math.PI);
  const air = PL.onGround ? 0 : clamp(PL.vy * 0.004, -0.02, 0.02);
  // right arm
  R.g.position.set(VMP.rx + VM.swayX + bobx, VMP.ry + VM.swayY + bob - drawOff - ovr - air + reach * 0.03, VMP.rz + CB.kick * 0.05 - reach * 0.16);
  R.g.rotation.set(0.04 + CB.kick * 0.18 + ovr * 2 + VM.swayY + reach * -0.3, (armed ? 0.09 : -0.05) + VM.swayX * 2, armed ? -0.05 : 0);
  setCurl(R, armed ? 1.15 : reach > 0.1 ? 0.15 : 0.45);
  // left arm
  if (two) {
    const gp = VM.guns[VM.cur].userData.grip;
    L.g.position.set(VMP.rx + gp.x + VM.swayX + bobx - 0.03, VMP.ry + VM.swayY + bob - drawOff - ovr - 0.035 - air, VMP.rz + gp.z + CB.kick * 0.05);
    L.g.rotation.set(CB.kick * 0.18 + 0.15, 0.55, -0.9); setCurl(L, 1.0);
  } else {
    const b = SU.build ? 1 : 0;
    L.g.position.set(VMP.lx + VM.swayX - bobx, VMP.ly + VM.swayY - bob - drawOff + b * 0.05, VMP.lz - b * 0.05);
    L.g.rotation.set(0.1 + b * 0.5, 0.15, 0.2 - b * 0.2); setCurl(L, b ? 0.05 : 0.5);
  }
  VM.palmGlow.material.opacity = SU.build ? 0.8 + Math.sin(GAME.t * 6) * 0.2 : 0;
  // muzzle flash
  const g = VM.guns[VM.cur];
  if (g) { VM.muzzleFlash.position.copy(g.userData.muzzle); VM.muzzleFlash.material.color.set(WEAPONS[VM.cur].color); }
  CB.flash = Math.max(0, CB.flash - dt * 14); VM.muzzleFlash.material.opacity = CB.flash; VM.muzzleFlash.visible = !!g;
  // light the hands like the world around them
  const inv = camera.quaternion.clone().invert();
  vmSun.position.copy(SF.sunDir).applyQuaternion(inv).multiplyScalar(5);
  vmHemi.position.set(0, 1, 0).applyQuaternion(inv);
  vmCam.aspect = camera.aspect; vmCam.updateProjectionMatrix();
}
function muzzleWorld(out) {
  const g = VM.guns[VM.cur]; if (!g) return out.copy(camera.position);
  g.updateWorldMatrix(true, false); out.copy(g.userData.muzzle).applyMatrix4(g.matrixWorld);
  return camera.localToWorld(out);
}

/* ---------- firing ---------- */
function rayGroundFar(o, d, maxT) {
  let prev = 0, step = 0.4;
  for (let t = 0.4; t <= maxT; t += step) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < groundAt(x, z)) { let a = prev, b = t; for (let i = 0; i < 10; i++) { const m = (a + b) / 2; if (o.y + d.y * m < groundAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; } return b; }
    prev = t; if (t > 30) step = 1.2;
  }
  return null;
}
function coverHit(o, d, maxT) {
  let best = null;
  for (const c of SU.col) {
    const h = c.kind === 'mod' ? (c.ref && c.ref.m.id === 'hab' ? 5.5 : 3.2) : c.kind === 'rock' ? c.r * 1.1 : 4.5;
    const cy = groundAt(c.x, c.z) + h * 0.5, t = raySphere(o, d, c.x, cy, c.z, Math.max(c.r, h * 0.5));
    if (t !== null && t < maxT && (best === null || t < best)) best = t;
  }
  return best;
}
function fireWeapon() {
  if (MP.active && (!MP.connected || MP.paused)) return;
  const w = WEAPONS[VM.cur]; if (!w.dmg || CB.over || CB.cool > 0 || VM.draw < 0.6) return;
  CB.cool = 1 / w.rate; CB.heat += w.heat; if (CB.heat >= 1) { CB.heat = 1; CB.over = true; toast('Weapon overheated. Let it cool.', 'bad'); }
  CB.kick = 1; CB.flash = 1;
  const o = camera.position.clone(), d = camDir(V3()).normalize();
  d.x += (Math.random() - 0.5) * 0.004; d.y += (Math.random() - 0.5) * 0.004; d.normalize();
  let best = w.range, hit = null;
  for (const a of CB.aliens) { if (a.dead) continue; const t = raySphere(o, d, a.x, a.y, a.z, a.r); if (t !== null && t < best) { best = t; hit = a; } }
  if (RAID.ship && !RAID.ship.dead) { const s = RAID.ship, t = raySphere(o, d, s.x, s.y, s.z, 21); if (t !== null && t < best) { best = t; hit = s; } }
  const tg = rayGroundFar(o, d, best); if (tg !== null && tg < best) { best = tg; hit = null; }
  const tc = coverHit(o, d, best); if (tc !== null && tc < best) { best = tc; hit = null; }
  const end = o.clone().addScaledVector(d, best);
  spawnBeam(muzzleWorld(V3()), end, w);
  sparks(end, w.color, hit ? 18 : 10, hit ? 6 : 4);
  if (hit && !MP.active) damageAlien(hit, w.dmg);
  if (MP.active) MP.shot = true;
  if (w.splash && !MP.active) { for (const a of CB.aliens) if (!a.dead && a !== hit && Math.hypot(a.x - end.x, a.y - end.y, a.z - end.z) < w.splash) damageAlien(a, w.dmg * 0.5); sparks(end, w.color, 40, 10); }
  zap(w.id);
}
function spawnBeam(a, b, w) {
  let bm = CB.beams.find(x => x.life <= 0);
  if (!bm) {
    const outer = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color: w.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const core = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    outer.add(core); core.scale.set(0.35, 0.35, 1); outer.frustumCulled = core.frustumCulled = false;
    bm = { m: outer, core, life: 0 }; CB.beams.push(bm); CB.group.add(outer);
  }
  const len = a.distanceTo(b);
  bm.m.position.copy(a); bm.m.lookAt(b); bm.m.scale.set(w.width, w.width, len);
  bm.m.material.color.set(w.color); bm.life = bm.max = w.id === 'lance' ? 0.22 : 0.09; bm.m.visible = true; bm.w = w.width;
}
function sparks(at, color, n, sp) {
  const c = new THREE.Color(color), L = CB.fx.list;
  for (let i = 0; i < n && L.length < CB.fx.max; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1), s = sp * (0.3 + Math.random());
    L.push({ x: at.x, y: at.y, z: at.z, vx: Math.sin(b) * Math.cos(a) * s, vy: Math.abs(Math.cos(b)) * s, vz: Math.sin(b) * Math.sin(a) * s, r: 0.08 + Math.random() * 0.12, gr: -0.05, age: 0, life: 0.3 + Math.random() * 0.5, c, fire: true });
  }
}
function burstFx(at, color, n, sp, size) {
  const c = new THREE.Color(color), L = CB.fx.list;
  for (let i = 0; i < n && L.length < CB.fx.max; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1), s = sp * Math.random();
    L.push({ x: at.x, y: at.y, z: at.z, vx: Math.sin(b) * Math.cos(a) * s, vy: Math.cos(b) * s, vz: Math.sin(b) * Math.sin(a) * s, r: size * (0.5 + Math.random()), gr: size, age: 0, life: 0.5 + Math.random() * 0.8, c, fire: true });
  }
}
function stepFx(dt) {
  const L = CB.fx.list, g = DS.B ? DS.B.g : 1.6;
  for (let i = L.length - 1; i >= 0; i--) { const p = L[i]; p.vy -= g * 0.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r = Math.max(0.02, p.r + p.gr * dt); p.age += dt; if (p.age > p.life) { L[i] = L[L.length - 1]; L.pop(); } }
  let n = 0; const ps = CB.fx;
  for (const p of L) { ps.pos[n * 3] = p.x; ps.pos[n * 3 + 1] = p.y; ps.pos[n * 3 + 2] = p.z; ps.size[n] = p.r * 2; const t = p.age / p.life; ps.alpha[n] = 1 - t; ps.col[n * 3] = p.c.r; ps.col[n * 3 + 1] = p.c.g; ps.col[n * 3 + 2] = p.c.b; n++; }
  flushParticles(ps, n);
}

/* ---------- aliens ---------- */
function buildDrone() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const shell = mesh(new THREE.SphereGeometry(0.9, 28, 16), AM.shell); shell.scale.y = 0.5; body.add(shell);
  const cap = mesh(new THREE.SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), AM.dome, 0, 0.25, 0); body.add(cap);
  const ring = mesh(new THREE.TorusGeometry(0.86, 0.07, 10, 40), AM.glow, 0, -0.08, 0); ring.rotation.x = Math.PI / 2; body.add(ring);
  const eye = mesh(new THREE.SphereGeometry(0.16, 14, 10), AM.eye, 0, -0.05, 0.82); body.add(eye);
  const tent = [];
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, t = new THREE.Group(); t.position.set(Math.cos(a) * 0.45, -0.3, Math.sin(a) * 0.45); const m = mesh(new THREE.CylinderGeometry(0.035, 0.012, 1.5, 6), AM.glow, 0, -0.75, 0); t.add(m); body.add(t); tent.push(t); }
  g.userData = { body, tent, eye };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function buildCrawler() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const b = mesh(new THREE.SphereGeometry(1, 24, 16), AM.carapace); b.scale.set(0.75, 0.42, 1.1); body.add(b);
  const head = mesh(new THREE.SphereGeometry(0.42, 18, 12), AM.carapace, 0, 0.05, 1.0); head.scale.set(1, 0.7, 1.1); body.add(head);
  for (const x of [-0.17, 0.17]) body.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), AM.glow, x, 0.12, 1.38));
  for (let i = 0; i < 5; i++) body.add(mesh(new THREE.SphereGeometry(0.09 + (i % 2) * 0.04, 10, 8), AM.spot, (i % 2 ? 0.25 : -0.25), 0.36, 0.6 - i * 0.3));
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, z = 0.55 - Math.floor(i / 2) * 0.55;
    const hip = new THREE.Group(); hip.position.set(side * 0.6, 0, z); body.add(hip);
    const up = mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.9, 6), AM.leg, side * 0.4, 0.25, 0); up.rotation.z = side * -1.0; hip.add(up);
    const knee = new THREE.Group(); knee.position.set(side * 0.78, 0.5, 0); hip.add(knee);
    const lo = mesh(new THREE.CylinderGeometry(0.055, 0.02, 1.2, 6), AM.leg, side * 0.15, -0.55, 0); lo.rotation.z = side * 0.28; knee.add(lo);
    legs.push({ hip, side, ph: i * 1.7 });
  }
  g.userData = { body, legs };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function buildMothership() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(20, 24, 3.2, 64), AM.hull));
  g.add(mesh(new THREE.CylinderGeometry(24.2, 22, 1.2, 64), AM.shell, 0, -2.1, 0));
  g.add(mesh(new THREE.SphereGeometry(9, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), AM.dome, 0, 1.5, 0));
  const under = mesh(new THREE.TorusGeometry(14, 0.6, 10, 64), AM.glow, 0, -2.8, 0); under.rotation.x = Math.PI / 2; g.add(under);
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; g.add(mesh(new THREE.SphereGeometry(0.45, 10, 8), i % 2 ? AM.glow : AM.eye, Math.cos(a) * 23.4, -0.6, Math.sin(a) * 23.4)); }
  const beam = mesh(new THREE.CylinderGeometry(1.2, 11, 1, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x4dffb0, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.geometry.translate(0, -0.5, 0); beam.frustumCulled = false;
  const spot = mesh(new THREE.CircleGeometry(11, 48), new THREE.MeshBasicMaterial({ color: 0x4dffb0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  spot.rotation.x = -Math.PI / 2;
  g.userData = { beam, spot };
  return g;
}
function spawnAlien(type, x, z, y) {
  const obj = type === 'drone' ? buildDrone() : buildCrawler();
  const gy = groundAt(x, z);
  const a = { type, x, z, y: y ?? (type === 'drone' ? gy + 8 : gy + 0.9), vx: 0, vy: 0, vz: 0, hp: type === 'drone' ? 30 : 60, r: type === 'drone' ? 1.1 : 1.3, obj, state: 'patrol', tx: x, tz: z, cool: 1 + Math.random() * 2, sees: false, lostT: 0, ph: Math.random() * 6, hitT: 0, orbit: Math.random() * 6, dead: false };
  obj.position.set(a.x, a.y, a.z); CB.group.add(obj); CB.aliens.push(a); return a;
}
function damageAlien(a, d) {
  if (a.dead) return;
  a.hp -= d; a.hitT = 0.12;
  if (a === RAID.ship) { if (a.hp <= 0) killShip(); return; }
  if (a.state !== 'hunt') { a.state = 'hunt'; RAID.last = { x: PL.x, z: PL.z }; }
  if (a.hp <= 0) {
    a.dead = true; CB.group.remove(a.obj); RAID.killed++;
    burstFx(V3(a.x, a.y, a.z), a.type === 'drone' ? 0x4dffb0 : 0xff3fd0, 60, 9, 0.5); boom2(0.5);
    dropShard(a.x, a.z, a.type === 'drone' ? 1 : 2);
    if (Math.random() < (a.type === 'drone' ? 0.4 : 0.6)) dropWreck(a.x + 1.5, a.z - 1, a.type === 'drone' ? 1 : 2, false);
  }
}
function dropShard(x, z, n) {
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(), c = mesh(new THREE.OctahedronGeometry(0.22, 0), AM.shard); c.scale.y = 1.7; g.add(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xb07bff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 })); s.scale.set(1.4, 1.4, 1); g.add(s);
    const sx = x + (Math.random() - 0.5) * 2, sz = z + (Math.random() - 0.5) * 2;
    g.position.set(sx, groundAt(sx, sz) + 0.8, sz); CB.group.add(g); CB.shards.push({ obj: g, x: sx, z: sz, t: Math.random() * 6 });
  }
}
function hurtPlayer(d, from) {
  if (PW.t.dash > 0) return;
  if (PW.t.shield > 0 && PW.shieldHP > 0) { const ab = Math.min(PW.shieldHP, d); PW.shieldHP -= ab; d -= ab; burstFx(V3(PL.x, PL.y + 1.2, PL.z), 0xb07bff, 10, 4, 0.2); if (PW.shieldHP <= 0) { PW.t.shield = 0; toast('Void Shield broke!', 'bad'); } }
  if (d <= 0) return;
  PW.hp -= d; CB.hurt = Math.min(1, CB.hurt + d / 30); thud();
  if (from) RAID.last = { x: PL.x, z: PL.z };
  if (PW.hp <= 0) knockedOut();
}
function knockedOut() {
  PW.hp = 100; CB.firing = false;
  const lost = Math.floor(CO.res.mat * 0.25);
  CO.res.mat -= lost; endRaid(false, true);
  transitionTo(() => { PL.x = DS.L.x; PL.z = DS.L.z + DS.lander.userData.hatch.z + 1.2; PL.y = groundAt(PL.x, PL.z); PL.vx = PL.vz = PL.vy = 0; toast(`You were knocked out. The aliens grabbed ${lost} materials and left.`, 'bad'); });
}
function sheltered() {
  if (PL.inHab) return true;
  if (Math.hypot(PL.x - DS.L.x, PL.z - DS.L.z) < 4.6) return true;
  for (const o of SU.objs) if (o.m.id === 'hab' && o.grow >= 1 && Math.hypot(PL.x - o.m.x, PL.z - o.m.z) < 8.4) return true;
  return false;
}
function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz), n = Math.min(70, Math.ceil(len / 1.5));
  for (let i = 1; i < n; i++) {
    const t = i / n, x = ax + dx * t, y = ay + dy * t, z = az + dz * t, g = groundAt(x, z);
    if (y < g + 0.2) return false;
    for (const c of SU.col) {
      const h = c.kind === 'mod' ? (c.ref && c.ref.m.id === 'hab' ? 6 : 3.4) : c.kind === 'rock' ? c.r * 1.2 : 5;
      if (y < groundAt(c.x, c.z) + h && (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r * 0.85) return false;
    }
  }
  return true;
}
function playerVisibleFrom(x, y, z, range) {
  if (PW.t.cloak > 0 || sheltered()) return false;
  const d = Math.hypot(PL.x - x, PL.y + 1.2 - y, PL.z - z); if (d > range) return false;
  return losClear(x, y, z, PL.x, PL.y + 1.3, PL.z);
}
function updateAliens(dt) {
  const ts = PW.t.slow > 0 ? 0.3 : 1, sdt = dt * ts, py = PL.y + 1.2;
  let anySee = false;
  for (const a of CB.aliens) {
    if (a.dead) continue;
    a.ph += sdt * (a.type === 'drone' ? 2 : 6); a.cool -= sdt; a.hitT -= dt;
    a.losT = (a.losT || 0) - dt;
    if (a.losT <= 0) { a.losT = 0.25; a.sees = playerVisibleFrom(a.x, a.y, a.z, a.type === 'drone' ? 60 : 38); }
    if (a.sees) { a.state = 'hunt'; a.lostT = 0; RAID.last = { x: PL.x, z: PL.z }; anySee = true; }
    else if (a.state === 'hunt') { a.lostT += dt; if (a.lostT > 4) { a.state = 'search'; if (RAID.last) { a.tx = RAID.last.x + (Math.random() - .5) * 20; a.tz = RAID.last.z + (Math.random() - .5) * 20; } } }
    let tx = a.tx, tz = a.tz, sp = a.type === 'drone' ? 5 : 3.5, alt = 8;
    const dP = Math.hypot(PL.x - a.x, PL.z - a.z);
    if (a.state === 'hunt') {
      if (a.type === 'drone') { a.orbit += sdt * 0.5; const R0 = 15; tx = PL.x + Math.cos(a.orbit) * R0; tz = PL.z + Math.sin(a.orbit) * R0; sp = 8; alt = 6 + Math.sin(a.ph * 0.5) * 2; }
      else { tx = PL.x; tz = PL.z; sp = 7.5; }
    } else if (Math.hypot(tx - a.x, tz - a.z) < 3) {
      const ang = Math.random() * Math.PI * 2, rr = 20 + Math.random() * 110; a.tx = Math.cos(ang) * rr; a.tz = Math.sin(ang) * rr; if (a.state === 'search' && Math.random() < 0.4) a.state = 'patrol';
    }
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, sdt * 2.5);
    a.vx += ((dx / d) * sp * Math.min(1, d / 4) - a.vx) * k; a.vz += ((dz / d) * sp * Math.min(1, d / 4) - a.vz) * k;
    a.x += a.vx * sdt; a.z += a.vz * sdt;
    const gy = groundAt(a.x, a.z);
    if (a.type === 'drone') { a.y += ((gy + alt) - a.y) * Math.min(1, sdt * 1.5); }
    else { a.y = gy + 0.9; for (const c of SU.col) { const ex = a.x - c.x, ez = a.z - c.z, dd = Math.hypot(ex, ez), m = c.r + 1; if (dd < m && dd > 1e-3) { a.x = c.x + ex / dd * m; a.z = c.z + ez / dd * m; } } }
    // attacks
    if (a.state === 'hunt' && a.sees && a.cool <= 0) {
      if (a.type === 'drone') { a.cool = 1.5 + Math.random() * 1.1; fireBolt(a); }
      else if (dP < 2.3 && Math.abs(py - a.y) < 2.5) { a.cool = 1.1; hurtPlayer(14, a); const kx = (PL.x - a.x) / (dP || 1), kz = (PL.z - a.z) / (dP || 1); PL.vx += kx * 6; PL.vz += kz * 6; PL.vy += 2; }
    }
    // pose
    const o = a.obj; o.position.set(a.x, a.y + (a.type === 'drone' ? Math.sin(a.ph) * 0.25 : Math.abs(Math.sin(a.ph)) * 0.08), a.z);
    const face = a.state === 'hunt' ? Math.atan2(PL.x - a.x, PL.z - a.z) : Math.atan2(a.vx, a.vz);
    o.rotation.y += angDiff(face, o.rotation.y) * Math.min(1, dt * 5);
    const u = o.userData;
    if (u.tent) u.tent.forEach((t, i) => { t.rotation.x = Math.sin(a.ph + i) * 0.35 - a.vz * 0.03; t.rotation.z = Math.cos(a.ph * 1.3 + i) * 0.35 + a.vx * 0.03; });
    if (u.legs) { const moving = Math.hypot(a.vx, a.vz) > 0.5; u.legs.forEach(l => { l.hip.rotation.y = moving ? Math.sin(a.ph + l.ph) * 0.45 : 0; l.hip.rotation.z = moving ? Math.max(0, Math.sin(a.ph + l.ph + 1.5)) * 0.3 * l.side : 0; }); }
    u.body.scale.setScalar(a.hitT > 0 ? 1.12 : 1);
    if (u.eye) u.eye.material = a.state === 'hunt' ? AM.eye : AM.glow;
  }
  CB.aliens = CB.aliens.filter(a => !a.dead);
  // bolts
  for (let i = CB.bolts.length - 1; i >= 0; i--) {
    const b = CB.bolts[i]; b.life -= sdt;
    b.x += b.vx * sdt; b.y += b.vy * sdt; b.z += b.vz * sdt; b.obj.position.set(b.x, b.y, b.z);
    let done = b.life <= 0;
    if (!done && Math.hypot(b.x - PL.x, b.y - (PL.y + 1.0), b.z - PL.z) < 0.9) { hurtPlayer(10, true); done = true; }
    if (!done && b.y < groundAt(b.x, b.z)) { sparks(V3(b.x, b.y, b.z), 0x6dffb8, 8, 4); done = true; }
    if (done) { CB.group.remove(b.obj); CB.bolts.splice(i, 1); }
  }
  return anySee;
}
function fireBolt(a) {
  const lead = 0.5, tx = PL.x + PL.vx * lead, ty = PL.y + 1.1, tz = PL.z + PL.vz * lead;
  const dx = tx - a.x, dy = ty - a.y, dz = tz - a.z, d = Math.hypot(dx, dy, dz), sp = 21;
  const s = new THREE.Sprite(BOLT_MAT); s.scale.set(1.1, 1.1, 1); CB.group.add(s);
  const spread = 0.04;
  CB.bolts.push({ obj: s, x: a.x, y: a.y, z: a.z, vx: (dx / d + (Math.random() - .5) * spread) * sp, vy: (dy / d + (Math.random() - .5) * spread) * sp, vz: (dz / d + (Math.random() - .5) * spread) * sp, life: 5 });
  zap('alien');
}

/* ---------- raids ---------- */
function raidsOn() { return SAVE.settings.raids !== false; }
function scheduleRaid(first) { CO.raidNext = CO.sol + (first ? 2 : 2.2 + Math.random() * 0.8); }
function updateRaid(dt) {
  if (CO.raidNext === undefined) scheduleRaid(true);
  const R = RAID;
  if (R.state === 'calm') {
    if (raidsOn() && CO.sol >= CO.raidNext && !transitioning) startRaid();
    return;
  }
  R.t += dt;
  const s = R.ship;
  if (R.state === 'warn') {
    s.y = lerp(700, 150, ss(0, 12, R.t)); s.obj.position.set(s.x, s.y, s.z);
    R.siren -= dt; if (R.siren <= 0) { R.siren = 1.2; siren(); }
    if (R.t > 12) { R.state = 'active'; R.t = 0; spawnWave(); }
  } else if (R.state === 'active') {
    s.obj.position.set(s.x + Math.sin(GAME.t * 0.2) * 6, s.y + Math.sin(GAME.t * 0.7) * 1.5, s.z);
    const sp = R.spot, ts = PW.t.slow > 0 ? 0.3 : 1;
    if (Math.hypot(sp.tx - sp.x, sp.tz - sp.z) < 3) {
      const base = R.last && Math.random() < 0.6 ? R.last : { x: PL.x * 0.5, z: PL.z * 0.5 };
      sp.tx = base.x + (Math.random() - 0.5) * 70; sp.tz = base.z + (Math.random() - 0.5) * 70;
    }
    const dx = sp.tx - sp.x, dz = sp.tz - sp.z, d = Math.hypot(dx, dz) || 1, v = 7 * ts;
    sp.x += dx / d * Math.min(d, v * dt); sp.z += dz / d * Math.min(d, v * dt);
    const inSpot = Math.hypot(PL.x - sp.x, PL.z - sp.z) < 10.5 && PW.t.cloak <= 0 && !sheltered() && losClear(s.x, s.y - 3, s.z, PL.x, PL.y + 1.3, PL.z);
    const seen = updateAliens(dt) || inSpot;
    if (inSpot) { for (const a of CB.aliens) a.state = 'hunt'; R.last = { x: PL.x, z: PL.z }; }
    if (seen) { R.neverSeen = false; R.alarm = Math.min(1, R.alarm + dt * 2); } else R.alarm = Math.max(0, R.alarm - dt * 0.5);
    R.inSpot = inSpot; R.seen = seen;
    if (!CB.aliens.length) endRaid(true);
    else if (R.t > 110) endRaid(false);
  } else if (R.state === 'leaving') {
    s.y += dt * 90; s.obj.position.y = s.y; updateAliens(dt);
    for (const a of CB.aliens) { a.y += dt * 30; }
    if (R.t > 6) { CB.group.remove(s.obj); for (const a of CB.aliens) CB.group.remove(a.obj); CB.aliens = []; R.ship = null; R.state = 'calm'; }
  }
  if (s && s.obj.parent) {
    const u = s.obj.userData, on = R.state === 'active';
    u.beam.visible = u.spot.visible = on;
    if (on) {
      const gy = groundAt(R.spot.x, R.spot.z), top = V3(s.obj.position.x, s.obj.position.y - 3, s.obj.position.z), bot = V3(R.spot.x, gy + 0.2, R.spot.z);
      const len = top.distanceTo(bot); u.beam.position.copy(top); u.beam.scale.set(1, len, 1);
      u.beam.quaternion.setFromUnitVectors(V3(0, -1, 0), bot.clone().sub(top).normalize());
      u.spot.position.set(R.spot.x, gy + 0.25, R.spot.z);
      u.beam.material.opacity = R.inSpot ? 0.14 : 0.07; u.spot.material.color.set(R.inSpot ? 0xff5a3a : 0x4dffb0); u.beam.material.color.set(R.inSpot ? 0xff5a3a : 0x4dffb0);
    }
    s.obj.rotation.y += dt * 0.15;
    if (s.hitT > 0) s.hitT -= dt;
  }
}
function startRaid() {
  const R = RAID; CO.raidCount = (CO.raidCount || 0) + 1;
  const ang = Math.random() * Math.PI * 2;
  const obj = buildMothership(); CB.group.add(obj, obj.userData.beam, obj.userData.spot);
  R.ship = { x: Math.cos(ang) * 60, y: 700, z: Math.sin(ang) * 60, obj, hp: 900, max: 900, r: 21, dead: false, hitT: 0 };
  obj.position.set(R.ship.x, R.ship.y, R.ship.z);
  Object.assign(R, { state: 'warn', t: 0, alarm: 0, last: null, neverSeen: true, killed: 0, siren: 0, inSpot: false, seen: false });
  R.spot.x = R.spot.tx = R.ship.x; R.spot.z = R.spot.tz = R.ship.z;
  toast('Alien mothership incoming! Take cover behind rocks or buildings, or shelter by a habitat or the lander.', 'bad');
  try { document.exitPointerLock && 0; } catch (_) {}
}
function spawnWave() {
  const n = CO.raidCount || 1, s = RAID.ship;
  const drones = Math.min(10, 2 + n), crawlers = n >= 2 ? Math.min(6, Math.floor(n / 2)) : 0;
  for (let i = 0; i < drones; i++) { const a = Math.random() * Math.PI * 2; spawnAlien('drone', s.x + Math.cos(a) * 18, s.z + Math.sin(a) * 18, s.y - 10); }
  for (let i = 0; i < crawlers; i++) { const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 60; spawnAlien('crawler', Math.cos(a) * r, Math.sin(a) * r); }
  RAID.total = drones + crawlers;
  toast(`${drones} drones${crawlers ? ` and ${crawlers} crawlers` : ''} are searching the base.`, 'bad');
}
function endRaid(won, silent) {
  const R = RAID; if (R.state === 'calm' || R.state === 'leaving') return;
  if (!silent) {
    if (won) { const bonus = R.neverSeen ? 4 : 0; SAVE.profile.shards += bonus; toast(`Raid repelled! ${R.killed} aliens down${bonus ? `, +${bonus} shards for staying hidden` : ''}.`, 'good'); }
    else if (R.neverSeen) { SAVE.profile.shards += 3; toast('The aliens never found you. They gave up and left. +3 shards.', 'good'); }
    else toast('The mothership pulled its aliens back. They will return.', '');
  }
  R.state = 'leaving'; R.t = 0; scheduleRaid(false); CB.firing = false;
  for (const b of CB.bolts) CB.group.remove(b.obj); CB.bolts.length = 0;
  writeSave(true);
}
function killShip() {
  const s = RAID.ship; s.dead = true;
  for (let i = 0; i < 6; i++) burstFx(V3(s.x + (Math.random() - .5) * 30, s.y, s.z + (Math.random() - .5) * 30), i % 2 ? 0x4dffb0 : 0xffb547, 60, 25, 2.5);
  boom2(1.6); SAVE.profile.shards += 20;
  for (const a of CB.aliens) { burstFx(V3(a.x, a.y, a.z), 0x4dffb0, 30, 8, 0.4); CB.group.remove(a.obj); dropShard(a.x, a.z, 1); }
  CB.aliens = []; RAID.killed += 1;
  dropWreck(s.x * 0.6, s.z * 0.6, 6, true);
  toast('You destroyed the mothership! +20 shards. Its wreck crashed nearby: salvage it for alien tech.', 'good');
  RAID.state = 'leaving'; RAID.t = 3; scheduleRaid(false);
  CB.group.remove(s.obj, s.obj.userData.beam, s.obj.userData.spot);
}

/* ---------- cosmic anomalies & powers ---------- */
const ANOM_MAT = {};
function anomMat(color, op) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); }
function buildAnomalies(B) {
  CB.anoms = [];
  const r = mulberry(B.id === 'moon' ? 1201 : 3307);
  PLIST.forEach((id, i) => {
    const P = POWERS[id], ang = i / PLIST.length * Math.PI * 2 + r() * 0.8, dist = 110 + r() * 260;
    let x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    const y = groundAt(x, z), g = new THREE.Group(); g.position.set(x, y, z);
    const em = std(0x101010, 0.25, 0.3, { emissive: P.color, emissiveIntensity: 0.85 });
    const parts = [];
    if (id === 'leap') {
      const rock = mesh(new THREE.DodecahedronGeometry(1.6, 1), std(0x2a2a30, 0.6, 0.5), 0, 1.2, 0); rock.scale.y = 0.75; g.add(rock);
      for (let k = 0; k < 7; k++) { const c = mesh(new THREE.OctahedronGeometry(0.35 + r() * 0.3, 0), em, (r() - .5) * 2.4, 1 + r() * 1.4, (r() - .5) * 2.4); c.scale.y = 1.8; c.rotation.set(r() * 3, r() * 3, r() * 3); g.add(c); parts.push(c); }
    } else if (id === 'dash') {
      const rift = mesh(new THREE.PlaneGeometry(1.6, 5.5, 1, 8), anomMat(P.color, 0.75), 0, 3.2, 0);
      const pa = rift.geometry.attributes.position; for (let k = 0; k < pa.count; k++) { const yy = pa.getY(k); pa.setX(k, pa.getX(k) * (1 - Math.abs(yy) / 2.9) + Math.sin(yy * 2.2) * 0.35); } g.add(rift); parts.push(rift);
      const r2 = rift.clone(); r2.rotation.y = Math.PI / 2; g.add(r2); parts.push(r2);
    } else if (id === 'shield') {
      for (let k = 0; k < 9; k++) { const h = 1.2 + r() * 3.2, c = mesh(new THREE.ConeGeometry(0.28 + r() * 0.25, h, 6), em, (r() - .5) * 3, h / 2, (r() - .5) * 3); c.rotation.set((r() - .5) * 0.6, r() * 3, (r() - .5) * 0.6); g.add(c); }
    } else if (id === 'slow') {
      const core = mesh(new THREE.SphereGeometry(0.9, 24, 16), em, 0, 3, 0); g.add(core);
      for (let k = 0; k < 3; k++) { const t = mesh(new THREE.TorusGeometry(1.6 + k * 0.5, 0.05, 8, 48), anomMat(P.color, 0.7), 0, 3, 0); t.rotation.set(r() * 3, r() * 3, 0); g.add(t); parts.push(t); }
    } else {
      const pool = mesh(new THREE.CircleGeometry(3.2, 48), std(0x050208, 0.05, 0.9), 0, 0.06, 0); pool.rotation.x = -Math.PI / 2; g.add(pool);
      const rim = mesh(new THREE.RingGeometry(3.1, 3.5, 48), anomMat(P.color, 0.8), 0, 0.08, 0); rim.rotation.x = -Math.PI / 2; g.add(rim); parts.push(rim);
    }
    const pillar = mesh(new THREE.CylinderGeometry(0.35, 0.35, 260, 12, 1, true), anomMat(P.color, 0.035), 0, 130, 0); g.add(pillar);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: P.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3 }));
    halo.scale.set(6, 6, 1); halo.position.y = 2.4; g.add(halo);
    const ring = mesh(new THREE.RingGeometry(6.6, 7, 64), anomMat(P.color, 0.25), 0, 0.12, 0); ring.rotation.x = -Math.PI / 2; g.add(ring);
    g.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    surfScene.add(g);
    CB.anoms.push({ id, x, z, y, obj: g, parts, expo: 0, halo });
  });
}
function powerUnlocked(id) { return !!SAVE.profile.powers[id]; }
function updateAnomalies(dt) {
  CB.expoNear = null;
  for (const A of CB.anoms) {
    A.parts.forEach((p, i) => { p.rotation.y += dt * (0.6 + i * 0.2); if (A.id === 'slow') p.rotation.x += dt * 0.4; });
    A.halo.material.opacity = 0.24 + Math.sin(GAME.t * 2 + A.x) * 0.08;
    const d = Math.hypot(PL.x - A.x, PL.z - A.z);
    if (d < 7) {
      CB.expoNear = A;
      PW.energy = Math.min(100, PW.energy + dt * 28);
      if (!powerUnlocked(A.id)) {
        A.expo = Math.min(1, A.expo + dt / 4.5);
        if (Math.random() < dt * 30) burstFx(V3(PL.x + (Math.random() - .5) * 2, PL.y + Math.random() * 2, PL.z + (Math.random() - .5) * 2), POWERS[A.id].color, 1, 1.5, 0.12);
        if (A.expo >= 1) unlockPower(A.id);
      }
    } else if (!powerUnlocked(A.id)) A.expo = Math.max(0, A.expo - dt * 0.2);
  }
}
function unlockPower(id) {
  const P = POWERS[id]; SAVE.profile.powers[id] = 1; writeSave(true);
  toast(`The ${P.src.toLowerCase()} changed you. New power: ${P.name}${P.key ? ` (${P.key})` : ''}. ${P.info}.`, 'good');
  CB.tintPulse = 1; CB.tintColor = P.color; chime(); syncPowerHud(true);
}
function usePower(id) {
  const P = POWERS[id];
  if (!powerUnlocked(id)) { toast(`You don't have ${P.name} yet. Find the ${P.src.toLowerCase()} and stand in its glow.`, 'bad'); return; }
  if (PW.cd[id] > 0) return;
  if (PW.energy < P.cost) { toast('Not enough cosmic energy. Stand near any anomaly to recharge.', 'bad'); return; }
  PW.energy -= P.cost; PW.cd[id] = P.cd; PW.t[id] = P.dur;
  if (id === 'dash') { const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw); PW.dashDir = [fx, fz]; burstFx(V3(PL.x, PL.y + 1, PL.z), P.color, 30, 6, 0.3); }
  if (id === 'shield') PW.shieldHP = 60;
  CB.tintPulse = 0.6; CB.tintColor = P.color; chime();
}
function jumpVel() { const base = DS.B.id === 'moon' ? 3.3 : 3.8; return powerUnlocked('leap') ? base * 1.6 : base; }
function updatePowers(dt) {
  for (const k in PW.t) { PW.t[k] = Math.max(0, PW.t[k] - dt); PW.cd[k] = Math.max(0, PW.cd[k] - dt); }
  PW.energy = Math.min(100, PW.energy + dt * 1.2);
  const nearHome = Math.hypot(PL.x - DS.L.x, PL.z - DS.L.z) < 10 || SU.objs.some(o => o.m.id === 'hab' && Math.hypot(PL.x - o.m.x, PL.z - o.m.z) < 10);
  if (nearHome && RAID.state !== 'active') PW.hp = Math.min(100, PW.hp + dt * 6);
  CB.hurt = Math.max(0, CB.hurt - dt * 1.2);
  CB.tintPulse = Math.max(0, (CB.tintPulse || 0) - dt * 0.8);
}

/* ---------- per-frame glue, called from the surface loop ---------- */
function ensureCombat(fresh) {
  if (!CB.group.parent) surfScene.add(CB.group);
  if (fresh) {
    for (const a of CB.aliens) CB.group.remove(a.obj); CB.aliens = [];
    for (const b of CB.bolts) CB.group.remove(b.obj); CB.bolts = [];
    for (const s of CB.shards) CB.group.remove(s.obj); CB.shards = [];
    for (const w of CB.wrecks) CB.group.remove(w.obj); CB.wrecks = [];
    if (RAID.ship) CB.group.remove(RAID.ship.obj, RAID.ship.obj.userData.beam, RAID.ship.obj.userData.spot);
    RAID.ship = null; RAID.state = 'calm';
    PW.hp = SAVE.profile.hp || 100; PW.energy = SAVE.profile.energy ?? 60; CB.heat = 0; CB.over = false;
    initViewmodel();
    VM.cur = null; equip(SAVE.profile.weapons.includes(SAVE.profile.wpn) ? SAVE.profile.wpn : 'hands');
    if (CO.raidNext === undefined || CO.raidNext < CO.sol + 0.6) CO.raidNext = CO.sol + (CO.raidCount ? 1.2 : 2);
  }
}
function combatUpdate(dt, menuOpen) {
  if (MP.active) { mpCombat(dt, menuOpen); return; }
  updatePowers(dt);
  updateAnomalies(dt);
  CB.cool = Math.max(0, CB.cool - dt);
  CB.heat = Math.max(0, CB.heat - dt * (CB.over ? 0.45 : 0.6)); if (CB.over && CB.heat < 0.25) CB.over = false;
  if (CB.firing && !menuOpen && !SU.build && VM.cur !== 'hands') fireWeapon();
  updateRaid(dt);
  if (RAID.state === 'calm' || RAID.state === 'warn') updateAliens(dt);
  for (let i = CB.shards.length - 1; i >= 0; i--) {
    const s = CB.shards[i]; s.t += dt; s.obj.rotation.y += dt * 2; s.obj.position.y = groundAt(s.x, s.z) + 0.8 + Math.sin(s.t * 2.5) * 0.15;
    if (Math.hypot(PL.x - s.x, PL.z - s.z) < 2.4) { SAVE.profile.shards += 1; CB.group.remove(s.obj); CB.shards.splice(i, 1); toast('+1 xeno shard', 'good'); chime(); }
  }
  for (const b of CB.beams) if (b.life > 0) { b.life -= dt; const k = Math.max(0, b.life / b.max); b.m.material.opacity = k; b.core.material.opacity = k; b.m.scale.x = b.m.scale.y = b.w * (0.6 + k * 0.6); b.m.visible = b.life > 0; }
  stepFx(dt);
  SAVE.profile.hp = PW.hp; SAVE.profile.energy = PW.energy;
}
/* ================= SAVE GAME ================= */
const SAVE_KEY = 'karman-save-v2';
function freshSave() { return { v: 2, savedAt: 0, profile: { weapons: ['hands'], wpn: 'hands', shards: 0, tech: 0, parts: {}, powers: {}, energy: 60, hp: 100 }, colonies: {}, resume: null, settings: { gfx: COARSE ? 'medium' : 'high', raids: true } }; }
function normalizeSave(s) {
  const f = freshSave();
  s.profile = Object.assign(f.profile, s.profile || {}); s.settings = Object.assign(f.settings, s.settings || {});
  s.colonies = s.colonies || {}; if (!s.profile.weapons.includes('hands')) s.profile.weapons.unshift('hands');
  s.profile.weapons = s.profile.weapons.filter(w => WEAPONS[w]);
  return s;
}
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s && s.v === 2) return normalizeSave(s); } catch (e) {}
  const s = freshSave();
  for (const id of ['moon', 'mars']) { try { const c = JSON.parse(localStorage.getItem('karman-colony-' + id) || 'null'); if (c && c.v === 1) s.colonies[id] = c; } catch (e) {} }
  return s;
}
let SAVE = loadSave();
function writeSave(silent) {
  if (MP.active) { if (!silent) toast('Room progress is saved online.', 'good'); return true; }
  SAVE.savedAt = Date.now();
  if (GAME.mode === 'surface' && DS.L) SAVE.resume = { body: SF.body, x: PL.x, z: PL.z, yaw: PL.yaw, lx: DS.L.x, lz: DS.L.z };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); if (!silent) toast('Game saved', 'good'); return true; }
  catch (e) { if (!silent) toast('This browser is blocking saves here. Use Save code to keep your progress.', 'bad'); return false; }
}
function saveCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(Object.assign({}, SAVE, { savedAt: Date.now() }))))); }
function loadCode(code) {
  try {
    const s = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!s || s.v !== 2 || !s.profile) throw new Error('bad');
    SAVE = normalizeSave(s); writeSave(true); return true;
  } catch (e) { return false; }
}
function continueGame() {
  const r = SAVE.resume; if (!r || !BODIES[r.body]) return;
  const B = BODIES[r.body]; GAME.dest = r.body;
  showLoading(`Returning to your ${B.base.toLowerCase()}…`);
  setTimeout(() => {
    DS.B = B; buildSurface(B); surfaceSkySetup(B);
    if (DS.lander) surfScene.remove(DS.lander);
    DS.lander = buildLander(B.id); surfScene.add(DS.lander); shadowAll(DS.lander, true, true);
    DS.plume = makePlume(DS.lander.userData.nozzle, true); DS.plume.position.y = DS.lander.userData.bellY; DS.lander.add(DS.plume);
    surfScene.add(DS.dust.pts); DS.dust.list.length = 0;
    const L = ldNew(B); L.x = r.lx; L.z = r.lz; L.y = groundAt(L.x, L.z); L.vx = L.vy = L.vz = 0; L.alt = 0; L.landed = true; DS.L = L; DS.done = true;
    DS.lander.position.set(L.x, L.y, L.z);
    renderColonyStatic(B);
    hideLoading(); hideBanner();
    enterSurface();
    PL.x = r.x; PL.z = r.z; PL.y = groundAt(r.x, r.z); PL.yaw = r.yaw ?? Math.PI;
    toast(`Welcome back to your ${B.base.toLowerCase()}.`, 'good');
  }, 40);
}
function openSavePanel(mode) {
  if (MP.active) { toast('Room progress is saved online. Use Copy invite to bring your crew.', 'good'); return; }
  try { document.exitPointerLock(); } catch (_) {}
  const p = $('savePanel'); p.hidden = false;
  const ta = $('saveText');
  if (mode === 'export') { ta.value = saveCode(); setText($('spTitle'), 'Your save code'); setText($('spBody'), 'Copy this code and keep it somewhere safe. Paste it back here, on any device, to pick up where you left off.'); $('spCopy').hidden = false; $('spLoad').hidden = true; ta.readOnly = true; ta.select(); }
  else { ta.value = ''; setText($('spTitle'), 'Load a save code'); setText($('spBody'), 'Paste a save code below. It replaces the progress saved in this browser.'); $('spCopy').hidden = true; $('spLoad').hidden = false; ta.readOnly = false; setTimeout(() => ta.focus(), 30); }
}
$('spClose').addEventListener('click', () => { $('savePanel').hidden = true; });
$('spCopy').addEventListener('click', () => {
  const ta = $('saveText'); ta.select();
  const ok = () => toast('Save code copied', 'good');
  try { navigator.clipboard.writeText(ta.value).then(ok, () => { try { document.execCommand('copy'); ok(); } catch (_) { toast('Select the code and copy it yourself.', 'bad'); } }); } catch (_) { toast('Select the code and copy it yourself.', 'bad'); }
});
$('spLoad').addEventListener('click', () => {
  if (loadCode($('saveText').value)) { $('savePanel').hidden = true; toast('Save loaded', 'good'); transitionTo(enterHangar); }
  else toast('That code didn\'t work. Check that you pasted all of it.', 'bad');
});

/* ================= GRAPHICS: bloom, reflections, shadows ================= */
const GFX = { level: SAVE.settings.gfx || 'high', comp: null, bloom: null, scene: null, vm: false, bloomStr: 0.5 };
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
function gfxInit() {
  if (!THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.ShaderPass || !THREE.CopyShader) return;
  try {
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, encoding: THREE.sRGBEncoding };
    const ms = renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget;
    const rt = ms ? new THREE.WebGLMultisampleRenderTarget(4, 4, opts) : new THREE.WebGLRenderTarget(4, 4, opts);
    if (ms) rt.samples = 4;
    const comp = new THREE.EffectComposer(renderer, rt);
    class StackPass extends THREE.Pass { constructor() { super(); this.needsSwap = false; } render(r, w, read) { r.setRenderTarget(read); renderLayers(); } }
    comp.addPass(new StackPass());
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.93);
    comp.addPass(bloom); comp.addPass(new THREE.ShaderPass(THREE.CopyShader));
    GFX.comp = comp; GFX.bloom = bloom;
  } catch (e) { console.warn('Bloom unavailable', e); GFX.comp = null; }
}
function gfxResize() {
  if (!GFX.comp) return;
  GFX.comp.setPixelRatio(renderer.getPixelRatio()); GFX.comp.setSize(VW, VH);
}
function setGfx(level) {
  GFX.level = level; SAVE.settings.gfx = level;
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(level === 'high' ? Math.min(2, dpr) : level === 'medium' ? Math.min(1.5, dpr) : 1);
  for (const l of SHADOW_LIGHTS) { const sz = level === 'high' ? 2048 : 1024; if (l.shadow.mapSize.x !== sz) { l.shadow.mapSize.set(sz, sz); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } } }
  onResize(); syncGfxBtn();
}
function syncGfxBtn() { setText($('mGfx'), `Graphics: ${{ high: 'High', medium: 'Medium', low: 'Low' }[GFX.level]}`); }
const SHADOW_LIGHTS = [];
function shadowsOn() { return GFX.level !== 'low'; }
function shadowAll(obj, cast, receive) { obj.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } }); }
function setupShadow(light, size, near, far) {
  light.shadow.mapSize.set(GFX.level === 'high' ? 2048 : 1024, GFX.level === 'high' ? 2048 : 1024);
  const c = light.shadow.camera; c.left = c.bottom = -size; c.right = c.top = size; c.near = near; c.far = far; c.updateProjectionMatrix();
  light.shadow.bias = -0.0004; light.shadow.normalBias = 0.03;
  if (!SHADOW_LIGHTS.includes(light)) SHADOW_LIGHTS.push(light);
}
function renderLayers() {
  renderer.clear();
  skyCam.quaternion.copy(camera.quaternion);
  renderer.render(skyScene, skyCam);
  renderer.clearDepth();
  renderer.render(GFX.scene, camera);
  if (GFX.vm) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}
function drawFrame(scene, vm) {
  GFX.scene = scene; GFX.vm = !!vm;
  if (GFX.comp && GFX.level !== 'low') { GFX.bloom.strength = GFX.bloomStr; GFX.comp.render(); }
  else { renderer.setRenderTarget(null); renderLayers(); }
}
// image-based light so metal, foil and glass pick up their surroundings
const pmrem = new THREE.PMREMGenerator(renderer);
const ENV = {};
function envMap(key) {
  if (ENV[key]) return ENV[key];
  const C = {
    pad: [[0.16, 0.34, 0.78], [0.72, 0.82, 0.92], [0.18, 0.2, 0.14], V3(0.35, 0.62, 0.7), 18],
    space: [[0.004, 0.005, 0.01], [0.03, 0.05, 0.1], [0.06, 0.13, 0.3], V3(0.35, 0.62, 0.7), 26],
    hangar: [[0.05, 0.06, 0.09], [0.16, 0.18, 0.24], [0.03, 0.03, 0.04], V3(0.3, 1, 0.4), 6],
    moon: [[0.002, 0.002, 0.003], [0.03, 0.03, 0.035], [0.22, 0.215, 0.205], V3(0.6, 0.36, 0.45), 26],
    mars: [[0.32, 0.2, 0.13], [0.62, 0.44, 0.31], [0.38, 0.21, 0.12], V3(0.45, 0.7, 0.35), 14],
    proxima: [[0.07, 0.03, 0.1], [0.42, 0.15, 0.13], [0.12, 0.06, 0.14], V3(0.72, 0.22, 0.42), 10]
  }[key];
  const s = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uT: { value: new THREE.Color(...C[0]) }, uH: { value: new THREE.Color(...C[1]) }, uB: { value: new THREE.Color(...C[2]) }, uS: { value: C[3].clone().normalize() }, uP: { value: C[4] } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uT; uniform vec3 uH; uniform vec3 uB; uniform vec3 uS; uniform float uP; varying vec3 vD; void main(){ vec3 d = normalize(vD); float y = d.y; vec3 c = y > 0.0 ? mix(uH, uT, pow(y, 0.5)) : mix(uH, uB, pow(-y, 0.35)); c += vec3(1.0, 0.95, 0.88) * pow(max(dot(d, uS), 0.0), 90.0) * uP; gl_FragColor = linearToOutputTexel(vec4(c, 1.0)); }'
  });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), m));
  ENV[key] = pmrem.fromScene(s, 0.02).texture; return ENV[key];
}

/* ================= WORKSHOP (crafting) and power list ================= */
function costText(c) { const p = []; if (c.tech) p.push(`${c.tech} alien tech`); if (c.mat) p.push(`${c.mat} materials`); if (c.water) p.push(`${c.water} water`); if (c.shards) p.push(`${c.shards} xeno shards`); return p.join(' · '); }
function haveCost(c) { return (CO.res.mat || 0) >= (c.mat || 0) && (CO.res.water || 0) >= (c.water || 0) && SAVE.profile.shards >= (c.shards || 0) && (SAVE.profile.tech || 0) >= (c.tech || 0); }
function openCraft() {
  try { document.exitPointerLock(); } catch (_) {}
  CB.firing = false; renderCraft(); $('craftPanel').hidden = false; $('lockHint').hidden = true;
}
function closeCraft() { $('craftPanel').hidden = true; if (!COARSE && GAME.mode === 'surface') $('lockHint').hidden = PL.locked; }
function renderCraft() {
  const wl = $('craftList'); wl.textContent = '';
  for (const id of ['pistol', 'rifle', 'lance']) {
    const w = WEAPONS[id], own = SAVE.profile.weapons.includes(id), ok = haveCost(w.cost);
    const row = document.createElement('div'); row.className = 'crow';
    const t = document.createElement('div'); t.className = 'ctext';
    const n = document.createElement('b'); n.textContent = w.name; n.style.color = '#' + new THREE.Color(w.color).getHexString();
    const s = document.createElement('span'); s.textContent = `${w.info} · ${own ? 'in your kit' : costText(w.cost)}`;
    t.append(n, s);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (own ? '' : ok ? ' go' : '');
    b.textContent = own ? `Equip (${w.key})` : 'Craft'; b.disabled = !own && !ok;
    b.addEventListener('click', () => { if (own) { equip(id); closeCraft(); return; } craft(id); });
    row.append(t, b); wl.append(row);
  }
  const tl = $('techList'); tl.textContent = '';
  for (const id of ['jet', 'reactor', 'drive']) {
    const T = TECH[id], own = !!SAVE.profile.parts[id], ok = haveCost(T.cost);
    const row = document.createElement('div'); row.className = 'crow';
    const t = document.createElement('div'); t.className = 'ctext';
    const n = document.createElement('b'); n.textContent = T.name; n.style.color = '#7fd3ff';
    const s = document.createElement('span'); s.textContent = `${T.info} · ${own ? 'built' : costText(T.cost)}`;
    t.append(n, s);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (!own && ok ? ' go' : ''); b.textContent = own ? 'Built' : 'Build'; b.disabled = own || !ok;
    b.addEventListener('click', () => buildTech(id)); row.append(t, b); tl.append(row);
  }
  $('techList').hidden = MP.active; $('powerList').hidden = MP.active;
  setText($('techNote'), MP.active ? 'This crew mission uses colony buildings and laser weapons. Spacecraft upgrades and cosmic powers belong to solo missions.' : starshipReady() ? 'Your Seraph starship is ready in the hangar. Fly home and pick it.' : 'Salvage glowing alien wrecks after raids to collect alien tech.');
  const pl = $('powerList'); pl.textContent = '';
  for (const id of PLIST) {
    const P = POWERS[id], has = powerUnlocked(id), row = document.createElement('div'); row.className = 'crow';
    const t = document.createElement('div'); t.className = 'ctext';
    const n = document.createElement('b'); n.textContent = has ? `${P.name}${P.key ? ` · ${P.key}` : ''}` : '??? Unknown power'; n.style.color = has ? '#' + new THREE.Color(P.color).getHexString() : '';
    const s = document.createElement('span'); s.textContent = has ? P.info : `Find the ${P.src.toLowerCase()} and stand in its glow.`;
    t.append(n, s); row.append(t); pl.append(row);
  }
  setText($('craftRes'), `You have ${Math.floor(CO.res.mat)} materials · ${Math.floor(CO.res.water)} water · ${SAVE.profile.shards} xeno shards · ${SAVE.profile.tech || 0} alien tech`);
}
function craft(id) {
  if (MP.active) { mpCommand({ type: 'craft', weapon: id }); return; }
  const w = WEAPONS[id];
  if (!haveCost(w.cost)) { toast('Not enough resources yet.', 'bad'); return; }
  CO.res.mat -= w.cost.mat || 0; CO.res.water -= w.cost.water || 0; SAVE.profile.shards -= w.cost.shards || 0;
  SAVE.profile.weapons.push(id); equip(id); writeSave(true); chime();
  toast(`Crafted a ${w.name.toLowerCase()} from ${DS.B.id === 'moon' ? 'lunar' : 'Martian'} materials.`, 'good');
  renderCraft(); syncWeaponHud();
}
$('craftClose').addEventListener('click', closeCraft);
$('craftBtn').addEventListener('click', () => { $('craftPanel').hidden ? openCraft() : closeCraft(); });

/* ================= COMBAT HUD ================= */
function syncWeaponHud() {
  const box = $('wpnSlots'); if (!box.children.length) {
    for (const id of WLIST) { const b = document.createElement('button'); b.type = 'button'; b.className = 'wslot'; b.dataset.id = id; const k = document.createElement('kbd'); k.textContent = WEAPONS[id].key; const n = document.createElement('span'); n.textContent = WEAPONS[id].name; b.append(k, n); b.addEventListener('click', () => equip(id)); box.append(b); }
  }
  for (const b of box.children) { const own = SAVE.profile.weapons.includes(b.dataset.id); b.disabled = !own; b.setAttribute('aria-pressed', String(VM.cur === b.dataset.id)); }
  setText($('wpnName'), WEAPONS[VM.cur || 'hands'].name);
  setText($('tWpn'), VM.cur && VM.cur !== 'hands' ? WEAPONS[VM.cur].name.split(' ').pop() : 'Arm');
  $('tFire').hidden = !VM.cur || VM.cur === 'hands';
}
function syncPowerHud(force) {
  const box = $('powBox'), tb = $('tPowers');
  if (force || box.dataset.n !== String(PLIST.filter(powerUnlocked).length)) {
    box.textContent = ''; tb.textContent = ''; box.dataset.n = String(PLIST.filter(powerUnlocked).length);
    for (const id of PLIST) {
      if (!powerUnlocked(id)) continue;
      const P = POWERS[id], col = '#' + new THREE.Color(P.color).getHexString();
      const c = document.createElement('button'); c.type = 'button'; c.className = 'pchip'; c.dataset.id = id; c.style.setProperty('--pc', col);
      const k = document.createElement('kbd'); k.textContent = P.key || 'auto'; const n = document.createElement('span'); n.textContent = P.name; const cd = document.createElement('i');
      c.append(k, n, cd); if (P.key) c.addEventListener('click', () => usePower(id)); box.append(c);
      if (P.key) { const t = document.createElement('button'); t.type = 'button'; t.className = 'tpow'; t.dataset.id = id; t.style.setProperty('--pc', col); t.textContent = P.key; t.title = P.name; t.addEventListener('pointerdown', e => { e.preventDefault(); usePower(id); }); tb.append(t); }
    }
    box.hidden = !box.children.length;
  }
  for (const c of box.children) { const id = c.dataset.id, P = POWERS[id]; if (!P.key) continue; const cd = PW.cd[id] / P.cd; c.querySelector('i').style.transform = `scaleX(${cd.toFixed(3)})`; c.classList.toggle('on', PW.t[id] > 0); c.classList.toggle('poor', PW.energy < P.cost); }
  for (const t of tb.children) { const id = t.dataset.id; t.classList.toggle('on', PW.t[id] > 0); t.style.opacity = PW.cd[id] > 0 || PW.energy < POWERS[id].cost ? 0.45 : 1; }
}
function combatHud() {
  $('hpBar').style.transform = `scaleX(${clamp(PW.hp / 100, 0, 1).toFixed(3)})`; set('hpPct', `${Math.ceil(PW.hp)}`);
  $('enBar').style.transform = `scaleX(${(PW.energy / 100).toFixed(3)})`; set('enPct', `${Math.floor(PW.energy)}`);
  set('shardN', String(SAVE.profile.shards)); set('techN', String(SAVE.profile.tech || 0));
  $('jetBar').style.transform = `scaleX(${(PL.jet ?? 1).toFixed(3)})`; set('jetPct', `${Math.round((PL.jet ?? 1) * 100)}%`);
  $('heatBar').style.transform = `scaleX(${CB.heat.toFixed(3)})`; $('heatBar').parentElement.className = 'bar ' + (CB.over ? 'r' : 'a');
  $('heatRow').hidden = !VM.cur || VM.cur === 'hands';
  syncPowerHud();
  const R = RAID, box = $('raidBox');
  box.hidden = R.state === 'calm' || R.state === 'leaving';
  if (R.state === 'warn') { set('raidState', 'Incoming', 'warn'); set('raidInfo', MP.active ? `Raid starts in ${Math.max(0, Math.ceil(12 - R.t))} s · prepare your crew` : `Mothership arrives in ${Math.max(0, Math.ceil(12 - R.t))} s · find cover`); }
  else if (R.state === 'active') {
    const hid = !R.seen; set('raidState', PW.t.cloak > 0 ? 'Cloaked' : hid ? (sheltered() ? 'Sheltered' : 'Hidden') : 'Spotted!', hid ? 'good' : 'warn');
    set('raidInfo', MP.active ? `${CB.aliens.length} aliens left · retreats in ${Math.max(0, Math.ceil(110 - R.t))} s` : `${CB.aliens.length} alien${CB.aliens.length === 1 ? '' : 's'} left · mothership ${R.ship ? Math.max(0, Math.ceil(R.ship.hp / R.ship.max * 100)) : 100}% · leaves in ${Math.max(0, Math.ceil(110 - R.t))} s`);
  }
  box.classList.toggle('alert', R.state === 'active' && !!R.seen);
  const nr = MP.active ? MP.world.raid.next / 45 : CO.raidNext;
  set('cRaid', !raidsOn() ? 'off' : R.state !== 'calm' ? 'now!' : nr !== undefined ? `${DS.B.day} ${Math.floor(nr) + 1}` : '—', R.state !== 'calm' && raidsOn() ? 'warn' : '');
  const e = CB.expoNear;
  if (e && !powerUnlocked(e.id)) { set('sPrompt', `Cosmic exposure ${Math.round(e.expo * 100)}% · stay in the glow…`, 'good'); }
  else if (e) set('sPrompt', `${POWERS[e.id].src} · recharging cosmic energy`, 'good');
}
function combatOverlays() {
  $('hurt').style.opacity = (CB.hurt * 0.9).toFixed(3);
  let tc = null, ta = 0;
  if (PW.t.cloak > 0) { tc = POWERS.cloak.color; ta = 0.24; }
  if (PW.t.slow > 0) { tc = POWERS.slow.color; ta = 0.2; }
  if (PW.t.shield > 0) { tc = POWERS.shield.color; ta = 0.2; }
  if (CB.expoNear && !powerUnlocked(CB.expoNear.id)) { tc = POWERS[CB.expoNear.id].color; ta = Math.max(ta, 0.06 + CB.expoNear.expo * 0.2); }
  if (CB.tintPulse > 0) { tc = CB.tintColor; ta = Math.max(ta, CB.tintPulse * 0.4); }
  const t = $('tint');
  if (tc !== null) { t.style.setProperty('--tc', '#' + new THREE.Color(tc).getHexString()); t.style.opacity = ta.toFixed(3); } else t.style.opacity = 0;
  camera.fov = 50 + (PW.t.dash > 0 ? 14 : 0) * (PW.t.dash / POWERS.dash.dur); if (Math.abs(camera.fov - (camera._lf || 50)) > 0.01) { camera.updateProjectionMatrix(); camera._lf = camera.fov; }
}
$('tWpn').addEventListener('click', () => cycleWeapon(1));
const fireBtn = $('tFire');
fireBtn.addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); CB.firing = true; try { fireBtn.setPointerCapture(e.pointerId); } catch (_) {} });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) fireBtn.addEventListener(ev, () => { CB.firing = false; });
document.addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) CB.firing = false; });

/* ================= SOUND EFFECTS ================= */
function tone(f0, f1, dur, type, vol) {
  if (!AC || muted) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
}
function zap(id) {
  if (id === 'alien') tone(520, 160, 0.3, 'triangle', 0.07);
  else if (id === 'rifle') tone(1700, 520, 0.07, 'sawtooth', 0.045);
  else if (id === 'lance') { tone(320, 55, 0.55, 'sawtooth', 0.13); burst(0.45, 1500, 0.35); }
  else tone(1350, 280, 0.13, 'square', 0.055);
}
const thud = () => { tone(140, 50, 0.25, 'sine', 0.35); burst(0.15, 500, 0.4); };
const boom2 = v => burst(0.8 + v, 380, 0.8 * v + 0.3);
const siren = () => { tone(420, 760, 0.55, 'sawtooth', 0.05); setTimeout(() => tone(760, 420, 0.55, 'sawtooth', 0.05), 560); };
const chime = () => { tone(660, 660, 0.35, 'sine', 0.08); setTimeout(() => tone(990, 990, 0.5, 'sine', 0.07), 120); };
/* ================= WALK-IN HABITATS ================= */
const HAB_LIGHT = new THREE.PointLight(0xffdcae, 0, 15, 1.6);
function buildHabitat(g) {
  const wall = std(0xb9b6af, 0.7, 0.08, { side: THREE.DoubleSide, envMapIntensity: 0.5 }), floor = std(0x7d838c, 0.75, 0.3), dark = MM.hullDark;
  const gap = 0.34;
  g.add(mesh(new THREE.CylinderGeometry(5.3, 5.6, 4, 48), dark, 0, -2.05, 0));
  g.add(mesh(new THREE.CylinderGeometry(5.05, 5.05, 0.12, 48), floor, 0, -0.06, 0));
  g.add(mesh(new THREE.CylinderGeometry(5, 5, 2.5, 64, 1, true, gap / 2, Math.PI * 2 - gap), wall, 0, 1.25, 0));
  g.add(mesh(new THREE.CylinderGeometry(5.04, 5.04, 0.32, 64, 1, true, gap / 2, Math.PI * 2 - gap), MM.window, 0, 1.8, 0));
  const dome = mesh(new THREE.SphereGeometry(5, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), wall, 0, 2.5, 0); dome.scale.y = 0.72; g.add(dome);
  g.add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.25, 20), MM.amber, 0, 2.5 + 3.6, 0));
  // airlock tunnel, open to walk through
  for (const x of [-0.82, 0.82]) g.add(mesh(new THREE.BoxGeometry(0.14, 2.45, 2.6), wall, x, 1.22, 6.0));
  g.add(mesh(new THREE.BoxGeometry(1.78, 0.14, 2.6), wall, 0, 2.5, 6.0));
  g.add(mesh(new THREE.BoxGeometry(1.64, 0.1, 2.6), floor, 0, -0.05, 6.0));
  g.add(mesh(new THREE.BoxGeometry(1.95, 0.2, 0.22), MM.amber, 0, 2.42, 7.3));
  const door = mesh(new THREE.BoxGeometry(1.5, 2.3, 0.08), dark, 0, 1.15, 7.22); g.add(door);
  // interior
  g.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 24), std(0xd8d4cc, 0.5, 0.1), 0, 0.78, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.75, 12), dark, 0, 0.38, 0));
  for (const a of [1.1, 2.0, 4.3, 5.2]) {
    const b = mesh(new THREE.BoxGeometry(2.0, 0.45, 0.85), std(0x3c5a8a, 0.8, 0.05), Math.sin(a) * 3.9, 0.35, Math.cos(a) * 3.9); b.rotation.y = a + Math.PI / 2; g.add(b);
    const p = mesh(new THREE.BoxGeometry(1.9, 0.12, 0.8), std(0xeeeae2, 0.9, 0), Math.sin(a) * 3.9, 0.62, Math.cos(a) * 3.9); p.rotation.y = a + Math.PI / 2; g.add(p);
  }
  for (const a of [2.75, 3.5]) {
    const sc = mesh(new THREE.BoxGeometry(1.3, 0.75, 0.06), std(0x0a1418, 0.3, 0.2, { emissive: 0x3ac8ff, emissiveIntensity: 0.9 }), Math.sin(a) * 4.85, 1.45, Math.cos(a) * 4.85); sc.rotation.y = a; g.add(sc);
  }
  for (const a of [0.55, 5.75, 3.12]) {
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 12), std(0x6a4a3a, 0.8, 0), Math.sin(a) * 4.2, 0.22, Math.cos(a) * 4.2));
    const pl = mesh(new THREE.SphereGeometry(0.42, 12, 8), MM.plant, Math.sin(a) * 4.2, 0.72, Math.cos(a) * 4.2); pl.scale.y = 1.2; g.add(pl);
  }
  const ringL = mesh(new THREE.TorusGeometry(1.3, 0.07, 8, 40), std(0x222222, 0.3, 0, { emissive: 0xffe2b8, emissiveIntensity: 1.6 }), 0, 4.6, 0); ringL.rotation.x = Math.PI / 2; g.add(ringL);
  g.userData.door = door;
}
function habFloor(m) {
  let mx = groundAt(m.x, m.z);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; mx = Math.max(mx, groundAt(m.x + Math.cos(a) * 5.3, m.z + Math.sin(a) * 5.3)); }
  const c = Math.cos(m.rot), s = Math.sin(m.rot);
  for (const lz of [6, 7.3]) mx = Math.max(mx, groundAt(m.x + lz * s, m.z + lz * c));
  return mx + 0.12;
}
function habLocal(o, x, z) { const c = Math.cos(o.m.rot), s = Math.sin(o.m.rot), dx = x - o.m.x, dz = z - o.m.z; return [dx * c - dz * s, dx * s + dz * c]; }
function habWorld(o, lx, lz) { const c = Math.cos(o.m.rot), s = Math.sin(o.m.rot); return [o.m.x + lx * c + lz * s, o.m.z - lx * s + lz * c]; }
function habCollide() {
  PL.inHab = null;
  for (const o of SU.objs) {
    if (o.m.id !== 'hab' || o.grow < 1) continue;
    let [lx, lz] = habLocal(o, PL.x, PL.z);
    const d = Math.hypot(lx, lz); if (d > 8) continue;
    const inGap = Math.abs(lx) < 0.6 && lz > 0;
    if (d > 4.62 && d < 5.4 && !inGap) { const t = d < 5.0 ? 4.62 : 5.4; lx *= t / d; lz *= t / d; }
    if (lz > 4.75 && lz < 7.4) { const ax = Math.abs(lx); if (ax > 0.6 && ax < 1.02) lx = Math.sign(lx) * (ax < 0.81 ? 0.6 : 1.02); }
    [PL.x, PL.z] = habWorld(o, lx, lz);
    if (Math.hypot(lx, lz) < 4.7) PL.inHab = o;
  }
}
function playerGround(x, z) {
  let g = groundAt(x, z);
  for (const o of SU.objs) {
    if (o.m.id !== 'hab' || o.grow < 1) continue;
    const [lx, lz] = habLocal(o, x, z);
    if (Math.hypot(lx, lz) < 5.2 || (Math.abs(lx) < 0.95 && lz > 4 && lz < 7.4)) g = Math.max(g, o.m.fy);
  }
  return g;
}
function updateHabitats(dt) {
  if (!HAB_LIGHT.parent) surfScene.add(HAB_LIGHT);
  let best = null, bd = 30;
  for (const o of SU.objs) {
    if (o.m.id !== 'hab') continue;
    const d = Math.hypot(PL.x - o.m.x, PL.z - o.m.z); if (d < bd) { bd = d; best = o; }
    const door = o.obj.userData.door; if (!door) continue;
    const [lx, lz] = habLocal(o, PL.x, PL.z), near = Math.hypot(lx, lz - 7.3) < 3.6 || Math.hypot(lx, lz) < 4.7;
    door.position.y += ((near ? 3.35 : 1.15) - door.position.y) * Math.min(1, dt * 6);
  }
  if (best) { HAB_LIGHT.position.set(best.m.x, best.m.fy + 3.6, best.m.z); HAB_LIGHT.intensity = 2.2 * clamp(1 - (bd - 6) / 14, 0, 1); } else HAB_LIGHT.intensity = 0;
}

/* ================= JETPACK ================= */
function updateJetpack(dt, menuOpen) {
  if (PL.jet === undefined) PL.jet = 1;
  PL.airT = PL.onGround ? 0 : (PL.airT || 0) + dt;
  const plasma = !!SAVE.profile.parts.jet, B = DS.B;
  const want = (keys.Space || touch.jump) && !PL.onGround && PL.airT > 0.2 && !menuOpen && !PL.inHab;
  PL.jetting = want && PL.jet > 0;
  if (PL.jetting) {
    PL.vy = Math.min(PL.vy + (B.g + 5.5 * (plasma ? 1.4 : 1)) * dt, 10);
    PL.jet = Math.max(0, PL.jet - dt * (plasma ? 0.12 : 0.24));
    const L = CB.fx.list, c = new THREE.Color(plasma ? 0x7fd3ff : 0xffb070);
    for (let i = 0; i < 3 && L.length < CB.fx.max; i++) L.push({ x: PL.x + (Math.random() - .5) * 0.3, y: PL.y + 0.6, z: PL.z + (Math.random() - .5) * 0.3, vx: PL.vx * 0.3 + (Math.random() - .5) * 1.5, vy: -6 - Math.random() * 4, vz: PL.vz * 0.3 + (Math.random() - .5) * 1.5, r: 0.12, gr: 0.5, age: 0, life: 0.35 + Math.random() * 0.2, c, fire: true });
  } else if (PL.onGround) PL.jet = Math.min(1, PL.jet + dt * 0.35);
}

/* ================= ALIEN WRECKS & TECH ================= */
function dropWreck(x, z, tech, big) {
  const g = new THREE.Group(), s = big ? 3 : 1;
  for (let i = 0; i < (big ? 9 : 4); i++) { const p = mesh(new THREE.TetrahedronGeometry((0.3 + Math.random() * 0.5) * s, 0), AM.hull, (Math.random() - .5) * 1.6 * s, 0.2 * s, (Math.random() - .5) * 1.6 * s); p.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); p.castShadow = true; g.add(p); }
  g.add(mesh(new THREE.SphereGeometry(0.22 * s, 14, 10), AM.glow, 0, 0.3 * s, 0));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x4dffb0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 })); glow.scale.set(2.4 * s, 2.4 * s, 1); glow.position.y = 0.4 * s; g.add(glow);
  g.position.set(x, groundAt(x, z), z); CB.group.add(g);
  CB.wrecks.push({ x, z, obj: g, tech, r: big ? 4 : 1.6 });
}
function salvage(w) {
  SAVE.profile.tech = (SAVE.profile.tech || 0) + w.tech; CB.group.remove(w.obj); CB.wrecks.splice(CB.wrecks.indexOf(w), 1);
  toast(`Salvaged alien technology (+${w.tech}). Use it in the workshop.`, 'good'); chime(); CB.reach = 1; writeSave(true);
}
const TECH = {
  jet: { id: 'jet', name: 'Plasma jetpack', cost: { tech: 2, mat: 40 }, info: 'Twice the jet fuel and 40% more thrust' },
  reactor: { id: 'reactor', name: 'Plasma reactor', cost: { tech: 6, shards: 15, mat: 200 }, info: 'Starship part 1 of 2: a fusion core reverse-engineered from alien drones' },
  drive: { id: 'drive', name: 'Light-speed drive', cost: { tech: 10, shards: 25, mat: 300, water: 80 }, info: 'Starship part 2 of 2: lets your ship travel at the speed of light' }
};
function starshipReady() { const p = SAVE.profile.parts; return !!(p.reactor && p.drive); }
function buildTech(id) {
  if (MP.active) return;
  const t = TECH[id];
  if (!haveCost(t.cost)) { toast('Not enough resources yet.', 'bad'); return; }
  CO.res.mat -= t.cost.mat || 0; CO.res.water -= t.cost.water || 0; SAVE.profile.shards -= t.cost.shards || 0; SAVE.profile.tech -= t.cost.tech || 0;
  SAVE.profile.parts[id] = 1; chime();
  toast(`Built: ${t.name}.`, 'good');
  if ((id === 'reactor' || id === 'drive') && starshipReady()) toast('Both starship parts are done. The Seraph plasma starship is waiting in the hangar!', 'good');
  writeSave(true); renderCraft();
}

/* ================= SERAPH: the plasma starship ================= */
function buildSeraph(R) {
  const root = new THREE.Group(), s1 = new THREE.Group(), s2 = new THREE.Group(), pay = new THREE.Group();
  const hull = std(0xe9ecf0, 0.28, 0.55), dark = std(0x1c2028, 0.4, 0.6), glow = std(0x0a1a22, 0.3, 0, { emissive: 0x3ad8ff, emissiveIntensity: 1.5 });
  const L = R.totalLen, r = R.s1.r, pts = [];
  const prof = [[0, r * 0.92], [3, r], [7, r * 1.06], [10, r], [L * 0.62, r * 0.96], [L * 0.75, r * 0.86]];
  for (const [y, x] of prof) pts.push(new THREE.Vector2(x, y));
  for (let i = 1; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(r * 0.86 * Math.pow(Math.cos(t * Math.PI / 2), 0.7) + 0.001, L * 0.75 + t * L * 0.25)); }
  s1.add(mesh(new THREE.LatheGeometry(pts, 48), hull));
  for (const [y, w] of [[6, 0.38], [12, 0.18], [18, 0.12]]) { const t = mesh(new THREE.TorusGeometry(r * 1.07, w, 14, 64), glow, 0, y, 0); t.rotation.x = Math.PI / 2; s1.add(t); }
  const win = mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.85, 1.1, 48, 1, true, -0.9, 1.8), std(0x081018, 0.05, 0.8, { emissive: 0x1a5a7a, emissiveIntensity: 0.6 }), 0, L * 0.79, 0); s1.add(win);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2, sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(r * 2.2, -1.5); sh.lineTo(r * 2.2, 2.5); sh.lineTo(0, 14); sh.lineTo(0, 0);
    const fg = new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: false }); fg.translate(0, 0, -0.125);
    const f = mesh(fg, hull, Math.cos(a) * r * 0.95, 1, Math.sin(a) * r * 0.95); f.rotation.y = -a; s1.add(f);
    const tip = mesh(new THREE.BoxGeometry(0.3, 4, 0.3), glow, Math.cos(a) * (r * 3.1), 1.5, Math.sin(a) * (r * 3.1)); s1.add(tip);
  }
  const bg = bellGeo(r * 0.18, r * 0.42, R.s1.bell);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + Math.PI / 3; s1.add(mesh(bg, dark, Math.cos(a) * r * 0.5, 0, Math.sin(a) * r * 0.5)); s1.add(mesh(new THREE.CircleGeometry(r * 0.4, 20), glow, Math.cos(a) * r * 0.5, -R.s1.bell + 0.05, Math.sin(a) * r * 0.5).rotateX(Math.PI / 2)); }
  const p1 = makePlume(r * 0.95, true, 0xeafcff, 0x3a8cff); p1.position.y = -R.s1.bell; s1.add(p1);
  const p2 = makePlume(0.1, true); s2.add(p2);
  const fL = new THREE.Group(), fR = new THREE.Group(); pay.add(fL, fR); s2.add(pay); s2.position.y = R.sepOff;
  root.add(s1, s2);
  return { root, s1, s2, pay, fL, fR, p1, p2, cargo: new THREE.Group() };
}

/* ================= LIGHT-SPEED JUMP (transfer view for the starship) ================= */
const WARP = { lines: null, n: 1600, pos: null, data: null, ship: null, glow: null };
const WARP_DEST = {
  moon: { name: 'the Moon', dist: 384400, unit: 'light-seconds', lt: 1.28, time: t => `${(t * 1.28).toFixed(2)} s` },
  mars: { name: 'Mars', dist: 2.25e8, unit: 'light-minutes', lt: 12.5, time: t => `${(t * 12.5).toFixed(1)} min` },
  proxima: { name: 'Proxima b', dist: 4.0e13, unit: 'light-years', lt: 4.24, time: t => `${(t * 4.24).toFixed(2)} years` }
};
function enterWarp() {
  while (transferScene.children.length > 3) transferScene.remove(transferScene.children[3]);
  const N = WARP.n, pos = new Float32Array(N * 6), col = new Float32Array(N * 6), data = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = 6 + Math.pow(Math.random(), 0.6) * 90;
    data[i * 3] = Math.cos(a) * r; data[i * 3 + 1] = Math.sin(a) * r; data[i * 3 + 2] = -Math.random() * 1200;
    const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.12 - (r > 60 ? 0.5 : 0), 0.7, 0.75);
    col.set([c.r, c.g, c.b, c.r * 0.2, c.g * 0.2, c.b * 0.2], i * 6);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  WARP.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  WARP.lines.frustumCulled = false; WARP.pos = pos; WARP.data = data; transferScene.add(WARP.lines);
  const R = ROCKETS.find(x => x.id === 'seraph');
  WARP.ship = buildSeraph(R); const s = WARP.ship.root; s.scale.setScalar(0.11); s.rotation.x = -Math.PI / 2; s.position.set(0, -1.7, -11); transferScene.add(s);
  WARP.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: GAME.dest === 'proxima' ? 0xff7a4a : GAME.dest === 'mars' ? 0xd08a5a : 0xdedad2, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  WARP.glow.position.set(0, 0, -900); transferScene.add(WARP.glow);
  transferScene.environment = envMap('space'); trLight.visible = true; trLight.position.set(0.4, 1, 0.6); trSunLight.visible = false;
  TR.warp = true; TR.t = 0; TR.dur = 14; TR.fast = false; TR.done = false; activeOC = null; $('labels').textContent = '';
  const D = WARP_DEST[GAME.dest];
  set('trBrand', 'Seraph'); set('trTitle', `Light-speed jump to ${D.name}`);
  set('trEyebrow', GAME.dest === 'proxima' ? 'At the speed of light your ship clock barely ticks while Earth ages 4.24 years' : `Light takes ${D.lt} ${D.unit.replace('light-', '')} to get there`);
  setText($('trSpeed'), 'Faster'); set('trView', 'View: Cockpit');
  setSky({ top: 0x000000, hor: 0x000000, stars: 0.4, halo: 0, disc: 0 });
  showMode('transfer');
}
function renderWarp(dt) {
  const t = TR.t, f = ss(0, 0.16, t) * (1 - ss(0.86, 1, t)), D = WARP_DEST[GAME.dest];
  const v = 30 + f * 1600, len = 1 + f * 140, N = WARP.n, pos = WARP.pos, data = WARP.data;
  for (let i = 0; i < N; i++) {
    let z = data[i * 3 + 2] + v * dt; if (z > 20) z -= 1220; data[i * 3 + 2] = z;
    const x = data[i * 3], y = data[i * 3 + 1];
    pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z; pos[i * 6 + 3] = x; pos[i * 6 + 4] = y; pos[i * 6 + 5] = z - len;
  }
  WARP.lines.geometry.attributes.position.needsUpdate = true;
  const sh = RM ? 0 : f * 0.04;
  camera.position.set(Math.sin(GAME.t * 31) * sh, Math.cos(GAME.t * 27) * sh, 0); camera.up.set(0, 1, 0); camera.lookAt(0, 0, -50);
  const gs = 30 + ss(0.75, 1, t) * 900; WARP.glow.scale.set(gs, gs, 1);
  setPlume(WARP.ship.p1, 0.6 + f * 0.4, 0, GAME.t);
  WARP.ship.root.position.y = -1.7 + Math.sin(GAME.t * 1.3) * 0.08;
  GFX.bloomStr = 0.9; drawFrame(transferScene);
  set('trDay', `Earth time ${D.time(t)}`);
  const left = D.dist * (1 - t);
  set('trDist', GAME.dest === 'proxima' ? `${(4.24 * (1 - t)).toFixed(2)} ly` : fmtKm(left * 1000));
  set('trVel', `${Math.round(f * 299792).toLocaleString('en-GB')} km/s · ${f.toFixed(2)} c`);
  set('trEta', D.time(1 - t));
  set('trChip', f > 0.98 ? 'Light speed' : t < 0.5 ? 'Accelerating' : 'Slowing down', 'cyan');
}

/* ================= PROXIMA b scenery ================= */
function buildBioPlants() {
  const N = COARSE ? 400 : 750, r = mulberry(77);
  const stalks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.09, 1, 6), std(0x1d3a3a, 0.7, 0.1), N);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = V3(), p = V3(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    let x, z; do { const a = r() * Math.PI * 2, d = 14 + Math.pow(r(), 1.3) * 900; x = Math.cos(a) * d; z = Math.sin(a) * d; } while (Math.hypot(x, z) < 14);
    const h = 0.5 + Math.pow(r(), 2) * 2.6, gy = groundAt(x, z);
    e.set((r() - .5) * 0.3, 0, (r() - .5) * 0.3); q.setFromEuler(e); sc.set(1, h, 1); p.set(x, gy + h / 2, z); m4.compose(p, q, sc); stalks.setMatrixAt(i, m4);
    const bs = 0.7 + r() * 1.2; sc.set(bs, bs, bs); p.set(x, gy + h, z); m4.compose(p, q, sc); bulbs.setMatrixAt(i, m4);
    c.setHSL([0.5, 0.83, 0.33][Math.floor(r() * 3)] + (r() - .5) * 0.04, 1, 0.55).multiplyScalar(1.6); bulbs.setColorAt(i, c);
  }
  stalks.castShadow = true;
  surfScene.add(stalks, bulbs);
}
/* ================= HANGAR ================= */
const hangarScene = new THREE.Scene();
const HG = { oc: makeOC({ yaw: 0.7, pitch: 0.08, dist: 120, min: 15, max: 600, minPitch: -0.1, maxPitch: 1.2 }), model: null, idle: 0 };
(function buildHangar() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#0b0f19'; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(150,180,240,.16)'; x.lineWidth = 2; for (let i = 0; i <= 512; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); t.anisotropy = 8;
  const floor = mesh(new THREE.CircleGeometry(400, 64), std(0xffffff, 0.55, 0.3, { map: t })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; hangarScene.add(floor);
  const tt = mesh(new THREE.CylinderGeometry(16, 17, 1.2, 64), std(0x262b35, 0.35, 0.8), 0, 0.6, 0); tt.receiveShadow = true; hangarScene.add(tt);
  const ring = mesh(new THREE.TorusGeometry(16.5, 0.18, 8, 96), new THREE.MeshBasicMaterial({ color: 0xffb547 }), 0, 1.22, 0); ring.rotation.x = Math.PI / 2; hangarScene.add(ring);
  for (const [px, pz, col, it] of [[60, 70, 0xfff1dd, 2.1], [-80, 30, 0x9cc7ff, 1.2], [10, -90, 0xffc890, 1.0]]) {
    const s = new THREE.SpotLight(col, it, 0, 0.42, 0.6, 1); s.position.set(px, 140, pz); s.target.position.set(0, 30, 0); hangarScene.add(s, s.target);
    if (it > 2) { s.castShadow = true; s.shadow.mapSize.set(2048, 2048); s.shadow.camera.near = 40; s.shadow.camera.far = 400; s.shadow.bias = -0.0003; SHADOW_LIGHTS.push(s); HG.spot = s; }
  }
  hangarScene.add(new THREE.HemisphereLight(0x8aa4d8, 0x10131a, 0.5));
  hangarScene.add(new THREE.AmbientLight(0x404858, 0.25));
})();
function enterHangar() {
  if (MP.active) mpStop();
  try { document.exitPointerLock(); } catch (_) {}
  camera.near = 0.1; camera.updateProjectionMatrix();
  activeOC = HG.oc; $('labels').textContent = '';
  setSky({ top: 0x05070d, hor: 0x0e1424, bot: 0x05070d, stars: 0.35, halo: 0, disc: 0 });
  hangarScene.environment = envMap('hangar');
  hangarSelect(GAME.rocket.id, true);
  renderHangarUI();
  showMode('hangar');
}
function hangarSelect(id, keepCam) {
  const R = ROCKETS.find(r => r.id === id); GAME.rocket = R;
  if (!R.dest.includes(GAME.dest)) GAME.dest = R.dest[R.dest.length - 1];
  if (HG.model) hangarScene.remove(HG.model.root);
  HG.model = buildRocket(R); HG.model.root.position.y = 1.2 + R.s1.bell; shadowAll(HG.model.root, true, true); hangarScene.add(HG.model.root);
  const H = R.totalLen + R.s1.bell;
  ocPreset(HG.oc, HG.oc.yaw, 0.08, H * 1.3 + 22); HG.oc.target.set(0, H * 0.48, 0);
  if (!keepCam) HG.idle = 0;
  renderHangarUI();
}
function renderHangarUI() {
  const R = GAME.rocket, list = $('rkList');
  if (!list.children.length) {
    for (const r of ROCKETS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'rk' + (r.single ? ' star' : ''); b.setAttribute('role', 'radio'); b.dataset.id = r.id;
      const n = document.createElement('b'); n.textContent = r.name; const s = document.createElement('span'); s.textContent = r.cls;
      b.append(n, s); b.addEventListener('click', () => hangarSelect(r.id)); list.append(b);
    }
    const dl = $('destList');
    for (const [id, name, sub] of [['orbit', 'Orbit', 'Earth'], ['moon', 'Moon', '3 days'], ['mars', 'Mars', '8½ months'], ['proxima', 'Proxima b', '4.2 light-yrs']]) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.id = id;
      b.append(document.createTextNode(name)); const sm = document.createElement('small'); sm.textContent = sub; b.append(sm);
      b.addEventListener('click', () => { GAME.dest = id; renderHangarUI(); }); dl.append(b);
    }
  }
  for (const b of list.children) { b.setAttribute('aria-checked', String(b.dataset.id === R.id)); b.classList.toggle('locked', b.dataset.id === 'seraph' && !starshipReady()); }
  const locked = R.single && !starshipReady();
  setText($('rkBlurb'), R.blurb);
  const st = $('rkStats'); st.textContent = '';
  const reach = R.dest.map(d => ({ orbit: 'Orbit', moon: 'Moon', mars: 'Mars', proxima: 'Proxima b' }[d])).join(' · ');
  for (const [k, v] of [['Height', `${(R.totalLen + R.s1.bell).toFixed(0)} m`], ['Liftoff mass', `${Math.round(R.liftMass / 1000).toLocaleString('en-GB')} t`], [R.single ? 'Top speed' : 'Thrust', R.single ? '1.00 c' : `${(R.s1.Fsl / 1e6).toFixed(1)} MN`], ['Reaches', reach]]) {
    const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; d.append(dt, dd); st.append(d);
  }
  for (const b of $('destList').children) { const ok = R.dest.includes(b.dataset.id); b.disabled = !ok; b.setAttribute('aria-checked', String(b.dataset.id === GAME.dest)); }
  const d = GAME.dest; let note = '';
  if (locked) note = 'Locked. On the Moon or Mars, salvage alien wrecks after raids, then build a plasma reactor and a light-speed drive in the workshop.';
  else if (d === 'proxima') note = 'Jump 4.24 light-years to the nearest star, land on Proxima b and build an outpost under a red sun.' + (colonySummary('proxima') ? ` Your outpost: ${colonySummary('proxima').pop} colonists.` : '');
  else if (d === 'orbit') note = 'Fly to orbit and look down at the Earth. ' + (R.dest.length === 1 ? 'Pick Heron for the Moon, or Condor for Mars.' : '');
  else {
    const s = colonySummary(d), B = BODIES[d];
    note = d === 'moon' ? 'Reach orbit, burn for the Moon, land, then step outside and build a base.' : 'Reach orbit, cruise to Mars, land, then step outside and start a colony.';
    if (s) note += ` Your ${B.base.toLowerCase()}: ${s.pop} colonist${s.pop === 1 ? '' : 's'}, ${s.mods.length} building${s.mods.length === 1 ? '' : 's'}.`;
  }
  setText($('destNote'), note);
  setText($('launchBtn'), locked ? 'Locked' : d === 'orbit' ? 'Launch to orbit' : d === 'moon' ? 'Launch for the Moon' : d === 'mars' ? 'Launch for Mars' : 'Launch for Proxima b');
  $('launchBtn').disabled = locked; $('skipBtn').disabled = locked;
  $('skipBtn').hidden = d === 'orbit';
  const r = SAVE.resume, cb = $('contBtn');
  cb.hidden = !(r && BODIES[r.body]);
  if (!cb.hidden) { const c = SAVE.colonies[r.body], B = BODIES[r.body]; setText($('contLabel'), `Continue: ${B.base}`); setText($('contSub'), `${B.day} ${Math.floor((c && c.sol) || 0) + 1} · ${(c && c.pop) || 0} colonists · ${SAVE.profile.shards} shards${SAVE.savedAt ? ' · saved ' + new Date(SAVE.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`); }
}
$('launchBtn').addEventListener('click', () => {
  audioInit();
  showLoading('Rolling out to the pad…');
  setTimeout(() => { enterLaunch(); hideLoading(); }, 40);
});
$('skipBtn').addEventListener('click', () => { audioInit(); transitionTo(() => enterDescent()); });
$('contBtn').addEventListener('click', () => { audioInit(); continueGame(); });
$('codeBtn').addEventListener('click', () => openSavePanel('import'));
function updateHangar(dt) {
  HG.idle += dt;
  if (ptrs.size === 0 && HG.idle > 1.5 && !RM) HG.oc.yaw += dt * 0.12;
  if (ptrs.size) HG.idle = 0;
  const narrow = VW < 720;
  camera.setViewOffset(VW, VH, narrow ? 0 : -Math.min(200, VW * 0.18), narrow ? VH * 0.2 : 0, VW, VH);
  ocApply(HG.oc, dt, 0.5);
  if (HG.spot) HG.spot.castShadow = shadowsOn();
  GFX.bloomStr = 0.35; drawFrame(hangarScene);
  audioEngine(0, 1, 0);
}

/* ================= modes, overlays ================= */
const UIS = { hangar: 'hangarUI', launch: 'launchUI', transfer: 'transferUI', descent: 'descentUI', surface: 'surfaceUI' };
function showMode(m) {
  if (GAME.mode === 'surface' && m !== 'surface') { saveColony(); try { document.exitPointerLock(); } catch (_) {} }
  GAME.mode = m;
  for (const k in UIS) $(UIS[k]).hidden = k !== m;
  $('visor').hidden = $('cross').hidden = m !== 'surface';
  $('stick').hidden = !(COARSE && (m === 'descent' || m === 'surface'));
  $('landerMenu').hidden = true; $('craftPanel').hidden = true; $('savePanel').hidden = true;
  $('hurt').style.opacity = 0; $('tint').style.opacity = 0; CB.firing = false;
  if (m !== 'surface' && camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  if (m !== 'transfer') $('labels').textContent = '';
  camera.clearViewOffset();
  if (m !== 'surface') { camera.near = 0.1; camera.updateProjectionMatrix(); }
  farGroup.visible = m === 'launch' || m === 'descent' || m === 'surface';
  if (m === 'launch' && SU.earthFar) SU.earthFar.visible = false;
  if (m === 'launch' && SU.starGlow) SU.starGlow.visible = SU.alphaCen.visible = false;
  closeMenu();
  touch.sx = touch.sy = 0;
  renderer.toneMappingExposure = 1.05;
  const restart = $('mRestart'); restart.hidden = !(m === 'launch' || m === 'descent');
  $('mRaids').hidden = m !== 'surface';
  setText(restart, m === 'launch' ? 'Restart launch' : 'Restart landing');
}
let bannerTimer = 0;
function showBanner(kind) {
  const b = $('banner'), acts = $('bActs'); acts.textContent = '';
  const add = (label, fn, go) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn' + (go ? ' go' : ''); x.textContent = label; x.addEventListener('click', () => { hideBanner(); fn(); }); acts.append(x); };
  let eyebrow = '', title = '', body = '', tone = '', stats = null, auto = false;
  const S = LS.S, dname = GAME.dest === 'moon' ? 'the Moon' : 'Mars';
  if (S && GAME.mode === 'launch') stats = [['Top speed', `${S.maxV.toFixed(0)} m/s`], ['Peak g', `${S.maxG.toFixed(1)} g`], ['Max Q', `${(S.maxQ / 1000).toFixed(1)} kPa`]];
  if (kind === 'space') { eyebrow = `${clockStr()} · 100 km`; title = 'You\'re in space'; tone = 'cyan'; auto = true; body = 'You crossed the Kármán line, where the air is too thin to fly on. Try View: Earth or Wide, or drag to look around.'; add('Keep flying', () => {}, true); }
  if (kind === 'orbitDone') { eyebrow = clockStr(); title = 'Orbit achieved'; tone = 'green'; body = `Periapsis ${fmtKm(S.pe)}, apoapsis ${fmtKm(S.ap)}. You're falling around the Earth fast enough to keep missing it. Turn up the warp and watch the planet roll by.`; stats[2] = ['Orbit', `${fmtKm(S.pe)} × ${fmtKm(S.ap)}`]; add('Back to hangar', () => transitionTo(enterHangar)); add('Look around', () => setViewLaunch(3), true); }
  if (kind === 'orbitGo') { eyebrow = clockStr(); title = 'Orbit achieved'; tone = 'green'; body = `Parking orbit ${fmtKm(S.pe)} × ${fmtKm(S.ap)}. When you're ready, fire the transfer burn for ${dname}.`; stats[2] = ['Orbit', `${fmtKm(S.pe)} × ${fmtKm(S.ap)}`]; add('Look around first', () => setViewLaunch(3)); add(GAME.dest === 'moon' ? 'Burn for the Moon' : 'Burn for Mars', startTLI, true); }
  if (kind === 'breakup' || kind === 'crash') {
    title = 'Vehicle lost'; tone = 'red'; eyebrow = `${clockStr()} · peak ${fmtAlt(S.maxH)}`;
    body = kind === 'breakup' ? `Aerodynamic loads tore the rocket apart at ${fmtAlt(S.h)}. In thick air, keep the nose pointed where you're going. Prograde or Autopilot does this for you.` : `The rocket hit the ground at ${(S.impact || 0).toFixed(0)} m/s. ${S.maxH > 100000 ? 'You made it to space first, which still counts.' : 'Climb steeper, and save enough fuel to get above 100 km.'}`;
    add('Back to hangar', () => transitionTo(enterHangar)); add('Try again', enterLaunch, true);
  }
  if (kind === 'landedEarth') { title = 'Touchdown'; tone = 'green'; body = 'You brought it back down gently. Very few rockets can say that.'; add('Back to hangar', () => transitionTo(enterHangar), true); }
  if (kind === 'touchdown') {
    const L = DS.L, B = DS.B; title = `Landed on ${B.id === 'moon' ? 'the Moon' : 'Mars'}`; tone = 'green'; eyebrow = B.id === 'moon' ? 'Gravity 1.62 m/s² · one sixth of Earth' : 'Gravity 3.71 m/s² · about a third of Earth';
    body = 'The engine is off and the dust is settling. Put on your helmet and step outside to start building.';
    stats = [['Touchdown', `${(L.impact || 0).toFixed(1)} m/s`], ['Fuel left', `${Math.ceil(L.fuel / B.lander.fuel * 100)}%`], ['From beacon', `${Math.hypot(L.x, L.z).toFixed(0)} m`]];
    add('Step outside', () => transitionTo(enterSurface), true);
  }
  if (kind === 'landerCrash') {
    const L = DS.L; title = 'Lander lost'; tone = 'red'; body = `You hit the ground at ${(L.impact || 0).toFixed(1)} m/s${L.hsImpact > 2.6 ? ` while drifting ${L.hsImpact.toFixed(1)} m/s` : ''}. Touch down slower than 3.5 m/s, level and with almost no drift. Autoland can fly it for you.`;
    add('Back to hangar', () => transitionTo(enterHangar)); add('Try the landing again', () => transitionTo(enterDescent), true);
  }
  set('bEyebrow', eyebrow); set('bTitle', title); set('bBody', body);
  const dl = $('bStats'); dl.textContent = ''; dl.hidden = !stats;
  if (stats) for (const [k, v] of stats) { const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; d.append(dt, dd); dl.append(d); }
  b.dataset.tone = tone; b.hidden = false;
  clearTimeout(bannerTimer); if (auto) bannerTimer = setTimeout(hideBanner, 9000);
  try { document.exitPointerLock(); } catch (_) {}
}
function hideBanner() { $('banner').hidden = true; clearTimeout(bannerTimer); }
function toast(text, kind) {
  const t = $('toasts'), d = document.createElement('div'); d.className = 'toast' + (kind ? ' ' + kind : ''); d.textContent = text; t.append(d);
  while (t.children.length > 3) t.firstChild.remove();
  setTimeout(() => d.remove(), 4800);
}
function showLoading(text) { const l = $('loading'); l.textContent = text; l.hidden = false; $('fade').classList.add('on'); }
function hideLoading() { $('loading').hidden = true; $('fade').classList.remove('on'); }
let transitioning = false;
function transitionTo(fn) {
  if (transitioning) return; transitioning = true;
  $('fade').classList.add('on');
  setTimeout(() => { try { fn(); } finally { transitioning = false; setTimeout(() => { if ($('loading').hidden) $('fade').classList.remove('on'); }, 60); } }, RM ? 30 : 800);
}
// menu
function closeMenu() { $('menu').hidden = true; }
document.querySelectorAll('.menu-btn').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; syncMute(); syncGfxBtn(); syncRaidBtn(); if (!$('menu').hidden) { try { document.exitPointerLock(); } catch (_) {} } }));
document.addEventListener('pointerdown', e => { if (!$('menu').hidden && !$('menu').contains(e.target) && !e.target.classList.contains('menu-btn')) closeMenu(); });
$('mSound').addEventListener('click', () => { toggleMute(); });
$('mSave').addEventListener('click', () => { closeMenu(); writeSave(false); });
$('mCode').addEventListener('click', () => { closeMenu(); writeSave(true); openSavePanel('export'); });
$('mLoad').addEventListener('click', () => { closeMenu(); openSavePanel('import'); });
$('mGfx').addEventListener('click', () => { const L = ['high', 'medium', 'low']; setGfx(L[(L.indexOf(GFX.level) + 1) % 3]); writeSave(true); });
$('mRaids').addEventListener('click', () => { if (MP.active) return; SAVE.settings.raids = !raidsOn(); if (!raidsOn()) endRaid(false, true); syncRaidBtn(); writeSave(true); toast(raidsOn() ? 'Alien raids are on.' : 'Alien raids are off. Build in peace.'); });
function syncRaidBtn() { setText($('mRaids'), `Alien raids: ${raidsOn() ? 'On' : 'Off'}`); }
$('mRestart').addEventListener('click', () => { closeMenu(); if (GAME.mode === 'launch') enterLaunch(); else if (GAME.mode === 'descent') transitionTo(enterDescent); });
$('mHangar').addEventListener('click', () => { closeMenu(); transitionTo(enterHangar); });

/* ================= input ================= */
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const focused = document.activeElement;
  if (focused && (['INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName) || focused.isContentEditable)) return;
  const ae = document.activeElement, onBtn = ae && ae.tagName === 'BUTTON';
  if ((e.code === 'Space' || e.code === 'Enter') && onBtn) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  const m = GAME.mode;
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (m === 'launch') {
    const S = LS.S;
    switch (e.code) {
      case 'Space': launchPrimary(); break;
      case 'KeyZ': S.thr = 1; syncThr(); break;
      case 'KeyX': S.thr = 0; syncThr(); break;
      case 'KeyP': $('proBtn').click(); break;
      case 'KeyT': toggleAutoLaunch(); break;
      case 'KeyV': setViewLaunch(LS.view + 1); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': setViewLaunch(+e.code.slice(5) - 1); break;
      case 'Period': cycleWarp(1); break;
      case 'Comma': cycleWarp(-1); break;
    }
  } else if (m === 'transfer') {
    if (e.code === 'KeyV') setViewTransfer(TR.view + 1);
  } else if (m === 'descent') {
    if (e.code === 'KeyT') $('dsAuto').click();
    if (e.code === 'KeyZ') setThrDs(1);
    if (e.code === 'KeyX') setThrDs(0);
  } else if (m === 'surface') {
    if (!$('savePanel').hidden) { if (e.code === 'Escape') $('savePanel').hidden = true; return; }
    if (!$('landerMenu').hidden) { if (e.code === 'Escape') $('lmStay').click(); return; }
    if (!$('craftPanel').hidden) { if (e.code === 'Escape' || e.code === 'KeyC') closeCraft(); return; }
    if (!SU.build && /^Digit[1-4]$/.test(e.code)) { equip(WLIST[+e.code.slice(5) - 1]); return; }
    if (e.code === 'KeyQ') { usePower('dash'); return; }
    if (e.code === 'KeyF') { usePower('shield'); return; }
    if (e.code === 'KeyT') { usePower('slow'); return; }
    if (e.code === 'KeyV') { usePower('cloak'); return; }
    if (e.code === 'KeyC') { openCraft(); return; }
    switch (e.code) {
      case 'KeyE': case 'Enter': surfaceAction(); break;
      case 'KeyB': setBuild(!SU.build); break;
      case 'Escape': if (SU.build) setBuild(false); break;
      case 'KeyR': if (SU.build) SU.rot += Math.PI / 8; break;
      case 'BracketRight': if (SU.build) cycleBuild(1); break;
      case 'BracketLeft': if (SU.build) cycleBuild(-1); break;
      case 'KeyX': if (SU.target && SU.target.kind === 'mod') { SU.recycleArmed = SU.target.ref; toast(`Press E to recycle the ${MODMAP[SU.target.ref.m.id].name.toLowerCase()} for half its materials.`); } break;
      case 'KeyG': $('objBtn').click(); break;
      default: if (SU.build && /^Digit[1-8]$/.test(e.code)) selectBuild(MODS[+e.code.slice(5) - 1].id);
    }
  }
}, true);
addEventListener('keyup', e => { keys[e.code] = false; }, true);
addEventListener('blur', () => { for (const k in keys) keys[k] = false; touch.L = touch.R = touch.sx = touch.sy = touch.burn = touch.jump = 0; });
// joystick
(function stick() {
  const el = $('stick'), knob = $('knob'); let id = null, cx = 0, cy = 0;
  el.addEventListener('pointerdown', e => { id = e.pointerId; const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; try { el.setPointerCapture(id); } catch (_) {} move(e); e.preventDefault(); });
  const move = e => { if (e.pointerId !== id) return; let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy), m = 46; if (d > m) { dx *= m / d; dy *= m / d; } knob.style.transform = `translate(${dx}px,${dy}px)`; touch.sx = dx / m; touch.sy = -dy / m; };
  el.addEventListener('pointermove', move);
  const up = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touch.sx = touch.sy = 0; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
})();

/* ================= audio ================= */
let AC = null, nGain, nFilt, master, noiseBuf, muted = false;
try { muted = localStorage.getItem('karman-muted') === '1'; } catch (e) {}
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const len = AC.sampleRate * 2; noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    nFilt = AC.createBiquadFilter(); nFilt.type = 'lowpass'; nFilt.frequency.value = 300;
    nGain = AC.createGain(); nGain.gain.value = 0; master = AC.createGain(); master.gain.value = muted ? 0 : 0.9;
    src.connect(nFilt); nFilt.connect(nGain); nGain.connect(master); master.connect(AC.destination); src.start();
  } catch (e) { AC = null; }
}
function audioEngine(level, atm, q) {
  if (!AC) return;
  let target = level * atm * 0.85;
  if (GAME.mode === 'surface') target = (SF.body === 'moon' ? 0 : 0.05) + (PL.jetting ? 0.3 : 0);
  nGain.gain.setTargetAtTime(target, AC.currentTime, 0.08);
  nFilt.frequency.setTargetAtTime(160 + 650 * level * atm + Math.min(400, q / 80), AC.currentTime, 0.1);
}
function burst(dur, freq, vol) {
  if (!AC || !noiseBuf) return;
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  const fl = AC.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = freq;
  const g = AC.createGain(), t = AC.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(master); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
const clunk = v => burst(0.35, 900, 0.9 * v);
const boom = () => burst(2.2, 260, 1.6);
function syncMute() { const b = $('mSound'); b.textContent = muted ? 'Sound off' : 'Sound on'; b.setAttribute('aria-pressed', String(!muted)); }
function toggleMute() { muted = !muted; try { localStorage.setItem('karman-muted', muted ? '1' : '0'); } catch (e) {} audioInit(); if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, AC.currentTime, 0.05); syncMute(); }

/* ================= MULTIPLAYER ================= */
function mpStorage(key, value) {
  try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (_) {}
  return null;
}
const mpCodeMatch = /^\/play\/([A-Za-z0-9-]+)\/?$/.exec(location.pathname);
const hostConfig = globalThis.SpaceGtaConfig || {};
const nameStorageKey = hostConfig.nameStorageKey || 'space-gta.name';
const mpAccess = mpCodeMatch ? mpCodeMatch[1].replace(/-/g, '').toUpperCase() : (hostConfig.accessCode || 'SPACEGTA');
const mpBase = new URL(hostConfig.multiplayerUrl || '/play/' + mpAccess + '/multiplayer', location.href).href.replace(/\/$/, '');
function mpOpen() {
  $('crewPanel').hidden = false;
  $('crewName').value = mpStorage(nameStorageKey) || '';
  const invited = new URLSearchParams(location.hash.slice(1)).get('room');
  $('crewRoom').value = invited || mpStorage('karman-last-room:' + mpAccess) || '';
  $('crewMessage').textContent = '';
  $('crewName').focus();
}
$('crewBtn').addEventListener('click', mpOpen);
$('crewCancel').addEventListener('click', () => { if (!MP.active) { MP.generation++; if (MP.ws) MP.ws.close(1000, 'Join cancelled.'); } $('crewPanel').hidden = true; $('crewCreate').disabled = $('crewJoin').disabled = false; });
$('crewPanel').addEventListener('keydown', e => e.stopPropagation());
$('crewPanel').addEventListener('keyup', e => e.stopPropagation());
$('crewForm').addEventListener('submit', e => {
  e.preventDefault();
  const room = $('crewRoom').value.trim().replace(/[-\s]/g, '').toUpperCase();
  if (!/^[A-Z2-9]{8}$/.test(room)) { $('crewMessage').textContent = 'Enter the eight-character room code from your friend.'; return; }
  mpJoin(room, false);
});
$('crewCreate').addEventListener('click', () => {
  if (!$('crewForm').reportValidity()) return;
  mpJoin('', false);
});
async function mpJoin(room, reconnect) {
  const generation = ++MP.generation;
  const name = reconnect ? MP.name : $('crewName').value.trim();
  if (!name) { $('crewMessage').textContent = 'Choose a crew name first.'; return; }
  $('crewCreate').disabled = $('crewJoin').disabled = true;
  $('crewMessage').textContent = reconnect ? 'Reconnecting to your crew…' : 'Joining your crew…';
  try {
    const resume = room ? mpStorage('karman-crew:' + mpAccess + ':' + room) : null;
    const body = { protocol: KarmanSim.PROTOCOL, name, ...(room ? { room } : {}), ...(resume ? { resume } : {}) };
    const response = await fetch(mpBase + '/join', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.message || 'Could not join this room.'); error.status = response.status; throw error; }
    if (generation !== MP.generation) return;
    MP.room = data.room; MP.name = name; MP.id = data.playerId;
    mpStorage(nameStorageKey, name);
    mpStorage('karman-crew:' + mpAccess + ':' + data.room, data.resume);
    mpStorage('karman-last-room:' + mpAccess, data.room);
    const ws = new WebSocket(mpBase.replace(/^http/, 'ws'));
    MP.ws = ws;
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'auth', ticket: data.ticket })));
    ws.addEventListener('message', e => {
      if (generation !== MP.generation) return;
      let msg; try { msg = JSON.parse(e.data); } catch (_) { return; }
      if (msg.type === 'welcome') {
        MP.connected = true; MP.retryCount = 0; MP.pending = []; MP.accumulator = 0; MP.moveAt = performance.now(); MP.pred = null; MP.offset = { x: 0, y: 0, z: 0 };
        MP.actionId = Math.max(MP.actionId, msg.actionId);
        MP.seq = msg.world.players[MP.id].seq;
        if (!MP.active) mpEnter(msg.world);
        mpApply(msg.world);
        for (const [id, command] of MP.commands) { if (id <= msg.actionId) MP.commands.delete(id); else ws.send(JSON.stringify(command)); }
        $('crewPanel').hidden = true; $('crewStatus').hidden = false;
        $('crewState').textContent = 'Room ' + MP.room + (MP.paused ? ' · saving unavailable, movement paused' : ' · connected');
        history.replaceState(null, '', '#room=' + MP.room);
      } else if (msg.type === 'snapshot' && MP.active) {
        mpApply(msg.world);
        for (const event of msg.events || []) {
          if (event.type === 'notice') toast(event.text, '');
          if (event.type === 'shot' && event.player !== MP.id) { const w = WEAPONS[event.weapon]; if (w) spawnBeam(V3(...event.from), V3(...event.to), w); }
        }
      } else if (msg.type === 'ack') {
        MP.commands.delete(msg.id);
      } else if (msg.type === 'error') {
        if (msg.id) MP.commands.delete(msg.id);
        $('crewMessage').textContent = msg.message; toast(msg.message, 'bad');
      }
    });
    ws.addEventListener('close', e => {
      if (generation !== MP.generation) return;
      MP.connected = false; CB.firing = false; MP.pending = []; MP.shot = false;
      $('crewState').textContent = e.code === 4001 || e.code === 4003 ? e.reason : 'Connection lost · movement paused';
      if (MP.active && e.code !== 4001 && e.code !== 4003 && e.code !== 4000) mpRetry();
      else if (!MP.active) { $('crewMessage').textContent = e.reason || 'Could not connect to the game server.'; $('crewCreate').disabled = $('crewJoin').disabled = false; }
    });
    ws.addEventListener('error', () => { $('crewMessage').textContent = 'The game server is unavailable. Check your connection.'; });
  } catch (error) {
    if (generation !== MP.generation) return;
    $('crewMessage').textContent = error.message || 'Could not connect to the game server.';
    if (reconnect && MP.active) { $('crewState').textContent = $('crewMessage').textContent; if (![401, 403, 404].includes(error.status)) mpRetry(); }
  } finally {
    if (generation === MP.generation) $('crewCreate').disabled = $('crewJoin').disabled = false;
  }
}
function mpRetry() {
  clearTimeout(MP.retry);
  MP.retry = setTimeout(() => { if (MP.active) mpJoin(MP.room, true); }, Math.min(15000, 1000 * Math.pow(1.5, MP.retryCount++)));
}
function mpEnter(world) {
  MP.solo = SAVE; SAVE = freshSave(); MP.active = true; MP.ready = false; MP.world = world;
  document.body.classList.add('crew-playing');
  document.querySelectorAll('[data-solo-only]').forEach(el => { el.hidden = true; });
  MP.hint = $('lockHint').querySelector('span').textContent;
  $('lockHint').querySelector('span').textContent = 'WASD walk · Space jump · Click shoot · E use · B build · C workshop · 1–4 weapons · Esc frees the mouse';
  SAVE.colonies.moon = world.colony; SAVE.profile.weapons = world.players[MP.id].weapons.slice(); SAVE.profile.wpn = 'pistol';
  GAME.dest = 'moon'; GAME.warp = 1; DS.B = BODIES.moon; SF.built = null;
  buildSurface(DS.B); surfaceSkySetup(DS.B);
  if (DS.lander) surfScene.remove(DS.lander);
  DS.lander = buildLander('moon'); surfScene.add(DS.lander); shadowAll(DS.lander, true, true);
  DS.plume = makePlume(DS.lander.userData.nozzle, true); DS.plume.position.y = DS.lander.userData.bellY; DS.lander.add(DS.plume);
  DS.L = ldNew(DS.B); Object.assign(DS.L, { x: 0, z: 0, y: groundAt(0, 0), vx: 0, vy: 0, vz: 0, alt: 0, landed: true }); DS.done = true;
  DS.lander.position.set(0, DS.L.y, 0); renderColonyStatic(DS.B); enterSurface();
  MP.modules = world.colony.mods.map(m => m.uid).join(','); MP.ready = true;
  for (const id of ['mCode', 'mLoad', 'mRaids', 'mRestart']) $(id).disabled = true;
  $('lmHome').textContent = 'Leave crew and return to hangar';
  toast('Welcome to your Moon crew. Buildings and resources are shared.', 'good');
}
function mpApply(world) {
  if (!MP.ready || !world.players[MP.id]) return;
  MP.world = world; MP.paused = !!world.paused; const p = world.players[MP.id], previousPrediction = MP.pred;
  MP.pending = MP.pending.filter(input => input.seq > p.seq);
  MP.pred = { ...p, weapons: p.weapons.slice() };
  if (!MP.paused) for (const input of MP.pending) KarmanSim.movePlayer(world, MP.pred, input, KarmanSim.STEP);
  const correction = previousPrediction ? Math.hypot(previousPrediction.x - MP.pred.x, previousPrediction.y - MP.pred.y, previousPrediction.z - MP.pred.z) : Infinity;
  if (previousPrediction && correction < 2 && !MP.paused) {
    MP.offset.x += previousPrediction.x - MP.pred.x; MP.offset.y += previousPrediction.y - MP.pred.y; MP.offset.z += previousPrediction.z - MP.pred.z;
  } else {
    MP.offset = { x: 0, y: 0, z: 0 };
    Object.assign(PL, { x: MP.pred.x, y: MP.pred.y, z: MP.pred.z });
  }
  if (!previousPrediction) { PL.yaw = p.yaw; PL.pitch = p.pitch; }
  PL.o2 = p.o2;
  $('crewState').textContent = 'Room ' + MP.room + (MP.paused ? ' · saving unavailable, movement paused' : ' · connected');
  CO = SAVE.colonies.moon = world.colony; SU.rates = world.rates;
  const modules = CO.mods.map(m => m.uid).join(',');
  if (modules !== MP.modules) {
    MP.modules = modules;
    const wanted = new Map(CO.mods.map(m => [m.uid, m]));
    SU.objs = SU.objs.filter(view => { if (wanted.has(view.m.uid)) { view.m = wanted.get(view.m.uid); wanted.delete(view.m.uid); return true; } surfScene.remove(view.obj); mpDisposeGeometry(view.obj); return false; });
    for (const module of wanted.values()) addModuleObj(module, false);
    SU.target = null; SU.recycleArmed = null; rebuildColliders(); renderGoals();
  }
  refreshBuildBar();
  const goals = JSON.stringify(CO.done);
  if (goals !== MP.goals) { MP.goals = goals; renderGoals(); }
  ensureColonists();
  for (const n of SF.nodes) { const data = world.nodes.find(d => d.uid === n.uid); if (data) n.alive = data.readyAt <= world.time; }
  if (p.hp < PW.hp) { CB.hurt = Math.min(1, CB.hurt + (PW.hp - p.hp) / 30); thud(); }
  PW.hp = p.hp; PW.energy = 60; CB.heat = p.heat; CB.over = p.over;
  SAVE.profile.hp = p.hp; SAVE.profile.shards = p.shards;
  const changedWeapons = SAVE.profile.weapons.join(',') !== p.weapons.join(',');
  SAVE.profile.weapons = p.weapons.slice();
  if (changedWeapons) { syncWeaponHud(); if (!$('craftPanel').hidden) renderCraft(); }
  Object.assign(RAID, { state: world.raid.state, t: world.raid.t, seen: world.aliens.some(a => a.target === MP.id) });
  const previous = new Map(CB.aliens.map(a => [a.uid, a]));
  CB.aliens = world.aliens.map(a => {
    let view = previous.get(a.uid);
    if (!view) { view = { ...a, obj: a.type === 'drone' ? buildDrone() : buildCrawler(), ph: 0, dead: false }; view.obj.position.set(a.x, a.y, a.z); CB.group.add(view.obj); }
    Object.assign(view, a); previous.delete(a.uid); return view;
  });
  for (const a of previous.values()) { CB.group.remove(a.obj); burstFx(a.obj.position, 0x4dffb0, 20, 5, .3); mpDisposeGeometry(a.obj); }
  const oldLoot = new Map(CB.shards.map(s => [s.uid, s]));
  CB.shards = world.loot.map(s => { let item = oldLoot.get(s.uid); if (!item) { const obj = mesh(new THREE.OctahedronGeometry(.25, 0), AM.shard); obj.position.set(s.x, groundAt(s.x, s.z) + .8, s.z); CB.group.add(obj); item = { ...s, obj }; } oldLoot.delete(s.uid); return item; });
  for (const item of oldLoot.values()) { CB.group.remove(item.obj); mpDisposeGeometry(item.obj); }
  for (const [id, avatar] of MP.avatars) if (!world.players[id]) { surfScene.remove(avatar); mpDispose(avatar); MP.avatars.delete(id); }
  for (const other of Object.values(world.players)) {
    if (other.id === MP.id) continue;
    if (!MP.avatars.has(other.id)) { const avatar = mpAvatar(other); MP.avatars.set(other.id, avatar); surfScene.add(avatar); }
  }
  $('crewRoster').textContent = Object.values(world.players).map(p => p.name).join(' · ');
}
function mpMove(dt, forward, right, run, menuOpen) {
  const now = performance.now(), elapsed = MP.moveAt ? Math.min(.25, (now - MP.moveAt) / 1000) : dt; MP.moveAt = now;
  if (!MP.connected || MP.paused || !MP.pred) { PL.vx = PL.vz = 0; return; }
  const controls = { forward: menuOpen ? 0 : clamp(forward, -1, 1), right: menuOpen ? 0 : clamp(right, -1, 1), yaw: PL.yaw, pitch: clamp(PL.pitch, -1.5, 1.5), run, jump: !menuOpen && !!(keys.Space || touch.jump), fire: !menuOpen && !SU.build && !!(CB.firing || MP.shot), weapon: VM.cur || 'hands' };
  MP.accumulator = Math.min(.3, MP.accumulator + elapsed);
  while (MP.accumulator >= KarmanSim.STEP) {
    MP.accumulator -= KarmanSim.STEP;
    const input = { ...controls, seq: ++MP.seq };
    MP.shot = false;
    MP.ws.send(JSON.stringify({ type: 'input', ...input })); MP.pending.push(input);
    if (MP.pending.length > 100) { MP.ws.close(4008, 'Server stopped responding.'); break; }
    KarmanSim.movePlayer(MP.world, MP.pred, input, KarmanSim.STEP);
  }
  // Render the fractional step without adding it to the fixed-step prediction history.
  const view = { ...MP.pred };
  if (MP.accumulator > 0) KarmanSim.movePlayer(MP.world, view, { ...controls, seq: MP.seq }, MP.accumulator);
  const decay = Math.exp(-elapsed * 12); MP.offset.x *= decay; MP.offset.y *= decay; MP.offset.z *= decay;
  Object.assign(PL, { x: view.x + MP.offset.x, y: view.y + MP.offset.y, z: view.z + MP.offset.z, vx: MP.pred.vx, vy: MP.pred.vy, vz: MP.pred.vz, onGround: MP.pred.onGround });
  PL.inHab = SU.objs.find(o => o.m.id === 'hab' && Math.hypot(PL.x - o.m.x, PL.z - o.m.z) < 4.7) || null;
  PL.bob += dt * Math.hypot(PL.vx, PL.vz) * 1.9;
}
function mpCommand(action) {
  if (!MP.connected) { toast('Reconnect to the room before taking an action.', 'bad'); return; }
  if (MP.paused) { toast('The room is waiting for saving to recover.', 'bad'); return; }
  if (MP.commands.size >= 8) { toast('Waiting for the server to save your last actions.', ''); return; }
  const command = { type: 'action', id: ++MP.actionId, action }; MP.commands.set(command.id, command); MP.ws.send(JSON.stringify(command));
}
function mpCombat(dt, menuOpen) {
  CB.cool = Math.max(0, CB.cool - dt); CB.heat = Math.max(0, CB.heat - dt * .6); CB.hurt = Math.max(0, CB.hurt - dt * 1.2); CB.tintPulse = Math.max(0, (CB.tintPulse || 0) - dt);
  if (MP.connected && !MP.paused && CB.firing && !menuOpen && !SU.build && VM.cur !== 'hands') fireWeapon();
  for (const a of CB.aliens) { a.ph += dt * 4; a.obj.position.lerp(V3(a.x, a.y + (a.type === 'drone' ? Math.sin(a.ph) * .2 : 0), a.z), Math.min(1, dt * 15)); const target = MP.world.players[a.target]; if (target) a.obj.rotation.y = Math.atan2(target.x - a.x, target.z - a.z); }
  for (const shard of CB.shards) shard.obj.rotation.y += dt * 2;
  for (const [id, avatar] of MP.avatars) { const p = MP.world.players[id]; if (!p) continue; avatar.position.lerp(V3(p.x, p.y, p.z), Math.min(1, dt * 15)); avatar.rotation.y += angDiff(p.yaw, avatar.rotation.y) * Math.min(1, dt * 15); }
  for (const b of CB.beams) if (b.life > 0) { b.life -= dt; const k = Math.max(0, b.life / b.max); b.m.material.opacity = k; b.core.material.opacity = k; b.m.visible = b.life > 0; }
  stepFx(dt);
}
function mpAvatar(p) {
  const g = new THREE.Group(), material = new THREE.MeshStandardMaterial({ color: 0xe8edf5, roughness: .65 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.27, .25, .65, 10), material); body.position.y = .95; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.29, 12, 10), material); head.position.y = 1.52; g.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(.3, 12, 10, Math.PI, Math.PI, .3, 1.6), new THREE.MeshStandardMaterial({ color: 0x1e4067, metalness: .6, roughness: .2 })); visor.position.y = 1.52; g.add(visor);
  for (const side of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .6, 8), material); leg.position.set(side * .14, .3, 0); g.add(leg); const arm = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .55, 8), material); arm.position.set(side * .38, .95, 0); g.add(arm); }
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 80; const context = canvas.getContext('2d'); context.fillStyle = '#e9f3ff'; context.font = '28px sans-serif'; context.textAlign = 'center'; context.fillText(p.name, 256, 48, 490);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false })); label.scale.set(3, .47, 1); label.position.y = 2.2; g.add(label); g.position.set(p.x, p.y, p.z); shadowAll(g, true, true); return g;
}
function mpDisposeGeometry(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
function mpDispose(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
function mpStop() {
  if (MP.active && GAME.mode === 'surface') { try { document.exitPointerLock(); } catch (_) {} GAME.mode = 'hangar'; }
  MP.generation++; MP.active = MP.connected = MP.ready = false; clearTimeout(MP.retry);
  if (MP.ws) MP.ws.close(1000, 'Left room.'); MP.ws = null;
  for (const avatar of MP.avatars.values()) { surfScene.remove(avatar); mpDispose(avatar); } MP.avatars.clear();
  MP.pending = []; MP.commands.clear(); MP.seq = MP.actionId = 0; MP.pred = MP.world = null; CB.firing = false;
  if (MP.solo) SAVE = MP.solo; MP.solo = null; SF.built = null;
  for (const id of ['mCode', 'mLoad', 'mRaids', 'mRestart']) $(id).disabled = false;
  document.body.classList.remove('crew-playing');
  document.querySelectorAll('[data-solo-only]').forEach(el => { el.hidden = false; });
  if (MP.hint) $('lockHint').querySelector('span').textContent = MP.hint;
  $('lmHome').textContent = 'Fly home to Earth'; $('crewStatus').hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
}
$('crewLeave').addEventListener('click', () => { mpStop(); enterHangar(); });
$('crewInvite').addEventListener('click', async () => {
  const invite = location.origin + location.pathname + '#room=' + MP.room;
  try { await navigator.clipboard.writeText(invite); toast('Crew invite copied.', 'good'); }
  catch (_) { toast('Room ' + MP.room + '. Copy this page URL to invite your crew.', ''); }
});
if (new URLSearchParams(location.hash.slice(1)).has('room')) $('crewBtn').textContent = 'Join your friend’s Moon crew';
addEventListener('blur', () => { for (const key in keys) keys[key] = false; CB.firing = false; touch.sx = touch.sy = touch.jump = 0; });

/* ================= loop ================= */
let lastT = performance.now(), errShown = false;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000)); lastT = now;
  try {
    switch (GAME.mode) {
      case 'hangar': updateHangar(dt); break;
      case 'launch': updateLaunch(dt); renderLaunch(dt); break;
      case 'transfer': updateTransfer(dt); renderTransfer(dt); break;
      case 'descent': updateDescent(dt); renderDescent(dt); break;
      case 'surface': updateSurface(dt); renderSurface(dt); break;
    }
  } catch (err) { if (!errShown) { errShown = true; console.error(err); } }
  requestAnimationFrame(frame);
}
gfxInit();
setGfx(GFX.level);
syncMute();
GAME.rocket = ROCKETS[2]; GAME.dest = 'moon';
enterHangar();
requestAnimationFrame(frame);
})();
