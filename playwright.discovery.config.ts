import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "discovery-review.spec.ts",
  testIgnore: [],
  use: { ...base.use, baseURL: "http://127.0.0.1:3202" },
  webServer: {
    command: "node e2e/fixtures/discovery-ui/server.mjs",
    url: "http://127.0.0.1:3202/admin/discovery",
    reuseExistingServer: false,
  },
});
