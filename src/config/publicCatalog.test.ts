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

const remote: CatalogEnvironment = {
  PUBLIC_CATALOG_MODE: "supabase",
  APP_ENV: "staging",
  NODE_ENV: "production",
  APP_ORIGIN: "https://sports-staging.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://staging.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public_test",
  VERCEL: "1",
  VERCEL_ENV: "production",
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
  it.each(["staging", "production"])("supports explicit anonymous Supabase reads in %s", (APP_ENV) => {
    expect(getPublicCatalogConfig({ ...remote, APP_ENV })).toEqual({
      url: "https://staging.supabase.co",
      key: "sb_publishable_public_test",
      origin: "https://sports-staging.example",
    });
  });
  it("can verify the real public API from a local development server without a session", () => {
    expect(
      getPublicCatalogConfig({
        ...local,
        ...remote,
        APP_ORIGIN: local.APP_ORIGIN,
        NODE_ENV: "development",
        VERCEL: undefined,
        VERCEL_ENV: undefined,
      }),
    ).not.toBeNull();
  });
  it.each([
    { PUBLIC_CATALOG_MODE: undefined },
    { PUBLIC_CATALOG_MODE: "disabled" },
    { PUBLIC_CATALOG_MODE: "typo" },
    { APP_ENV: undefined },
    { APP_ENV: "unknown" },
    { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://staging.supabase.co.attacker.test" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://u:p@staging.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJ.forbidden.jwt" },
  ])("does not silently enable a misconfigured remote catalog: %j", (change) => {
    expect(getPublicCatalogConfig({ ...remote, ...change })).toBeNull();
  });
});
