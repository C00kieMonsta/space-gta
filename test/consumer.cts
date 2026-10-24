import {
  Rooms,
  createMultiplayerServer,
  type RoomStore
} from "@space-gta/game/server";
import { createWorld, type World } from "@space-gta/game/simulation";

const store: RoomStore = {
  async load() {
    return null;
  },
  async save() {}
};
const rooms = new Rooms(store, async () => null);
const world: World = createWorld();
void createMultiplayerServer;
void rooms;
void world;
