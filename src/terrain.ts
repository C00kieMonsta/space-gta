// The Moon height field and rock colliders use the same rules on every device.
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ss = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const PERM = (() => {
  const r = mulberry(91),
    a = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  return p;
})();
function n3(x: number, y: number, z: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  let u = x - xi,
    v = y - yi,
    w = z - zi;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  w = w * w * (3 - 2 * w);
  const X = xi & 255,
    Y = yi & 255,
    Z = zi & 255,
    P = PERM;
  const A = P[X] + Y,
    B = P[X + 1] + Y;
  const AA = P[A] + Z,
    AB = P[A + 1] + Z,
    BA = P[B] + Z,
    BB = P[B + 1] + Z;
  const x1 = P[AA] + (P[BA] - P[AA]) * u,
    x2 = P[AB] + (P[BB] - P[AB]) * u;
  const x3 = P[AA + 1] + (P[BA + 1] - P[AA + 1]) * u,
    x4 = P[AB + 1] + (P[BB + 1] - P[AB + 1]) * u;
  const y1 = x1 + (x2 - x1) * v,
    y2 = x3 + (x4 - x3) * v;
  return (y1 + (y2 - y1) * w) / 255;
}
function n2(x: number, y: number) {
  return n3(x, y, 0.37);
}
function fbm2(x: number, y: number, o: number) {
  let s = 0,
    a = 0.5,
    f = 1,
    n = 0;
  for (let i = 0; i < o; i++) {
    s += a * n3(x * f, y * f, 0.37 + i * 7.1);
    n += a;
    f *= 2.03;
    a *= 0.5;
  }
  return s / n;
}
function makeHeightFn(body: string) {
  const r = mulberry(body === "moon" ? 77 : 313),
    craters: number[][] = [];
  for (let i = 0; i < (body === "moon" ? 110 : 45); i++) {
    const rad =
      body === "moon"
        ? 4 + Math.pow(r(), 2.4) * 120
        : 6 + Math.pow(r(), 2.6) * 90;
    const ang = r() * Math.PI * 2,
      dist = 140 + r() * 1150;
    craters.push([
      Math.cos(ang) * dist,
      Math.sin(ang) * dist,
      rad,
      rad * (0.18 + r() * 0.08)
    ]);
  }
  for (let i = 0; i < 26; i++) {
    const ang = r() * Math.PI * 2,
      dist = 50 + r() * 250,
      rad = 1.5 + r() * 5;
    craters.push([Math.cos(ang) * dist, Math.sin(ang) * dist, rad, rad * 0.2]);
  }
  return (x: number, z: number) => {
    const rr = Math.hypot(x, z);
    let h;
    if (body === "proxima") {
      h =
        (fbm2(x / 420 + 2, z / 420, 4) - 0.5) * 30 +
        (fbm2(x / 60, z / 60, 3) - 0.5) * 3 +
        (n2(x / 8, z / 8) - 0.5) * 0.4;
      const sp = 1 - Math.abs(fbm2(x / 160 + 9, z / 160, 3) - 0.5) * 2;
      h += Math.pow(Math.max(0, sp - 0.72) / 0.28, 2) * 55 * ss(220, 500, rr);
      h += ss(1050, 1550, rr) * 160;
      return h * ss(28, 120, rr);
    } else if (body === "moon") {
      h =
        (fbm2(x / 600 + 3, z / 600, 4) - 0.5) * 46 +
        (fbm2(x / 90, z / 90, 3) - 0.5) * 7 +
        (n2(x / 9, z / 9) - 0.5) * 0.7;
      h += ss(900, 1500, rr) * (150 + (fbm2(x / 240, z / 240, 3) - 0.5) * 200);
    } else {
      const dune =
        Math.sin((x * 0.8 + z * 0.6) / 22 + fbm2(x / 120, z / 120, 2) * 6) *
        1.3;
      h =
        (fbm2(x / 500 + 9, z / 500, 4) - 0.5) * 34 +
        (fbm2(x / 70, z / 70, 3) - 0.5) * 5 +
        dune * ss(60, 300, rr) +
        (n2(x / 8, z / 8) - 0.5) * 0.6;
      const mesa = ss(0.52, 0.58, fbm2(x / 380 + 40, z / 380, 3)) * 90;
      h += mesa * ss(500, 900, rr) + ss(1000, 1550, rr) * 140;
    }
    for (const c of craters) {
      const dx = x - c[0],
        dz = z - c[1];
      if (Math.abs(dx) > c[2] * 1.7 || Math.abs(dz) > c[2] * 1.7) continue;
      const d = Math.hypot(dx, dz) / c[2];
      if (d < 1) h += c[3] * (d * d - 1) * 1.1;
      if (d < 1.7) h += c[3] * 0.38 * Math.exp(-Math.pow((d - 1) / 0.22, 2));
    }
    const f = ss(28, 120, rr);
    return h * f;
  };
}

const warp = (u: number) => (1600 * (u + 6 * u * u * u)) / 7;
function unwarp(x: number) {
  let u = clamp(x / 1600, -1, 1);
  for (let i = 0; i < 6; i++)
    u -= ((u + 6 * u * u * u) / 7 - x / 1600) / ((1 + 18 * u * u) / 7);
  return clamp(u, -1, 1);
}
const rawHeight = makeHeightFn("moon");
let heights: Float32Array | undefined;
export function ground(x: number, z: number): number {
  const n = 400,
    w = n + 1;
  if (!heights) {
    heights = new Float32Array(w * w);
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++)
        heights[j * w + i] = rawHeight(
          warp((i / n) * 2 - 1),
          warp((j / n) * 2 - 1)
        );
  }
  const fu = ((unwarp(x) + 1) * n) / 2,
    fv = ((unwarp(z) + 1) * n) / 2,
    i = clamp(Math.floor(fu), 0, n - 1),
    j = clamp(Math.floor(fv), 0, n - 1);
  const xa = warp((i / n) * 2 - 1),
    xb = warp(((i + 1) / n) * 2 - 1),
    za = warp((j / n) * 2 - 1),
    zb = warp(((j + 1) / n) * 2 - 1);
  const u = clamp((x - xa) / (xb - xa), 0, 1),
    v = clamp((z - za) / (zb - za), 0, 1),
    a = heights[j * w + i],
    b = heights[j * w + i + 1],
    c = heights[(j + 1) * w + i],
    d = heights[(j + 1) * w + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const rocks: { x: number; z: number; r: number }[] = [];
const rockRandom = mulberry(5);
for (let i = 0; i < 450; i++) {
  const r = rockRandom;
  let x: number, z: number, rr: number;
  do {
    const a = r() * Math.PI * 2;
    rr = 12 + Math.pow(r(), 1.4) * 1300;
    x = Math.cos(a) * rr;
    z = Math.sin(a) * rr;
  } while (Math.hypot(x, z) < 14);
  const s = (0.15 + Math.pow(r(), 3) * 2.2) * (rr > 400 ? 1.6 : 1);
  for (let k = 0; k < 6; k++) r();
  if (s > 0.9 && rr < 450) rocks.push({ x, z, r: s * 0.9 });
}
export { mulberry };
