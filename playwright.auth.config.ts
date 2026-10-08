import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: "supabase-auth.spec.ts",
  testIgnore: [],
  webServer: [
    { command: "node e2e/fixtures/auth-server.mjs", url: "http://127.0.0.1:3201/health", reuseExistingServer: false },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        APP_ENV: "development",
        NEXT_TEST_DIST_DIR: ".next-e2e-auth",
        APP_ORIGIN: "http://127.0.0.1:3100",
        ADMIN_DEV_AUTH_MODE: "disabled",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3201",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only",
      },
    },
  ],
});
