import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { buildGame, clientDirectory } from "../scripts/assets.mjs";
import { FileRoomStore } from "../src/server/file-store.js";
import { createStandaloneServer } from "../src/server/standalone.js";
import { PROTOCOL } from "../src/simulation.js";

it("serves an independent game and persists joins across local server restarts", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "space-gta-host-")),
    assets = join(temporary, "assets"),
    directory = join(temporary, "rooms");
  buildGame(clientDirectory, assets, "karman-line");
  const options = {
    store: new FileRoomStore(directory),
    assetsDirectory: assets,
    origins: ["http://localhost"]
  };
  let service = createStandaloneServer(options);
  async function listen() {
    await new Promise<void>((resolve) =>
      service.server.listen(0, "127.0.0.1", resolve)
    );
    return `http://127.0.0.1:${(service.server.address() as AddressInfo).port}`;
  }
  try {
    let base = await listen();
    const page = await fetch(base);
    expect(page.url).toBe(base + "/play/SPACEGTA");
    const html = await page.text();
    expect(html).toContain("Space GTA");
    expect(html).not.toContain("session.");
    const asset = /src="(assets\/karman-line\/game\.[a-f0-9]{8}\.js)"/.exec(
      html
    )![1];
    expect((await fetch(base + "/play/" + asset)).status).toBe(200);
    expect((await fetch(base + "/play/WRONGAAA")).status).toBe(404);
    expect(
      (await fetch(base + "/play/assets/karman-line/..%2F..%2Fpackage.json"))
        .status
    ).toBe(404);
    const endpoint = "/play/SPACEGTA/multiplayer/join";
    const post = (body: unknown) => ({
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const response = await fetch(
      base + endpoint,
      post({ protocol: PROTOCOL, name: "Ada" })
    );
    expect(response.status).toBe(200);
    const first = await response.json();
    await service.close();
    service = createStandaloneServer({
      ...options,
      store: new FileRoomStore(directory)
    });
    base = await listen();
    const again = await fetch(
      base + endpoint,
      post({
        protocol: PROTOCOL,
        name: "Ada",
        room: first.room,
        resume: first.resume
      })
    );
    expect(again.status).toBe(200);
    expect((await again.json()).playerId).toBe(first.playerId);
  } finally {
    await service.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
