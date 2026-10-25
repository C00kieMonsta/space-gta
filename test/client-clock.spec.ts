import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as simulation from "../src/simulation.js";

// Exercise the shipped browser function with a controlled render clock, without a GPU.
const source = readFileSync(
  new URL("../client/game.js", import.meta.url),
  "utf8"
);
const movement = source.slice(
  source.indexOf("function mpMove("),
  source.indexOf("function mpCommand(")
);
describe("browser input clock", () => {
  for (const fps of [10, 30, 60])
    it(`keeps the 20 Hz movement rate at ${fps} FPS`, () => {
      let now = 1000;
      const world = simulation.createWorld(),
        player = simulation.createPlayer("p", "Ada", 0),
        authoritative = structuredClone(player),
        sent: any[] = [];
      const MP = {
        connected: true,
        paused: false,
        pred: player,
        world,
        moveAt: now,
        accumulator: 0,
        offset: { x: 0, y: 0, z: 0 },
        pending: [],
        seq: 0,
        shot: false,
        ws: {
          send(s: string) {
            sent.push(JSON.parse(s));
          },
          close() {
            throw Error("Unexpected overflow");
          }
        }
      };
      const PL = { ...player, bob: 0 };
      const move = new Function(
        "MP",
        "PL",
        "KarmanSim",
        "performance",
        "keys",
        "touch",
        "CB",
        "SU",
        "VM",
        "clamp",
        "aimAssistOn",
        movement + ";return mpMove;"
      )(
        MP,
        PL,
        simulation,
        { now: () => now },
        {},
        { jump: false },
        { firing: false },
        { build: false, objs: [] },
        { cur: "pistol" },
        (v: number, a: number, b: number) => Math.min(b, Math.max(a, v)),
        () => true
      );
      for (let frame = 0; frame < fps * 10; frame++) {
        now += 1000 / fps;
        move(Math.min(0.05, 1 / fps), 1, 0, false, false);
        for (const input of sent.splice(0))
          simulation.movePlayer(world, authoritative, input, simulation.STEP);
        MP.pending = [];
      }
      expect(MP.seq).toBeGreaterThanOrEqual(199);
      expect(MP.seq).toBeLessThanOrEqual(200);
      expect(authoritative.x).toBeCloseTo(player.x, 10);
      expect(authoritative.z).toBeCloseTo(player.z, 10);
    });
});
