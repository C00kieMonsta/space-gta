import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { FileRoomStore } from "./server/file-store.js";
import { createStandaloneServer } from "./server/standalone.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const port = Number(process.env.PORT || 3000),
  host = process.env.HOST || "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535.");
const origins = (
  process.env.SPACE_GTA_ORIGINS ||
  `http://localhost:${port},http://127.0.0.1:${port}`
)
  .split(",")
  .map((s) => new URL(s.trim()).origin);
const service = createStandaloneServer({
  store: new FileRoomStore(process.env.SPACE_GTA_DATA_DIR || ".data/rooms"),
  assetsDirectory: resolve("dist/game"),
  origins
});
service.server.listen(port, host, () =>
  console.log(`Space GTA: http://${host}:${port}/play/SPACEGTA`)
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    service
      .close()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  });
