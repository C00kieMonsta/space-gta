import { describe, expect, it } from "vitest";
import {
  assistAimDirection,
  createPlayer,
  createWorld,
  idleInput,
  raySphere,
  shotDirection,
  stepWorld,
  type AimTarget
} from "../src/simulation.js";
import { MessageSchema } from "../src/server/rooms.js";

const origin = [0, 0, 0],
  forward = [0, 0, -1];
const target = (x = 3, z = -20, extras = {}): AimTarget => ({
  x,
  y: 0,
  z,
  r: 0.6,
  hp: 100,
  ...extras
});
const clear = () => true;

describe("aim assistance", () => {
  it("corrects a near miss without changing the supplied view direction", () => {
    const alien = target(),
      result = assistAimDirection(origin, forward, [alien], 150, clear);
    expect(
      raySphere(origin, forward, [alien.x, alien.y, alien.z], alien.r)
    ).toBeNull();
    expect(
      raySphere(origin, result, [alien.x, alien.y, alien.z], alien.r)
    ).not.toBeNull();
    expect(forward).toEqual([0, 0, -1]);
    expect(Math.hypot(...result)).toBeCloseTo(1);
  });

  it("prefers a direct hit and otherwise the target closest to the crosshair", () => {
    const near = target(2, -10),
      centered = target(1, -30);
    const result = assistAimDirection(
      origin,
      forward,
      [near, centered],
      150,
      clear
    );
    expect(result[0] / -result[2]).toBeCloseTo(1 / 30);
    expect(
      assistAimDirection(origin, forward, [near, target(0)], 150, clear)
    ).toEqual(forward);
  });

  it("ignores targets outside the cone, behind the player, dead or out of range", () => {
    for (const alien of [
      target(10),
      target(0, 20),
      target(1, -200),
      target(1, -20, { dead: true }),
      target(1, -20, { hp: 0 })
    ]) {
      expect(assistAimDirection(origin, forward, [alien], 150, clear)).toEqual(
        forward
      );
    }
  });

  it("does not acquire targets through cover and can choose a visible alternative", () => {
    expect(
      assistAimDirection(origin, forward, [target()], 150, () => false)
    ).toEqual(forward);
    const result = assistAimDirection(
      origin,
      forward,
      [target(1), target(-3)],
      150,
      (direction) => direction[0] < 0
    );
    expect(result[0]).toBeLessThan(0);
  });

  it("accepts an optional boolean preference without relaxing input validation", () => {
    expect(
      MessageSchema.safeParse({
        type: "input",
        ...idleInput(),
        aimAssist: false
      }).success
    ).toBe(true);
    const legacy = idleInput();
    delete legacy.aimAssist;
    expect(MessageSchema.safeParse({ type: "input", ...legacy }).success).toBe(
      true
    );
    expect(
      MessageSchema.safeParse({ type: "input", ...legacy, aimAssist: "on" })
        .success
    ).toBe(false);
  });

  for (const enabled of [true, false])
    it(`applies the preference to authoritative multiplayer damage (${enabled})`, () => {
      const world = createWorld(),
        player = createPlayer("p", "Ada", 0);
      player.x = 0;
      player.y = 40;
      player.z = 9;
      world.players.p = player;
      world.aliens = [
        {
          uid: 99,
          type: "drone",
          x: 3,
          y: 41.65,
          z: -20,
          r: 0.6,
          hp: 100,
          cool: 10,
          target: null
        }
      ];
      stepWorld(
        world,
        new Map([
          [
            player.id,
            { ...idleInput(), seq: 1, fire: true, aimAssist: enabled }
          ]
        ])
      );
      expect(world.aliens[0].hp).toBe(enabled ? 82 : 100);
      expect(player.yaw).toBe(0);
      expect(player.pitch).toBe(0);
    });

  it("keeps authoritative aim behind buildings and uses assist by default", () => {
    const world = createWorld(),
      player = createPlayer("p", "Ada", 0);
    player.x = 0;
    player.y = 0;
    player.z = 9;
    world.aliens = [
      {
        uid: 99,
        type: "drone",
        x: 2,
        y: 1.65,
        z: -14,
        r: 0.6,
        hp: 100,
        cool: 10,
        target: null
      }
    ];
    expect(shotDirection(world, player, "pistol")[0]).toBeGreaterThan(0);
    world.colony.mods.push({ uid: 100, id: "hab", x: 0, z: 0, rot: 0, fy: 0 });
    expect(shotDirection(world, player, "pistol")).toEqual(
      shotDirection(world, player, "pistol", false)
    );
  });
});
