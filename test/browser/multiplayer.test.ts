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
      page.on("pageerror", (error) => {
        errors.push(error.message);
        console.error("Browser error:", error.message);
      });
      page.on("console", (message) => {
        if (message.type() === "error")
          console.error("Browser console:", message.text());
      });
      // Drawing is disabled only in this network test. Client state and WebSocket code are unchanged.
      await page.route(/\/game\.[a-f0-9]{8}\.js$/, async (route) => {
        const response = await route.fetch();
        const game = (await response.text())
          .replace(
            "'use strict';",
            "'use strict';\ngfxInit = () => {}; drawFrame = () => {}; envMap = () => null;"
          )
          .replace(
            "const pmrem = new THREE.PMREMGenerator(renderer);",
            "const pmrem = null;"
          );
        const body =
          "THREE.WebGLRenderer.prototype.render=function(){};\n" +
          game.replace(
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
      await page.waitForFunction(
        () => !!(globalThis as any).__gameTest,
        undefined,
        { polling: 100, timeout: 15000 }
      );
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
      { polling: 100, timeout: 15000 }
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
      { polling: 100, timeout: 15000 }
    );
    await a.waitForFunction(
      () =>
        Object.keys((globalThis as any).__gameTest.MP.world.players).length ===
        2,
      undefined,
      { polling: 100, timeout: 15000 }
    );
    await expect(a.locator("#crewRoster li")).toHaveCount(2);
    await expect(b.locator("#crewRoster li")).toHaveCount(2);
    await expect(a.locator("#crewLatency")).toHaveText(/\d+ ms/);
    await a.locator("#surfaceUI .menu-btn").click();
    await expect(a.locator("#mAimAssist")).toHaveText("Aim assist: On");
    await a.locator("#mAimAssist").click();
    await a.keyboard.press("Escape");
    const start = await a.evaluate(() => ({
      ...(globalThis as any).__gameTest.PL
    }));
    await a.keyboard.down("Shift");
    await a.keyboard.down("w");
    await a.waitForFunction(() => {
      const p = (globalThis as any).__gameTest.MP.pred;
      return Math.hypot(p.vx, p.vz) > 8;
    });
    await a.waitForFunction((origin) => {
      const p = (globalThis as any).__gameTest.PL;
      return Math.hypot(p.x - origin.x, p.z - origin.z) > 2;
    }, start);
    await a.keyboard.up("w");
    await a.keyboard.up("Shift");
    const moved = await a.evaluate(() => ({
      ...(globalThis as any).__gameTest.PL
    }));
    expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeGreaterThan(1);
    await b.locator("#tRun").click();
    await expect(b.locator("#tRun")).toHaveAttribute("aria-pressed", "true");
    await b.locator("#tRun").click();
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
      { polling: 100, timeout: 15000 }
    );
    const resources = await b.evaluate(
      () => (globalThis as any).__gameTest.CO.res.mat
    );
    expect(resources).toBe(130);
    await a.evaluate(() =>
      (globalThis as any).__gameTest.MP.ws.close(4008, "Test reconnect")
    );
    await expect(a.locator("#crewLatency")).toHaveText("Offline");
    await a.waitForFunction(() => (globalThis as any).__gameTest.MP.connected);
    expect(await a.evaluate(() => (globalThis as any).__gameTest.MP.id)).toBe(
      identity.id
    );
    await a.reload({ waitUntil: "domcontentloaded" });
    await a.locator("#crewBtn").click();
    await a.locator("#crewRoom").fill(identity.room);
    await a.locator("#crewJoin").click();
    await a.waitForFunction(
      () => (globalThis as any).__gameTest.MP.connected,
      undefined,
      { polling: 100, timeout: 15000 }
    );
    expect(await a.evaluate(() => (globalThis as any).__gameTest.MP.id)).toBe(
      identity.id
    );
    expect(
      await a.evaluate(() => (globalThis as any).__gameTest.CO.mods.length)
    ).toBe(1);
    await a.locator("#surfaceUI .menu-btn").click();
    await expect(a.locator("#mAimAssist")).toHaveText("Aim assist: Off");
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([one.close(), two.close()]);
  }
});
