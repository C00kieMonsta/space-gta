import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../client/game.js", import.meta.url),
  "utf8"
);
// Run the browser's shipped pose sampler without WebGL or a render clock.
const sample = new Function(
  source.slice(
    source.indexOf("const clamp ="),
    source.indexOf("const soundSpeed =")
  ) +
    source.slice(
      source.indexOf("function sampleRemotePose("),
      source.indexOf("function mpRenderClock(")
    ) +
    ";return sampleRemotePose;"
)();
const pose = (x: number, yaw = 0, extras = {}) => ({
  x,
  y: 0,
  z: 0,
  yaw,
  pitch: 0,
  vx: 5.2,
  vy: 0,
  vz: 0,
  onGround: true,
  ...extras
});
const frame = (time: number, p: ReturnType<typeof pose>) => ({
  time,
  players: { p },
  aliens: [{ uid: 1, ...p }]
});

describe("remote movement presentation", () => {
  it("interpolates positions and takes the short turn across the yaw boundary", () => {
    const frames = [
      frame(1, pose(0, Math.PI - 0.1)),
      frame(1.1, pose(0.52, -Math.PI + 0.1))
    ];
    const p = sample(frames, 1.05, "p");
    expect(p.x).toBeCloseTo(0.26);
    expect(Math.cos(p.yaw)).toBeCloseTo(-1);
    expect(sample(frames, 1.05, 1, "aliens").x).toBeCloseTo(0.26);
  });
  it("bounds extrapolation during packet loss and keeps grounded feet on the surface", () => {
    const frames = [frame(1, pose(2, 0, { vy: -3 }))];
    expect(sample(frames, 1.05, "p").x).toBeCloseTo(2.26);
    expect(sample(frames, 5, "p").x).toBeCloseTo(2.52);
    expect(sample(frames, 5, "p").y).toBe(0);
    expect(frames[0].players.p.x).toBe(2);
  });
  it("snaps respawns instead of animating travel through terrain", () => {
    const frames = [frame(1, pose(0)), frame(1.05, pose(100, 0, { vx: 0 }))];
    expect(sample(frames, 1.025, "p").x).toBe(0);
    expect(sample(frames, 1.05, "p").x).toBe(100);
  });
  it("handles new crew, missing players, and duplicate save snapshots", () => {
    const frames = [frame(1, pose(0)), frame(1, pose(0.1))];
    expect(sample(frames, 0.9, "p").x).toBe(0);
    expect(sample(frames, 1, "p").x).toBe(0.1);
    expect(sample(frames, 1, "missing")).toBeNull();
    expect(sample([], 1, "p")).toBeNull();
  });
});
