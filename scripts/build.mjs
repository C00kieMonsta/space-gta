import { build } from "esbuild";
import { buildGame, clientDirectory } from "./assets.mjs";

const built = buildGame(clientDirectory, "dist/game", "karman-line");
console.log(`Game: ${built.files.length} hashed assets`);
for (const format of ["esm", "cjs"]) {
  await build({
    entryPoints: {
      server: "src/server/index.ts",
      simulation: "src/simulation.ts"
    },
    outdir: "dist",
    outExtension: { ".js": format === "esm" ? ".js" : ".cjs" },
    bundle: true,
    packages: "external",
    platform: "node",
    target: "node22",
    format,
    sourcemap: true
  });
}
await build({
  entryPoints: ["src/dev.ts"],
  outfile: "dist/dev.cjs",
  bundle: true,
  packages: "external",
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true
});
