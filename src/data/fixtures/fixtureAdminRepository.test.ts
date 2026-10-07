import { describe, expect, it } from "vitest";

import { FixtureAdminRepository } from "./fixtureAdminRepository";

const reviewer = { id: "reviewer-1", role: "reviewer", displayName: "Fixture reviewer" } as const;

describe("FixtureAdminRepository", () => {
  it("combines candidate filters and exposes dataset-derived states", async () => {
    const repository = new FixtureAdminRepository();
    const result = await repository.listCandidates({
      statuses: ["blocked"],
      category: "yoga",
      sourceId: "S009",
    });

    expect(result.items.map((item) => item.id)).toContain("candidate-conflict-E023");
    expect(result.items.every((item) => item.editorialStatus === "blocked")).toBe(true);
  });

  it("does not approve a candidate with an essential block", async () => {
    const repository = new FixtureAdminRepository();

    await expect(
      repository.approveCandidate("candidate-conflict-E023", {
        actor: reviewer,
        reason: "Attempt to publish before resolving conflict",
      }),
    ).rejects.toThrow("essential block");
  });

  it("does not approve a candidate that lacks essential publication facts", async () => {
    const repository = new FixtureAdminRepository();

    await expect(
      repository.approveCandidate("candidate-incomplete-E017", {
        actor: reviewer,
        reason: "Attempt to publish incomplete fixture",
      }),
    ).rejects.toThrow("essential block");
  });

  it("filters candidates by originating execution", async () => {
    const repository = new FixtureAdminRepository();
    const result = await repository.listCandidates({ executionId: "fixture-run-8421" });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.map((item) => item.id)).toContain("candidate-valid-E019");
    expect(result.items.map((item) => item.id)).not.toContain("candidate-price-conflict-E064");
  });

  it("approves a reviewable candidate and preserves an editorial history", async () => {
    const repository = new FixtureAdminRepository();
    const candidate = await repository.approveCandidate("candidate-valid-E019", {
      actor: reviewer,
      reason: "Evidence checked in fixture workflow",
    });

    expect(candidate.editorialStatus).toBe("published");
    expect(candidate.history.some((entry) => entry.action === "approved")).toBe(true);
    expect(candidate.history.some((entry) => entry.action === "published")).toBe(true);
  });

  it("requires a reason when rejecting or blocking", async () => {
    const repository = new FixtureAdminRepository();

    await expect(repository.rejectCandidate("candidate-valid-E019", { actor: reviewer, reason: "  " })).rejects.toThrow(
      "non-empty reason",
    );
  });

  it("keeps repository instances isolated", async () => {
    const first = new FixtureAdminRepository();
    const second = new FixtureAdminRepository();

    await first.rejectCandidate("candidate-valid-E019", { actor: reviewer, reason: "Fixture-only rejection" });

    expect((await first.getCandidate("candidate-valid-E019"))?.editorialStatus).toBe("rejected");
    expect((await second.getCandidate("candidate-valid-E019"))?.editorialStatus).toBe("review");
  });

  it("reports unknown dashboard metrics instead of inventing coverage or current-day runs", async () => {
    const repository = new FixtureAdminRepository();
    const dashboard = await repository.getDashboardSummary();

    expect(dashboard.metrics.runsToday.state).toBe("unknown");
    expect(dashboard.metrics.coverageNext14Days.state).toBe("unknown");
    expect(dashboard.coverageTrend.state).toBe("unknown");
  });
});
