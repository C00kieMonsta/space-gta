import { expect, test, type Page } from "@playwright/test";

// Exercise the real UI and simulation without making interaction tests depend on GPU speed.
async function openGame(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route(/\/game\.[a-f0-9]{8}\.js$/, async (route) => {
    const response = await route.fetch();
    const source = (await response.text())
      .replace(
        "'use strict';",
        "'use strict';\ngfxInit = () => {}; drawFrame = () => {}; envMap = () => null;"
      )
      .replace(
        "const pmrem = new THREE.PMREMGenerator(renderer);",
        "const pmrem = null;"
      )
      .replace(
        "/* ================= loop ================= */",
        "globalThis.__designTest={LS,DS,PL,get mode(){return GAME.mode}};\n/* ================= loop ================= */"
      );
    await route.fulfill({ response, body: source });
  });
  await page.goto("/play/SPACEGTA");
  await expect(page.locator('#rkList [aria-checked="true"]')).toHaveAttribute(
    "data-id",
    "heron"
  );
  return errors;
}

test("mission choices support the keyboard and flight assist survives a reload", async ({
  page
}) => {
  const errors = await openGame(page);
  await page.locator('#rkList [data-id="heron"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#shipName")).toHaveText("Condor");
  await expect(page.locator("#shipIndex")).toHaveText("04 / 05");
  await page.locator('#destList [data-id="moon"]').focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#flightPlan li")).toHaveCount(2);
  await expect(page.locator("#quickStart")).toBeHidden();
  await page.keyboard.press("End");
  await expect(page.locator('#destList [data-id="mars"]')).toBeFocused();
  await expect(page.locator("#flightPlan li")).toHaveCount(4);
  await page.locator("#assistBtn").click();
  await expect(page.locator("#assistBtn")).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await page.reload();
  await expect(page.locator("#assistBtn")).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  expect(errors).toEqual([]);
});

test("the launch guide pauses the flight and assist waits for engine start", async ({
  page
}) => {
  const errors = await openGame(page);
  await page.locator("#launchBtn").click();
  await expect(page.locator("#guideDialog")).toBeVisible();
  await expect(page.locator("#guideTitle")).toHaveText("Next stop: the stars.");
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => (globalThis as any).__designTest.LS.S.met)
  ).toBe(0);
  await page.locator("#guideClose").click();
  await expect(page.locator("#chip")).toHaveText("On pad");
  expect(
    await page.evaluate(() => (globalThis as any).__designTest.LS.S.engine)
  ).toBe(false);
  await page.locator("#primary").click();
  await expect
    .poll(() =>
      page.evaluate(() => (globalThis as any).__designTest.LS.S.spool)
    )
    .toBeGreaterThan(0);
  await page.locator("#telemetryBtn").click();
  await expect(page.locator("#flightDetails")).toBeVisible();
  await page.locator("#telemetryBtn").click();
  await expect(page.locator("#flightDetails")).toBeHidden();
  await page.keyboard.press("h");
  await expect(page.locator("#guideDialog")).toBeVisible();
  const spool = await page.evaluate(
    () => (globalThis as any).__designTest.LS.S.spool
  );
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => (globalThis as any).__designTest.LS.S.spool)
  ).toBe(spool);
  await page.keyboard.press("Escape");
  await expect(page.locator("#guideDialog")).toBeHidden();
  expect(errors).toEqual([]);
});

test("touch departure actions remain reachable and landing instructions match touch input", async ({
  browser
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  try {
    const page = await context.newPage();
    const errors = await openGame(page);
    for (const size of [
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 844, height: 390 }
    ]) {
      await page.setViewportSize(size);
      await expect(page.locator("#launchBtn")).toBeInViewport({ ratio: 1 });
      await expect(page.locator("#skipBtn")).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(size.width);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#skipBtn").click();
    await expect(page.locator("#guideDialog")).toBeVisible();
    await expect(page.locator("#guideControls")).toContainText("Left joystick");
    const altitude = await page.evaluate(
      () => (globalThis as any).__designTest.DS.L.y
    );
    await page.waitForTimeout(250);
    expect(
      await page.evaluate(() => (globalThis as any).__designTest.DS.L.y)
    ).toBe(altitude);
    await page.locator("#guideClose").click();
    await expect(page.locator("#dsAuto")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect
      .poll(() => page.evaluate(() => (globalThis as any).__designTest.DS.L.y))
      .toBeLessThan(altitude);
    await page.reload();
    await page.locator("#skipBtn").click();
    await expect(page.locator("#descentUI")).toBeVisible();
    await expect(page.locator("#guideDialog")).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("surface goals, building, resource details and dialog keyboard controls work", async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "karman-save-v2",
      JSON.stringify({
        v: 2,
        profile: {},
        colonies: {},
        settings: {},
        resume: { body: "moon", x: 0, z: 12, yaw: 0, lx: 0, lz: 0 }
      })
    );
  });
  const errors = await openGame(page);
  await page.locator("#contBtn").click();
  await expect(page.locator("#guideDialog")).toBeVisible();
  await expect(page.locator("#cPower")).toHaveText("+2");
  await expect(page.locator("#resourceGrid")).not.toContainText(
    /NaN|undefined/
  );
  await page.locator("#guideClose").click();
  await expect(page.locator("#goalNext")).toHaveText("Plant your flag");
  await expect(page.locator("#objList")).toBeHidden();
  await page.locator("#objBtn").click();
  await expect(page.locator("#objList li")).toHaveCount(8);
  await page.locator("#buildBtn").click();
  await expect(page.locator("#buildBar")).toBeVisible();
  await expect(page.locator('#buildBar [data-id="flag"]')).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.locator("#bDone").click();
  await page.locator("#craftBtn").click();
  await expect(page.locator("#craftPanel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#craftPanel")).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#cPop")).toBeVisible();
  await expect(page.locator("#cFood")).toBeHidden();
  await page.locator("#resourceBtn").click();
  await expect(page.locator("#cFood")).toBeVisible();
  expect(errors).toEqual([]);
});
