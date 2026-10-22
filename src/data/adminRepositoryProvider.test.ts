import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLocalAdminDemo } from "@/config/adminData";
import { getAdminRepository } from "./adminRepositoryProvider";
import { FixtureAdminRepository } from "./fixtures/fixtureAdminRepository";
import { UnavailableAdminRepository } from "./unavailableAdminRepository";

vi.mock("server-only", () => ({}));

const local = {
  APP_ENV: "development",
  NODE_ENV: "development",
  APP_ORIGIN: "http://127.0.0.1:3100",
  ADMIN_DEV_AUTH_MODE: "enabled",
  VERCEL: undefined,
  VERCEL_ENV: undefined,
} as const;

beforeEach(() => {
  for (const [key, value] of Object.entries(local)) vi.stubEnv(key, value);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Admin repository selection", () => {
  it("permits fixtures only in the explicit loopback development demo", () => {
    expect(isLocalAdminDemo()).toBe(true);
    expect(getAdminRepository()).toBeInstanceOf(FixtureAdminRepository);
  });

  it.each([
    ["APP_ENV", "staging"],
    ["APP_ENV", "production"],
    ["APP_ENV", "test"],
    ["APP_ENV", undefined],
    ["NODE_ENV", "production"],
    ["NODE_ENV", "test"],
    ["NODE_ENV", undefined],
    ["ADMIN_DEV_AUTH_MODE", "disabled"],
    ["ADMIN_DEV_AUTH_MODE", undefined],
    ["VERCEL", "1"],
    ["VERCEL", "0"],
    ["VERCEL_ENV", "preview"],
    ["APP_ORIGIN", "https://remote.example"],
    ["APP_ORIGIN", undefined],
  ])("blocks fixtures when %s=%s, including after a local demo was used", (key, value) => {
    expect(getAdminRepository()).toBeInstanceOf(FixtureAdminRepository);
    vi.stubEnv(key, value);
    expect(isLocalAdminDemo()).toBe(false);
    expect(getAdminRepository()).toBeInstanceOf(UnavailableAdminRepository);
  });

  it("blocks every B1 read and command remotely without fetching or returning empty successes", async () => {
    vi.stubEnv("APP_ENV", "staging");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const repository = getAdminRepository();
    const reads = [
      repository.getDashboardSummary(),
      repository.listActivities({ page: 99 }),
      repository.listCandidates({ page: 2 }),
      repository.listRunCandidates("run", { page: 3 }),
      repository.getCandidate("candidate"),
      repository.getLinkedPublishedOccurrence("candidate"),
      repository.listOrganizers(),
      repository.getOrganizer("organizer"),
      repository.listSources(),
      repository.listRuns(),
    ];
    await Promise.all(reads.map((read) => expect(read).rejects.toMatchObject({ code: "NOT_AVAILABLE" })));
    const input = {
      actor: { id: "admin", role: "admin", displayName: "Admin" } as const,
      expectedVersion: "v1",
      reason: "review",
    };
    const commands = [
      repository.updateCandidateFinal("id", { ...input, corrections: {} }),
      repository.refreshCandidatePublishedBaseline("id", { ...input, expectedOccurrenceVersion: "v1" }),
      repository.approveCandidate("id", input),
      repository.rejectCandidate("id", input),
      repository.blockCandidate("id", input),
      repository.unblockCandidate("id", input),
      repository.resolveCandidateBlocker("id", { ...input, kind: "conflict", targetId: "id" }),
      repository.requestRequery("id", input),
      repository.requestReprocess("id", input),
    ];
    await Promise.all(commands.map((command) => expect(command).rejects.toThrow("WRITE_UNAVAILABLE")));
    expect(fetcher).not.toHaveBeenCalled();
  });
});
