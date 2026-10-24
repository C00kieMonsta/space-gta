import { watch } from "node:fs";
import { spawn } from "node:child_process";
import { context } from "esbuild";
import { buildGame, clientDirectory } from "./assets.mjs";

const rebuildClient = () =>
  buildGame(clientDirectory, "dist/game", "karman-line");
rebuildClient();
const bundle = await context({
  entryPoints: ["src/dev.ts"],
  outfile: "dev-dist/dev.cjs",
  bundle: true,
  packages: "external",
  platform: "node",
  target: "node22",
  format: "cjs"
});
await bundle.rebuild();
await bundle.watch();
const server = spawn(process.execPath, ["--watch", "dev-dist/dev.cjs"], {
  stdio: "inherit"
});
let pending;
const assets = watch(clientDirectory, { recursive: true }, () => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    try {
      rebuildClient();
      console.log("Game assets rebuilt. Refresh your browser.");
    } catch (error) {
      console.error(error);
    }
  }, 100);
});
let stopping = false;
async function stop(signal) {
  if (stopping) return;
  stopping = true;
  clearTimeout(pending);
  assets.close();
  server.kill(signal);
  await bundle.dispose();
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void stop(signal);
  });
server.on("exit", async (code) => {
  await stop("SIGTERM");
  process.exitCode = code || 0;
});
