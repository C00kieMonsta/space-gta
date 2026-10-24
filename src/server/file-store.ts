import { createHash, randomBytes } from "node:crypto";
import { link, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RoomRecord, RoomStore } from "./rooms.js";

/** Single-process local storage. Room files contain private reconnect credential hashes. */
export class FileRoomStore implements RoomStore {
  private readonly directory: string;
  constructor(directory: string) {
    this.directory = resolve(directory);
  }
  private path(owner: string, code: string, room: string): string {
    const key = createHash("sha256")
      .update(JSON.stringify([owner, code, room]))
      .digest("hex");
    return join(this.directory, key + ".json");
  }
  async load(
    owner: string,
    code: string,
    room: string
  ): Promise<RoomRecord | null> {
    try {
      const record = JSON.parse(
        await readFile(this.path(owner, code, room), "utf8")
      ) as RoomRecord;
      if (record.world?.v !== 1 || !record.credentials || !record.actions)
        throw new Error("Unsupported or damaged room save.");
      return record;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async save(
    owner: string,
    code: string,
    room: string,
    record: RoomRecord,
    create = false
  ): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = this.path(owner, code, room),
      temporary = path + "." + randomBytes(8).toString("hex") + ".tmp";
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(record));
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      if (create) await link(temporary, path);
      else await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
