import { describe, expect, it } from "vitest";

import { AdminAuthorizationError, canAdmin, requireAdminCapability, type AdminSession } from "./adminAccess";

const reviewer: AdminSession = {
  subject: "reviewer-test",
  displayName: "Reviewer",
  role: "reviewer",
};

describe("admin authorization", () => {
  it("lets reviewers perform editorial review and publication", () => {
    expect(canAdmin("reviewer", "catalog.review")).toBe(true);
    expect(canAdmin("reviewer", "discovery.view")).toBe(true);
    expect(canAdmin("reviewer", "catalog.publish")).toBe(true);
  });

  it("keeps sensitive source, execution and settings operations admin-only", () => {
    expect(canAdmin("reviewer", "sources.manage")).toBe(false);
    expect(canAdmin("reviewer", "runs.execute")).toBe(false);
    expect(canAdmin("reviewer", "settings.manage")).toBe(false);
    expect(canAdmin("admin", "settings.manage")).toBe(true);
  });

  it("provides a server-side guard for sensitive operations", () => {
    expect(() => requireAdminCapability(reviewer, "sources.manage")).toThrow(AdminAuthorizationError);
  });
});
