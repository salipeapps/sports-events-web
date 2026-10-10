import { describe, expect, it } from "vitest";

import { getServerConfig, parseAdminDevAuthMode, parseAdminDevRole, parseAppEnvironment } from "./env";

describe("server environment", () => {
  it("defaults to development with insecure admin auth disabled", () => {
    expect(getServerConfig({})).toMatchObject({
      appEnv: "development",
      adminDevAuthMode: "disabled",
      adminDevAuthRole: "admin",
    });
  });

  it("accepts known environments and development roles", () => {
    expect(parseAppEnvironment("test")).toBe("test");
    expect(parseAppEnvironment("production")).toBe("production");
    expect(parseAppEnvironment("staging")).toBe("staging");
    expect(getServerConfig({ APP_ENV: "staging", NODE_ENV: "production", ADMIN_DEV_AUTH_MODE: "disabled" })).toMatchObject({
      appEnv: "staging",
      adminDevAuthMode: "disabled",
    });
    expect(parseAdminDevAuthMode("enabled")).toBe("enabled");
    expect(parseAdminDevRole("reviewer")).toBe("reviewer");
  });

  it("rejects unknown configuration values", () => {
    expect(() => parseAppEnvironment("preview")).toThrow("Invalid APP_ENV");
    expect(() => parseAdminDevAuthMode("sometimes")).toThrow("Invalid ADMIN_DEV_AUTH_MODE");
    expect(() => parseAdminDevRole("editor")).toThrow("Invalid ADMIN_DEV_AUTH_ROLE");
  });

  it("fails closed if development bypass is enabled in production or staging", () => {
    expect(() =>
      getServerConfig({
        APP_ENV: "staging",
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        ADMIN_DEV_AUTH_MODE: "enabled",
      }),
    ).toThrow("development-only");

    expect(() =>
      getServerConfig({
        APP_ENV: "production",
        ADMIN_DEV_AUTH_MODE: "enabled",
        ADMIN_DEV_AUTH_ROLE: "admin",
      }),
    ).toThrow("development-only");

    expect(() =>
      getServerConfig({
        APP_ENV: "development",
        NODE_ENV: "production",
        ADMIN_DEV_AUTH_MODE: "enabled",
      }),
    ).toThrow("development-only");
  });
});
