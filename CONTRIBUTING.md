# Contributing to Space GTA

Fork the repository, create a branch, and open a pull request against `main`.
Include the problem, the resulting behavior, and how you checked it. For changes
to appearance or controls, add a screenshot or short recording and test touch
input as well as keyboard and mouse.

## Development

```sh
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Multiplayer works with the local file store.
Two tabs in one profile share an identity. Use another profile or a private window
to test two players. Progress in `.data/` is local and must not be committed.

## Checks

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
```

`pnpm check` runs TypeScript, lint, formatting, unit and transport tests, and builds
the package. `pnpm test:browser` starts a separate local server on port 3100.
Set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome for local testing.

Add regression coverage for bugs involving shared resources, input order,
reconnects, or saved rooms. Keep tests focused on observable behavior. Do not edit
vendored Three.js or fonts to make a game change. Preserve their license notices.

The browser game keeps its existing compact layout. Other source files and docs
use Prettier. `pnpm format` formats those files without rewriting the browser game.

## Multiplayer rules

The server owns the world. Send input and validated actions, never client-chosen
resource totals, damage, or positions. Movement prediction uses the same fixed
step as the server. Changes to the wire contract require updating `PROTOCOL` and
checking reconnect behavior. Keep persisted world v1 data compatible, or provide
an explicit migration and regression test.

Read [the architecture notes](docs/architecture.md) before changing the simulation.

## Releases

The maintainer bumps `package.json`, runs the checks, commits the version, and
pushes a matching tag such as `v0.1.0`. The release workflow verifies the version,
runs tests, and attaches `space-gta-game-<version>.tgz` to the GitHub release.
No npm account or npm token is required. Website hosts update their pinned
dependency when they choose to adopt a release.

Contributions are accepted under the repository's MIT license. Keep changes
focused and discuss large changes in an issue before starting them.
