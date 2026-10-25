# Space GTA

[![CI](https://github.com/C00kieMonsta/space-gta/actions/workflows/ci.yml/badge.svg)](https://github.com/C00kieMonsta/space-gta/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A browser space game. Pick a rocket, reach orbit, land on the Moon or Mars, and
build a colony. Invite friends into a shared Moon base and defend it from alien
raids. Keyboard, mouse, and touch controls are supported.

Originally called **Kármán Line**. The old asset slug and browser save keys remain
stable so existing players keep their progress when a host upgrades.

## Run locally

Use Node.js 22 and pnpm 10. The exact toolchain is in `.nvmrc` and `package.json`.

```sh
git clone https://github.com/C00kieMonsta/space-gta.git
cd space-gta
corepack enable
pnpm install
pnpm dev
```

Open **http://localhost:3000**. This starts the game and multiplayer server.
There is no AWS, account, or private website dependency. Client edits rebuild the
assets; refresh the browser to see them. Server edits restart the local process.

For multiplayer, choose **Play with friends**, enter a crew name, and create a room.
Open the invite in another browser profile or private window to join as a second
astronaut. Tabs in the same browser profile resume the same crew identity.

Room saves live in `.data/rooms/` and survive server restarts. Solo progress stays
in browser storage. Both are excluded from Git. Delete `.data/rooms/` while the
server is stopped to reset local rooms.

## What is playable

- Solo: rocket selection, launch, orbit, transfers, landings, colony building,
  spacecraft upgrades, weapons, and powers.
- Multiplayer: up to four saved crew identities per room, shared buildings,
  materials, deposits, production, and alien raids. Weapons and shards belong to
  each astronaut. Launches and powers remain solo features.

Flight assist is on by default. Start the engine, then let autopilot handle the
launch. Autoland handles descent. You can take over with the flight controls or
turn assist off in the hangar. **Practice landing** skips launch and transfer;
colony progress from practice is saved too.

The first launch, landing, and surface visit each show a short field guide.
Solo play pauses while the guide is open. Reopen it with **H** or **Guide**.
The surface HUD shows the next colony objective. **Goals** opens the full
checklist, and **More** expands colony resources on small screens.

| Control       | Action                                |
| ------------- | ------------------------------------- |
| WASD / arrows | Walk or steer                         |
| Mouse         | Look, after clicking the surface view |
| Shift / Space | Sprint / jump                         |
| Click / E     | Shoot / use                           |
| B / C         | Build / workshop                      |
| H / G         | Field guide / colony goals            |
| 1-4 / Escape  | Select weapon / release the mouse     |

Touch controls appear on mobile devices, including a sprint toggle. Walking speed
is 5.2 m/s on the Moon. Sprinting reaches 9.36 m/s in solo and multiplayer.
The surface HUD includes a compass, speed readout, and desktop radar for nearby
crew, deposits, buildings, and the lander. The crew panel shows health, distance,
and connection latency. The game also shows controls for each flight phase.

Sound includes suit breathing, terrain and habitat footsteps, layered engine
rumble, and positional crew weapon effects. Adjust volume or mute sound in Settings.

## Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development loop, tests, and pull
requests. Bugs and feature ideas belong in [Issues](https://github.com/C00kieMonsta/space-gta/issues).
Good first contributions include UI improvements, accessibility, mobile controls,
game balance, and focused multiplayer regression cases.

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
```

Browser network tests disable drawing to exercise the real client protocol without
depending on GPU speed. Test visual changes manually with desktop and touch input.

## Host it

```sh
pnpm build
pnpm start
```

The server listens on `127.0.0.1:3000`. `PORT`, `HOST`, `SPACE_GTA_ORIGINS`, and
`SPACE_GTA_DATA_DIR` can be set in the environment or an ignored `.env` file.
For access from another device, set `HOST=0.0.0.0` and add the exact browser origin,
such as `http://192.168.1.20:3000`, to the comma-separated `SPACE_GTA_ORIGINS`.
Use HTTPS and a reverse proxy for an internet-facing deployment.

The game can also be embedded in an existing website. A release contains a
versioned package with the browser source, asset builder, shared simulation, and
room server. [Host integration](docs/hosting.md) explains the package exports and
how to keep access checks, session tracking, and production storage in the host.

## Source map

| Path                                  | Purpose                                                      |
| ------------------------------------- | ------------------------------------------------------------ |
| `client/`                             | Browser game, styles, vendored Three.js, and fonts           |
| `src/simulation.ts`, `src/terrain.ts` | Shared authoritative simulation and prediction               |
| `src/server/`                         | Rooms, WebSocket transport, and local persistence            |
| `src/dev.ts`, `scripts/`              | Local server, asset hashing, and package builds              |
| `test/`                               | Simulation, persistence, transport, build, and browser tests |

## License

[MIT](LICENSE). Vendored Three.js and fonts retain the licenses listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
