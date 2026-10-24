import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "test/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    actionTimeout: 15000,
    navigationTimeout: 15000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-dev-shm-usage"
      ]
    }
  },
  webServer: {
    command: "pnpm start",
    url: "http://127.0.0.1:3100/health",
    reuseExistingServer: false,
    timeout: 30000,
    env: { PORT: "3100", SPACE_GTA_DATA_DIR: ".data/browser-tests" }
  },
  reporter: process.env.CI ? "github" : "list"
});
