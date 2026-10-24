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
    launchOptions: { args: ["--enable-unsafe-swiftshader"] }
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3100/health",
    reuseExistingServer: false,
    timeout: 30000,
    env: { PORT: "3100", SPACE_GTA_DATA_DIR: ".data/browser-tests" }
  },
  reporter: process.env.CI ? "github" : "list"
});
