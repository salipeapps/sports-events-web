import { describe, expect, it } from "vitest";

import { createAdminSessionProvider } from "./adminAuth";

describe("admin session provider", () => {
  it("denies access by default", async () => {
    const access = await createAdminSessionProvider({ APP_ENV: "development" }).getAccess();

    expect(access).toEqual({ status: "unauthenticated", reason: "missing_session" });
  });

  it("allows the explicit local development provider", async () => {
    const access = await createAdminSessionProvider({
      APP_ENV: "development",
      ADMIN_DEV_AUTH_MODE: "enabled",
      ADMIN_DEV_AUTH_ROLE: "reviewer",
      ADMIN_DEV_AUTH_NAME: "Local Reviewer",
    }).getAccess();

    expect(access).toEqual({
      status: "authenticated",
      session: {
        subject: "local-development-reviewer",
        displayName: "Local Reviewer",
        role: "reviewer",
      },
    });
  });

  it("cannot enable the local bypass in production", () => {
    expect(() =>
      createAdminSessionProvider({
        APP_ENV: "production",
        ADMIN_DEV_AUTH_MODE: "enabled",
      }),
    ).toThrow("development-only");
  });
});
