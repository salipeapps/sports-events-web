import { describe, expect, it } from "vitest";

import { known } from "@/domain/admin";
import { publicationBlockReasons } from "@/domain/adminValidation";
import { candidateReviewVersion } from "@/domain/candidateReviewVersion";
import { FixtureAdminRepository } from "./fixtureAdminRepository";

const reviewer = { id: "reviewer-1", role: "reviewer", displayName: "Fixture reviewer" } as const;

async function currentVersion(repository: FixtureAdminRepository, candidateId: string): Promise<string> {
  const candidate = await repository.getCandidate(candidateId);
  if (!candidate) throw new Error(`Expected candidate fixture: ${candidateId}`);
  return candidateReviewVersion(candidate);
}

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
        expectedVersion: await currentVersion(repository, "candidate-conflict-E023"),
        reason: "Attempt to publish before resolving conflict",
      }),
    ).rejects.toThrow("essential block");
  });

  it("does not approve a candidate that lacks essential publication facts", async () => {
    const repository = new FixtureAdminRepository();

    await expect(
      repository.approveCandidate("candidate-incomplete-E017", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-incomplete-E017"),
        reason: "Attempt to publish incomplete fixture",
      }),
    ).rejects.toThrow("essential block");
  });

  it("does not approve a candidate while a duplicate match is pending", async () => {
    const repository = new FixtureAdminRepository();

    await expect(
      repository.approveCandidate("candidate-possible-duplicate-E019-mirror", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-possible-duplicate-E019-mirror"),
        reason: "Attempt to publish before resolving duplicate",
      }),
    ).rejects.toThrow("pending_match");
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
      expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
      reason: "Evidence checked in fixture workflow",
    });

    expect(candidate.editorialStatus).toBe("published");
    expect(candidate.history.some((entry) => entry.action === "approved")).toBe(true);
    expect(candidate.history.some((entry) => entry.action === "published")).toBe(true);
  });

  it("stores editorial corrections only in final data and keeps extracted evidence unchanged", async () => {
    const repository = new FixtureAdminRepository();
    const before = await repository.getCandidate("candidate-valid-E019");

    const corrected = await repository.updateCandidateFinal("candidate-valid-E019", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
      reason: "Clarify the editorial title before publication",
      corrections: { title: known("Editorially corrected title") },
    });

    expect(corrected.final.title).toEqual(known("Editorially corrected title"));
    expect(corrected.extracted.title).toEqual(before?.extracted.title);
    expect(corrected.evidence).toEqual(before?.evidence);
    expect(corrected.history.at(-1)?.action).toBe("corrected");
  });

  it("rejects a correction that points to an unknown organizer", async () => {
    const repository = new FixtureAdminRepository();
    const before = await repository.getCandidate("candidate-valid-E019");

    await expect(
      repository.updateCandidateFinal("candidate-valid-E019", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
        corrections: { organizerId: known("O999") },
      }),
    ).rejects.toThrow("organizer does not exist");

    expect(await repository.getCandidate("candidate-valid-E019")).toEqual(before);
  });

  it("rejects an empty expected version at the repository boundary", async () => {
    const repository = new FixtureAdminRepository();

    await expect(
      repository.updateCandidateFinal("candidate-valid-E019", {
        actor: reviewer,
        expectedVersion: "",
        corrections: { title: known("Must not be persisted") },
      }),
    ).rejects.toThrow("Falta la versión esperada");

    expect((await repository.getCandidate("candidate-valid-E019"))?.final.title).not.toEqual(
      known("Must not be persisted"),
    );
  });

  it("rejects a stale expected version atomically at the repository boundary", async () => {
    const repository = new FixtureAdminRepository();
    const before = await repository.getCandidate("candidate-valid-E019");
    if (!before) throw new Error("Expected candidate fixture");
    const expectedVersion = candidateReviewVersion(before);

    await repository.updateCandidateFinal("candidate-valid-E019", {
      actor: reviewer,
      expectedVersion,
      corrections: { title: known("First concurrent edit") },
    });

    await expect(
      repository.updateCandidateFinal("candidate-valid-E019", {
        actor: reviewer,
        expectedVersion,
        corrections: { location: known("Stale concurrent location") },
      }),
    ).rejects.toThrow("ha cambiado");

    expect((await repository.getCandidate("candidate-valid-E019"))?.final.location).toEqual(before.final.location);
  });

  it("retains saved correction fields as protected when publishing later", async () => {
    const repository = new FixtureAdminRepository();
    const before = await repository.getCandidate("candidate-valid-E019");
    if (!before) throw new Error("Expected candidate fixture");

    await repository.updateCandidateFinal("candidate-valid-E019", {
      actor: reviewer,
      expectedVersion: candidateReviewVersion(before),
      corrections: { title: known("Protected editorial title") },
    });

    const saved = await repository.getCandidate("candidate-valid-E019");
    if (!saved) throw new Error("Expected corrected candidate");

    await repository.approveCandidate("candidate-valid-E019", {
      actor: reviewer,
      expectedVersion: candidateReviewVersion(saved),
      reason: "Publish after saved correction",
    });

    const published = await repository.listActivities({ statuses: ["published"] });
    const occurrence = published.items.find((item) => item.id === "published-candidate-valid-E019");
    expect(occurrence).toBeDefined();

    const publishedFixture = (
      repository as unknown as { published: Array<{ id: string; protectedCorrections: string[] }> }
    ).published.find((item) => item.id === "published-candidate-valid-E019");
    expect(publishedFixture?.protectedCorrections).toContain("title");
  });

  it("does not persist corrections when approval fails", async () => {
    const repository = new FixtureAdminRepository();
    const before = await repository.getCandidate("candidate-conflict-E023");

    await expect(
      repository.approveCandidate("candidate-conflict-E023", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-conflict-E023"),
        corrections: { title: known("Edited title that must roll back") },
      }),
    ).rejects.toThrow("essential block");

    const after = await repository.getCandidate("candidate-conflict-E023");
    expect(after?.final.title).toEqual(before?.final.title);
    expect(after?.history).toEqual(before?.history);
  });

  it("validates corrections before mutating or publishing a candidate", async () => {
    const repository = new FixtureAdminRepository();
    const before = await repository.getCandidate("candidate-valid-E019");

    await expect(
      repository.approveCandidate("candidate-valid-E019", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
        corrections: { organizerId: known("") },
      }),
    ).rejects.toThrow("Invalid admin contract");

    const after = await repository.getCandidate("candidate-valid-E019");
    expect(after).toEqual(before);

    const published = await repository.listActivities({ statuses: ["published"] });
    expect(published.items.map((item) => item.id)).not.toContain("published-candidate-valid-E019");
  });

  it("includes the whole final day when dateTo is date-only", async () => {
    const repository = new FixtureAdminRepository();
    const result = await repository.listCandidates({
      dateFrom: "2026-10-24",
      dateTo: "2026-10-24",
    });

    expect(result.items.map((item) => item.id)).toContain("candidate-valid-E019");
  });

  it("normalizes zoned timestamp bounds to Europe/Madrid before filtering", async () => {
    const repository = new FixtureAdminRepository();
    const result = await repository.listCandidates({
      dateFrom: "2026-10-24T13:30:00Z",
      dateTo: "2026-10-24T14:30:00Z",
    });

    expect(result.items.map((item) => item.id)).toContain("candidate-valid-E019");
  });

  it("normalizes minute-precision local bounds from datetime-local controls", async () => {
    const repository = new FixtureAdminRepository();

    const result = await repository.listCandidates({
      dateFrom: "2026-10-24T16:00",
      dateTo: "2026-10-24T16:00",
    });

    expect(result.items.map((item) => item.id)).toContain("candidate-valid-E019");
  });

  it("preserves millisecond precision when comparing zoned timestamp bounds", async () => {
    const repository = new FixtureAdminRepository();

    await repository.approveCandidate("candidate-valid-E019", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
      reason: "Exercise millisecond precision",
      corrections: { startLocal: known("2026-10-24T16:00:00.000") },
    });

    const result = await repository.listActivities({
      statuses: ["published"],
      dateTo: "2026-10-24T14:00:00.000Z",
    });

    expect(result.items.map((item) => item.id)).toContain("published-candidate-valid-E019");
  });

  it("removes published candidates from candidate category coverage", async () => {
    const repository = new FixtureAdminRepository();
    const before = await repository.getDashboardSummary();
    const beforeBeach = before.categoryCoverage.find((item) => item.category === "beach_sports");
    if (!beforeBeach) throw new Error("Expected beach_sports coverage");

    await repository.approveCandidate("candidate-valid-E019", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
      reason: "Publish before checking coverage",
    });

    const after = await repository.getDashboardSummary();
    const afterBeach = after.categoryCoverage.find((item) => item.category === "beach_sports");
    if (!afterBeach) throw new Error("Expected beach_sports coverage");

    expect(afterBeach.candidateCount).toBe(beforeBeach.candidateCount - 1);
    expect(afterBeach.publishedCount).toBe(beforeBeach.publishedCount + 1);
  });

  it("prevents transitions out of terminal candidate states", async () => {
    const repository = new FixtureAdminRepository();

    await repository.rejectCandidate("candidate-valid-E019", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
      reason: "Terminal decision",
    });

    await expect(
      repository.approveCandidate("candidate-valid-E019", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
        reason: "Must require explicit reopen",
      }),
    ).rejects.toThrow("terminal state rejected");

    await expect(
      repository.blockCandidate("candidate-valid-E019", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
        reason: "Must require explicit reopen",
      }),
    ).rejects.toThrow("terminal state rejected");

    await expect(
      repository.requestReprocess("candidate-valid-E019", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
        reason: "Must require explicit reopen",
      }),
    ).rejects.toThrow("terminal state rejected");
  });

  it("removes terminal candidates from urgent dashboard items", async () => {
    const repository = new FixtureAdminRepository();

    expect(
      (await repository.getDashboardSummary()).urgentItems.some(
        (item) =>
          item.candidateId.state === "known" && item.candidateId.value === "candidate-possible-duplicate-E019-mirror",
      ),
    ).toBe(true);

    await repository.rejectCandidate("candidate-possible-duplicate-E019-mirror", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-possible-duplicate-E019-mirror"),
      reason: "Duplicate candidate resolved editorially",
    });

    expect(
      (await repository.getDashboardSummary()).urgentItems.some(
        (item) =>
          item.candidateId.state === "known" && item.candidateId.value === "candidate-possible-duplicate-E019-mirror",
      ),
    ).toBe(false);
  });

  it("stores an immutable snapshot of the editorial actor in history", async () => {
    const repository = new FixtureAdminRepository();
    const actor = { id: "reviewer-mutable", role: "reviewer" as const, displayName: "Before mutation" };

    await repository.rejectCandidate("candidate-valid-E019", {
      actor,
      expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
      reason: "Audit actor snapshot",
    });
    actor.displayName = "After mutation";

    const candidate = await repository.getCandidate("candidate-valid-E019");
    expect(candidate?.history.at(-1)?.actor.displayName).toBe("Before mutation");
  });

  it("uses the corrected organizer when publishing", async () => {
    const repository = new FixtureAdminRepository();
    const candidate = await repository.approveCandidate("candidate-valid-E019", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
      reason: "Correct organizer before publication",
      corrections: { organizerId: known("O033") },
    });

    expect(candidate.organizerId).toEqual(known("O033"));
    expect(candidate.final.organizerId).toEqual(known("O033"));

    const published = await repository.listActivities({
      statuses: ["published"],
      organizerId: "O033",
    });
    const occurrence = published.items.find((item) => item.id === "published-candidate-valid-E019");
    expect(occurrence?.organizerId).toEqual(known("O033"));
  });

  it("resolves conflict and rule blockers without mutating source evaluations", async () => {
    const repository = new FixtureAdminRepository();

    await repository.updateCandidateFinal("candidate-conflict-E023", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-conflict-E023"),
      corrections: { startLocal: known("2026-10-07T19:00:00") },
      reason: "Use organizer website schedule",
    });

    await repository.resolveCandidateBlocker("candidate-conflict-E023", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-conflict-E023"),
      kind: "conflict",
      targetId: "conflict-E023-time",
      reason: "Organizer website confirmed the final start time",
    });
    await repository.resolveCandidateBlocker("candidate-conflict-E023", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-conflict-E023"),
      kind: "rule",
      targetId: "rule-E023-conflict",
      reason: "Deterministic conflict reviewed against corrected final data",
    });
    await repository.unblockCandidate("candidate-conflict-E023", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-conflict-E023"),
      reason: "All publication blockers reviewed",
    });

    const candidate = await repository.getCandidate("candidate-conflict-E023");
    if (!candidate) throw new Error("Expected candidate fixture");

    expect(candidate.conflicts.find((item) => item.id === "conflict-E023-time")?.status).toBe("open");
    expect(candidate.rules.find((item) => item.id === "rule-E023-conflict")?.outcome).toBe("block");
    expect(publicationBlockReasons(candidate)).not.toContain("open_blocking_conflict");
    expect(publicationBlockReasons(candidate)).not.toContain("blocking_rule");
    expect(publicationBlockReasons(candidate)).not.toContain("editorial_status_blocked");
    expect(candidate.history.some((entry) => entry.action === "blocker_resolved")).toBe(true);
  });

  it("resolves pending match and change-proposal publication guards explicitly", async () => {
    const repository = new FixtureAdminRepository();

    await repository.resolveCandidateBlocker("candidate-possible-duplicate-E019-mirror", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-possible-duplicate-E019-mirror"),
      kind: "match",
      targetId: "match-fixture-E019",
      reason: "Reviewed as a distinct occurrence",
    });
    const matchCandidate = await repository.getCandidate("candidate-possible-duplicate-E019-mirror");
    if (!matchCandidate) throw new Error("Expected duplicate fixture");
    expect(publicationBlockReasons(matchCandidate)).not.toContain("pending_match");

    await repository.resolveCandidateBlocker("candidate-change-E023", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-change-E023"),
      kind: "change_proposal",
      targetId: "change-E023-time",
      reason: "Essential schedule change reviewed editorially",
    });
    const changeCandidate = await repository.getCandidate("candidate-change-E023");
    if (!changeCandidate) throw new Error("Expected change fixture");
    expect(publicationBlockReasons(changeCandidate)).not.toContain("pending_essential_change");
  });

  it("allows an explicitly blocked candidate to return to review with audit history", async () => {
    const repository = new FixtureAdminRepository();

    await repository.blockCandidate("candidate-valid-E019", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
      reason: "Temporary editorial hold",
    });

    const blocked = await repository.getCandidate("candidate-valid-E019");
    expect(blocked?.editorialStatus).toBe("blocked");

    await repository.unblockCandidate("candidate-valid-E019", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
      reason: "Hold resolved after verification",
    });

    const reopened = await repository.getCandidate("candidate-valid-E019");
    expect(reopened?.editorialStatus).toBe("review");
    expect(reopened?.history.at(-1)?.action).toBe("unblocked");
    expect(reopened?.history.at(-1)?.reason).toEqual(known("Hold resolved after verification"));
  });

  it("does not allow a published candidate to be rejected or blocked", async () => {
    const repository = new FixtureAdminRepository();

    await repository.approveCandidate("candidate-valid-E019", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
      reason: "Publish before testing terminal decision guards",
    });

    await expect(
      repository.rejectCandidate("candidate-valid-E019", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
        reason: "Must not revert a published candidate",
      }),
    ).rejects.toThrow("Published candidate cannot be rejected");

    await expect(
      repository.blockCandidate("candidate-valid-E019", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
        reason: "Must not block a published candidate",
      }),
    ).rejects.toThrow("Published candidate cannot be blocked");

    expect((await repository.getCandidate("candidate-valid-E019"))?.editorialStatus).toBe("published");
  });

  it("requires a reason when rejecting or blocking", async () => {
    const repository = new FixtureAdminRepository();

    await expect(
      repository.rejectCandidate("candidate-valid-E019", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
        reason: "  ",
      }),
    ).rejects.toThrow("non-empty reason");
  });

  it("keeps repository instances isolated", async () => {
    const first = new FixtureAdminRepository();
    const second = new FixtureAdminRepository();

    await first.rejectCandidate("candidate-valid-E019", {
      actor: reviewer,
      expectedVersion: await currentVersion(first, "candidate-valid-E019"),
      reason: "Fixture-only rejection",
    });

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

  it("rejects invalid editorial actors before mutating candidate state", async () => {
    const repository = new FixtureAdminRepository();
    const invalidActor = { id: "", role: "reviewer", displayName: "" } as const;
    const before = await repository.getCandidate("candidate-valid-E019");

    await expect(
      repository.rejectCandidate("candidate-valid-E019", {
        actor: invalidActor,
        expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
        reason: "This must not be persisted",
      }),
    ).rejects.toThrow("valid editorial actor");

    const after = await repository.getCandidate("candidate-valid-E019");
    expect(after).toEqual(before);
  });

  it("does not publish a candidate with a corrected organizer that does not exist", async () => {
    const repository = new FixtureAdminRepository();

    await expect(
      repository.approveCandidate("candidate-valid-E019", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
        reason: "Invalid organizer correction",
        corrections: { organizerId: known("O999") },
      }),
    ).rejects.toThrow("organizer does not exist");

    expect((await repository.getCandidate("candidate-valid-E019"))?.editorialStatus).toBe("review");

    const published = await repository.listActivities({ statuses: ["published"], organizerId: "O999" });
    expect(published.items).toHaveLength(0);
  });
});
