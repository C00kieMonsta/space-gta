# Architecture

The browser is a Three.js r128 game. Solo flight and colony state are stored in
the player's browser. Multiplayer starts on the Moon and keeps solo progress
separate. `src/simulation.ts` is bundled into both the browser's `KarmanSim`
global and the server package. Terrain uses the same 400-segment ground sampling
and 450 deterministic rock colliders on every device.

The server runs at 20 Hz and emits snapshots at 10 Hz. Every input sequence
represents one fixed movement step. Per-player queues preserve packet order, use
bounded unused movement credit to catch up after batching, and reconnect if a
queue fills. The client removes acknowledged inputs, replays the rest, and
renders a fractional step between updates. Its input clock is independent of
the render frame rate. Small corrections are smoothed. Large corrections snap.

`Rooms` receives a `RoomStore` and an asynchronous access-code authorization
function. A successful join returns a short-lived, one-use WebSocket ticket and
an opaque resume token. Only a hash of the resume token is stored in a room.
Four saved identities can belong to a room. A second connection for an identity
replaces the first. Messages from replaced peers cannot control that astronaut.

Building, collection, recycling, and crafting are serialized per room and saved
before acknowledgement. Physics and production keep running during storage
writes. The commit merges only the action's effects into the live world.
Building IDs are reserved before saving so raids cannot reuse them. Other world
state is checkpointed every five seconds and at shutdown. A failed checkpoint
pauses the server and client prediction until storage recovers. Empty rooms pause
and unload after one minute.

`FileRoomStore` writes local JSON files through temporary files and atomic
replacement. Hosts can supply another store. One process must own a room;
multiple instances require a room-ownership scheme before horizontal scaling.

The browser, asset slug, solo save keys, world v1, and existing protocol remain
compatible with the original Kármán Line host. The public repo contains no host
account system, player session reporting, or cloud deployment credentials.
