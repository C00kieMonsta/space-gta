import { expect, test } from "@playwright/test";

test("two browsers share a colony and resume an identity after reload", async ({
  browser
}) => {
  const one = await browser.newContext({
      viewport: { width: 1280, height: 900 }
    }),
    two = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true
    });
  const errors: string[] = [];
  try {
    async function page(context: typeof one) {
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      // Drawing is disabled only in this network test. Client state and WebSocket code are unchanged.
      await page.route(/\/game\.[a-f0-9]{8}\.js$/, async (route) => {
        const response = await route.fetch();
        const body =
          "THREE.WebGLRenderer.prototype.render=function(){};\n" +
          (await response.text()).replace(
            "/* ================= loop ================= */",
            "globalThis.__gameTest={MP,PL,SU,mpCommand,get CO(){return CO}};\n/* ================= loop ================= */"
          );
        await route.fulfill({ response, body });
      });
      await page.routeWebSocket("**/multiplayer", (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((message) =>
          setTimeout(() => {
            try {
              server.send(message);
            } catch {}
          }, 70)
        );
        server.onMessage((message) =>
          setTimeout(() => {
            try {
              ws.send(message);
            } catch {}
          }, 70)
        );
      });
      await page.goto("/play/SPACEGTA", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#crewBtn")).toBeVisible();
      return page;
    }
    const a = await page(one),
      b = await page(two);
    await a.locator("#crewBtn").click();
    await a.locator("#crewName").fill("Ada");
    await a.locator("#crewCreate").click();
    await a.waitForFunction(
      () => (globalThis as any).__gameTest?.MP.connected,
      undefined,
      { polling: 100 }
    );
    const identity = await a.evaluate(() => {
      const m = (globalThis as any).__gameTest.MP;
      return { room: m.room, id: m.id };
    });
    await b.locator("#crewBtn").click();
    await b.locator("#crewName").fill("Grace");
    await b.locator("#crewRoom").fill(identity.room);
    await b.locator("#crewJoin").click();
    await b.waitForFunction(
      () =>
        (globalThis as any).__gameTest.MP.connected &&
        Object.keys((globalThis as any).__gameTest.MP.world.players).length ===
          2,
      undefined,
      { polling: 100 }
    );
    await a.waitForFunction(
      () =>
        Object.keys((globalThis as any).__gameTest.MP.world.players).length ===
        2,
      undefined,
      { polling: 100 }
    );
    await a.evaluate(() => {
      const q = (globalThis as any).__gameTest;
      for (let x = -25; x < 25; x += 2)
        for (let z = -15; z < 30; z += 2) {
          if (
            !(globalThis as any).KarmanSim.placementError(
              q.MP.world,
              { id: q.MP.id, x: q.PL.x, z: q.PL.z },
              "solar",
              x,
              z
            )
          ) {
            q.mpCommand({ type: "build", module: "solar", x, z, rot: 0 });
            return;
          }
        }
      throw Error("No buildable location");
    });
    await b.waitForFunction(
      () => (globalThis as any).__gameTest.CO.mods.length === 1,
      undefined,
      { polling: 100 }
    );
    const resources = await b.evaluate(
      () => (globalThis as any).__gameTest.CO.res.mat
    );
    expect(resources).toBe(130);
    await a.reload({ waitUntil: "domcontentloaded" });
    await a.locator("#crewBtn").click();
    await a.locator("#crewRoom").fill(identity.room);
    await a.locator("#crewJoin").click();
    await a.waitForFunction(
      () => (globalThis as any).__gameTest.MP.connected,
      undefined,
      { polling: 100 }
    );
    expect(await a.evaluate(() => (globalThis as any).__gameTest.MP.id)).toBe(
      identity.id
    );
    expect(
      await a.evaluate(() => (globalThis as any).__gameTest.CO.mods.length)
    ).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await one.close();
    await two.close();
  }
});
