import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const server = await import("@space-gta/game/server");
const simulation = await import("@space-gta/game/simulation");
assert.equal(typeof server.Rooms, "function");
assert.equal(
  typeof require("@space-gta/game/server").createMultiplayerServer,
  "function"
);
assert.deepEqual(
  simulation.createWorld(),
  require("@space-gta/game/simulation").createWorld()
);
console.log("ESM and CommonJS package consumers passed.");
