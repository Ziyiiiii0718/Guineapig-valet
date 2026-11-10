import { defineConfig, devices } from "@playwright/test";
import { APP_ORIGIN } from "./tests/e2e/safety.ts";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: ".local/piggievault-e2e/results",
  reporter: [["./tests/e2e/reporter.ts"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: APP_ORIGIN,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "off",
    screenshot: "off",
    video: "off",
    serviceWorkers: "block",
  },
  webServer: {
    command: "node --experimental-strip-types tests/e2e/start-app.ts",
    url: `${APP_ORIGIN}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "ignore",
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
  projects: [
    { name: "smoke", testMatch: "smoke.spec.ts" },
    { name: "local", testMatch: "workflows.spec.ts" },
  ],
});
