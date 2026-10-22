import { describe, expect, it } from "vitest";
import { getPublicCatalogConfig, type CatalogEnvironment } from "./publicCatalog";

const local: CatalogEnvironment = {
  PUBLIC_CATALOG_MODE: "local-rpc",
  APP_ENV: "development",
  NODE_ENV: "development",
  APP_ORIGIN: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_offline_test",
};

describe("public catalogue activation", () => {
  it("allows only the explicit labelled loopback integration", () => {
    expect(getPublicCatalogConfig(local)).toEqual({
      url: "http://127.0.0.1:54321",
      key: "sb_publishable_offline_test",
      origin: "http://localhost:3000",
    });
  });
  it.each([
    { PUBLIC_CATALOG_MODE: undefined },
    { PUBLIC_CATALOG_MODE: "supabase" },
    { PUBLIC_CATALOG_MODE: "disabled" },
    { APP_ENV: "staging" },
    { APP_ENV: "production" },
    { NODE_ENV: "production" },
    { VERCEL: "1" },
    { VERCEL_ENV: "preview" },
    { VERCEL: "" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" },
    { APP_ORIGIN: "https://remote.example" },
    { APP_ORIGIN: "http://localhost.evil.test:3000" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJ.forbidden.jwt" },
  ])("fails closed for %j", (change) => {
    expect(getPublicCatalogConfig({ ...local, ...change })).toBeNull();
  });
});
