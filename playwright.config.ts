import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["supabase-auth.spec.ts", "discovery-review.spec.ts", "public-catalog.spec.ts"],
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHANNEL,
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_ENV: "development",
      APP_ORIGIN: baseURL,
      NEXT_TEST_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      PUBLIC_CATALOG_MODE: "disabled",
      ADMIN_DEV_AUTH_MODE: process.env.ADMIN_DEV_AUTH_MODE ?? "enabled",
      ADMIN_DEV_AUTH_ROLE: "admin",
      ADMIN_DEV_AUTH_NAME: "E2E Admin",
    },
  },
});
