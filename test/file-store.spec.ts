import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileRoomStore } from "../src/server/file-store.js";
import { createWorld } from "../src/simulation.js";

const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "space-gta-rooms-"));
  directories.push(directory);
  return {
    directory,
    store: new FileRoomStore(directory),
    record: { world: createWorld(), credentials: {}, actions: {} }
  };
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("local room persistence", () => {
  it("survives a new store instance and keeps owner, access code, and room separate", async () => {
    const { directory, store, record } = await fixture();
    await store.save("owner", "SPACEGTA", "ABCDEFGH", record, true);
    expect(
      await new FileRoomStore(directory).load("owner", "SPACEGTA", "ABCDEFGH")
    ).toEqual(record);
    expect(await store.load("other", "SPACEGTA", "ABCDEFGH")).toBeNull();
    expect(await store.load("owner", "OTHERAAA", "ABCDEFGH")).toBeNull();
    expect(await store.load("owner", "SPACEGTA", "OTHERAAA")).toBeNull();
  });
  it("creates once, atomically replaces a save, and confines arbitrary identifiers to the store", async () => {
    const { directory, store, record } = await fixture();
    await store.save("../owner", "../../code", "/room", record, true);
    record.world.colony.res.mat = 99;
    await expect(
      store.save("../owner", "../../code", "/room", record, true)
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(
      (await store.load("../owner", "../../code", "/room"))!.world.colony.res
        .mat
    ).toBe(160);
    await store.save("../owner", "../../code", "/room", record);
    expect(
      (await store.load("../owner", "../../code", "/room"))!.world.colony.res
        .mat
    ).toBe(99);
    expect(await readdir(directory)).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}\.json$/)
    ]);
  });
  it("reports damaged saves instead of silently replacing progress", async () => {
    const { directory, store, record } = await fixture();
    await store.save("owner", "SPACEGTA", "ABCDEFGH", record);
    const [name] = await readdir(directory);
    await writeFile(join(directory, name), "damaged");
    await expect(store.load("owner", "SPACEGTA", "ABCDEFGH")).rejects.toThrow();
    expect(await readFile(join(directory, name), "utf8")).toBe("damaged");
  });
});
