import { describe, expect, it } from "vitest";
import { getAuthConfig, getServerConfig } from "./env";
describe("auth configuration boundaries", () => {
  it.each([
    { VERCEL: "1" },
    { VERCEL_ENV: "preview" },
    { VERCEL_ENV: "production" },
    { APP_ENV: "test" },
    { APP_ENV: "production" },
    { NODE_ENV: "production" },
    { APP_ORIGIN: "https://staging.example.test" },
  ])("rejects bypass with hostile deployment configuration %j", (override) => {
    expect(() =>
      getServerConfig({
        APP_ENV: "development",
        NODE_ENV: "development",
        APP_ORIGIN: "http://localhost:3000",
        ADMIN_DEV_AUTH_MODE: "enabled",
        ...override,
      }),
    ).toThrow();
  });
  it("denies missing or secret public configuration", () => {
    expect(getAuthConfig({})).toBeNull();
    expect(
      getAuthConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_do_not_expose",
        APP_ORIGIN: "https://admin.example.test",
      }),
    ).toBeNull();
  });
  it("accepts only validated URLs and publishable keys", () => {
    expect(
      getAuthConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
        APP_ORIGIN: "https://admin.example.test",
      }),
    ).toEqual({
      url: "https://project.supabase.co",
      key: "sb_publishable_example",
      origin: "https://admin.example.test",
    });
  });
});
