import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "public-catalog.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHANNEL,
    baseURL: "http://127.0.0.1:3121",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node e2e/fixtures/public-catalog/server.mjs",
      url: "http://127.0.0.1:3122/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3121",
      url: "http://127.0.0.1:3121",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        APP_ENV: "development",
        APP_ORIGIN: "http://127.0.0.1:3121",
        NEXT_TEST_DIST_DIR: ".next-e2e-catalog",
        PUBLIC_CATALOG_MODE: "local-rpc",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3122",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_offline_catalog",
        ADMIN_DEV_AUTH_MODE: "disabled",
      },
    },
  ],
});
