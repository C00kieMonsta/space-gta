import { cpSync, writeFileSync } from "node:fs";

// Node16/NodeNext consumers need declarations with the same module format as the runtime.
cpSync("dist/types", "dist/types-cjs", { recursive: true });
writeFileSync(
  "dist/types-cjs/package.json",
  JSON.stringify({ type: "commonjs" }) + "\n"
);
