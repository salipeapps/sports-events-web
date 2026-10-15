import { afterEach, describe, expect, it, vi } from "vitest";
import { getDiscoveryReviewAccess } from "./reviewAccess";
import { commandConfig, commandsEnabled } from "./commandApi";

vi.mock("server-only", () => ({}));
vi.mock("./commandApi", () => ({ commandConfig: vi.fn(), commandsEnabled: vi.fn(() => false) }));
afterEach(() => vi.resetAllMocks());

describe("server-derived decision affordances", () => {
  it("does not inspect writer config with gates off", () => {
    expect(getDiscoveryReviewAccess({ role: "admin", subject: "verified", displayName: "Admin" })).toMatchObject({
      rejectionEnabled: false,
      promotionEnabled: false,
    });
    expect(commandConfig).not.toHaveBeenCalled();
  });
  it("keeps reviewers from promotion regardless of the gates", () => {
    vi.mocked(commandsEnabled).mockReturnValue(true);
    expect(getDiscoveryReviewAccess({ role: "reviewer", subject: "verified", displayName: "Reviewer" })).toEqual({
      subject: "verified",
      canReject: true,
      canPromote: false,
      rejectionEnabled: true,
      promotionEnabled: true,
    });
  });
  it("fails closed for incomplete writer configuration without breaking reads", () => {
    vi.mocked(commandsEnabled).mockReturnValue(true);
    vi.mocked(commandConfig).mockImplementation(() => {
      throw new Error("not configured");
    });
    expect(getDiscoveryReviewAccess({ role: "admin", subject: "verified", displayName: "Admin" })).toMatchObject({
      rejectionEnabled: false,
      promotionEnabled: false,
    });
  });
});
