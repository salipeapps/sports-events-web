import { describe, expect, it } from "vitest";

import { known, type AdminCandidate, type PublishedOccurrence } from "@/domain/admin";
import { publicationBlockReasons } from "@/domain/adminValidation";
import { candidateReviewVersion, publishedOccurrenceReviewVersion } from "@/domain/candidateReviewVersion";
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

  it("rejects a saved start later than the retained end without mutating the candidate", async () => {
    const repository = new FixtureAdminRepository();
    const candidateId = "candidate-valid-E019";
    const before = await repository.getCandidate(candidateId);
    if (!before || before.final.endLocal.state !== "known") throw new Error("Expected an end date");

    await expect(
      repository.updateCandidateFinal(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        corrections: { startLocal: known("2026-10-24T20:30:00") },
        reason: "Check start and end consistency",
      }),
    ).rejects.toThrow("anteriores al inicio");

    expect(await repository.getCandidate(candidateId)).toEqual(before);
  });

  it.each(["not-a-date", "2026-02-30T16:00", "2026-10-24T25:00"])(
    "rejects malformed saved start %s and preserves the candidate",
    async (invalidDate) => {
      const repository = new FixtureAdminRepository();
      const candidateId = "candidate-valid-E019";
      const before = await repository.getCandidate(candidateId);
      await expect(
        repository.updateCandidateFinal(candidateId, {
          actor: reviewer,
          expectedVersion: await currentVersion(repository, candidateId),
          corrections: { startLocal: known(invalidDate) },
        }),
      ).rejects.toThrow();
      expect(await repository.getCandidate(candidateId)).toEqual(before);
    },
  );

  it("rejects a malformed end and start on approval without publishing", async () => {
    const repository = new FixtureAdminRepository();
    const id = "candidate-valid-E019";
    const before = await repository.getCandidate(id);
    for (const corrections of [{ startLocal: known("not-a-date") }, { endLocal: known("2026-02-30T18:30") }]) {
      await expect(
        repository.approveCandidate(id, {
          actor: reviewer,
          expectedVersion: await currentVersion(repository, id),
          corrections,
          reason: "Invalid timestamp must not be published",
        }),
      ).rejects.toThrow();
    }
    expect(await repository.getCandidate(id)).toEqual(before);
    expect((await repository.listActivities({ statuses: ["published"] })).items).toHaveLength(1);
  });

  it("rejects an inverted interval on approval even when the form validation is bypassed", async () => {
    const repository = new FixtureAdminRepository();
    const before = await repository.getCandidate("candidate-valid-E019");

    await expect(
      repository.approveCandidate("candidate-valid-E019", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-valid-E019"),
        corrections: { startLocal: known("2026-10-24T20:30:00") },
        reason: "Invalid start time during approval",
      }),
    ).rejects.toThrow("anteriores al inicio");

    expect(await repository.getCandidate("candidate-valid-E019")).toEqual(before);
    expect((await repository.listActivities({ statuses: ["published"] })).items).toHaveLength(1);
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

  it("publishes an audited conflict resolution to the linked occurrence without creating a duplicate", async () => {
    const repository = new FixtureAdminRepository();
    const candidateId = "candidate-conflict-E023";
    await repository.updateCandidateFinal(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      corrections: { startLocal: known("2026-10-07T18:45:00") },
      reason: "Organizer confirms corrected schedule",
    });
    await repository.resolveCandidateBlocker(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      kind: "conflict",
      targetId: "conflict-E023-time",
      reason: "Schedule conflict verified with organizer",
    });
    await repository.resolveCandidateBlocker(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      kind: "rule",
      targetId: "rule-E023-conflict",
      reason: "Blocking rule addressed",
    });
    await repository.unblockCandidate(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      reason: "All blockers resolved",
    });

    const review = await repository.getCandidate(candidateId);
    if (!review) throw new Error("Missing resolved candidate");
    expect(publicationBlockReasons(review)).toEqual([]);
    expect(review.changeProposal.state).toBe("unknown");
    const publishedBefore = await repository.listActivities({ statuses: ["published"] });

    const approved = await repository.approveCandidate(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      reason: "Publish reviewed conflict resolution",
    });
    expect(approved.editorialStatus).toBe("published");

    const publishedAfter = await repository.listActivities({ statuses: ["published"] });
    expect(publishedAfter.items).toHaveLength(publishedBefore.items.length);
    const occurrence = publishedAfter.items.find((item) => item.id === "pub-fixture-E023-web-1900");
    expect(occurrence?.startLocal).toEqual(known("2026-10-07T18:45:00"));
  });

  it("removes only audited blocker resolutions from list reason codes and reason filters", async () => {
    const repository = new FixtureAdminRepository();
    const candidateId = "candidate-conflict-E023";
    const before = await repository.listCandidates();
    const itemBefore = before.items.find((item) => item.id === candidateId);
    expect(itemBefore?.reasonCodes).toContain("schedule");
    expect(itemBefore?.reasonCodes).toContain("essential_schedule_conflict");

    await repository.resolveCandidateBlocker(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      kind: "conflict",
      targetId: "conflict-E023-time",
      reason: "Reviewed schedule conflict",
    });
    const intermediate = (await repository.listCandidates()).items.find((item) => item.id === candidateId);
    expect(intermediate?.reasonCodes).not.toContain("schedule");
    expect(intermediate?.reasonCodes).toContain("essential_schedule_conflict");
    const scheduleMatches = await repository.listCandidates({ reason: "schedule" });
    expect(scheduleMatches.items.map((item) => item.id)).not.toContain(candidateId);

    await repository.resolveCandidateBlocker(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      kind: "rule",
      targetId: "rule-E023-conflict",
      reason: "Blocking rule reviewed",
    });
    const finalItem = (await repository.listCandidates()).items.find((item) => item.id === candidateId);
    expect(finalItem?.reasonCodes).not.toContain("essential_schedule_conflict");
    const ruleMatches = await repository.listCandidates({ reason: "essential_schedule_conflict" });
    expect(ruleMatches.items.map((item) => item.id)).not.toContain(candidateId);
  });

  it.each(["accepted", "rejected"] as const)(
    "refuses to overwrite an overlapping saved editorial correction when a proposal is %s",
    async (disposition) => {
      const repository = new FixtureAdminRepository();
      const candidateId = "candidate-change-E023";
      await repository.updateCandidateFinal(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        corrections: { startLocal: known("2026-10-07T18:45:00") },
        reason: "Reviewer confirmed an alternative time",
      });
      const candidateBefore = await repository.getCandidate(candidateId);
      const publishedBefore = (await repository.listActivities({ statuses: ["published"] })).items;

      await expect(
        repository.resolveCandidateBlocker(candidateId, {
          actor: reviewer,
          expectedVersion: await currentVersion(repository, candidateId),
          kind: "change_proposal",
          targetId: "change-E023-time",
          disposition,
          reason: "Proposal must not discard the saved time",
        }),
      ).rejects.toThrow("Saved editorial correction for startLocal conflicts");

      expect(await repository.getCandidate(candidateId)).toEqual(candidateBefore);
      expect((await repository.listActivities({ statuses: ["published"] })).items).toEqual(publishedBefore);
    },
  );

  it("resolves pending match and change-proposal publication guards explicitly", async () => {
    const repository = new FixtureAdminRepository();

    await repository.resolveCandidateBlocker("candidate-possible-duplicate-E019-mirror", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-possible-duplicate-E019-mirror"),
      kind: "match",
      targetId: "match-fixture-E019",
      disposition: "distinct",
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
      disposition: "accepted",
      reason: "Essential schedule change reviewed editorially",
    });
    const changeCandidate = await repository.getCandidate("candidate-change-E023");
    if (!changeCandidate || changeCandidate.changeProposal.state !== "known") {
      throw new Error("Expected change fixture");
    }
    expect(publicationBlockReasons(changeCandidate)).not.toContain("pending_essential_change");
    expect(changeCandidate.changeProposal.value.status).toBe("approved");
    expect(changeCandidate.blockerResolutions?.at(-1)?.disposition).toBe("accepted");

    const published = await repository.listActivities({ statuses: ["published"] });
    const updatedOccurrence = published.items.find((item) => item.id === "pub-fixture-E023-web-1900");
    expect(updatedOccurrence?.startLocal).toEqual(known("2026-10-07T18:30:00"));
  });

  it("requires a match decision and rejects confirmed duplicates without publishing", async () => {
    const repository = new FixtureAdminRepository();
    const candidateId = "candidate-possible-duplicate-E019-mirror";
    const before = await repository.getCandidate(candidateId);

    await expect(
      repository.resolveCandidateBlocker(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        kind: "match",
        targetId: "match-fixture-E019",
        reason: "A generic resolution is insufficient",
      }),
    ).rejects.toThrow("requires a distinct or duplicate disposition");
    expect(await repository.getCandidate(candidateId)).toEqual(before);

    const confirmed = await repository.resolveCandidateBlocker(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      kind: "match",
      targetId: "match-fixture-E019",
      disposition: "duplicate",
      reason: "The source mirrors the existing candidate",
    });
    expect(confirmed.editorialStatus).toBe("rejected");
    expect(confirmed.blockerResolutions?.at(-1)?.disposition).toBe("duplicate");
    expect(publicationBlockReasons(confirmed)).toContain("confirmed_duplicate");
    expect(confirmed.history.some((item) => item.action === "rejected")).toBe(true);

    await expect(
      repository.approveCandidate(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        reason: "This must not create a second published event",
      }),
    ).rejects.toThrow("terminal state rejected");
    expect((await repository.listActivities({ statuses: ["published"] })).items).toHaveLength(1);
  });

  it.each(["accepted", "rejected"] as const)(
    "does not audit a second correction when approving a %s proposal with no other changes",
    async (disposition) => {
      const repository = new FixtureAdminRepository();
      const candidateId = "candidate-change-E023";
      await repository.resolveCandidateBlocker(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        kind: "change_proposal",
        targetId: "change-E023-time",
        disposition,
        reason: "Proposal decision",
      });
      await repository.resolveCandidateBlocker(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        kind: "rule",
        targetId: "rule-change-E023",
        reason: "Rule reviewed",
      });
      const internal = repository as unknown as { published: PublishedOccurrence[] };
      const before = structuredClone(internal.published[0]);

      const approved = await repository.approveCandidate(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        reason: "Approval without additional corrections",
      });
      expect(approved.editorialStatus).toBe("published");
      expect(internal.published[0].history).toEqual(before.history);
      expect(internal.published[0].event).toEqual(before.event);
    },
  );

  it("rejects a change proposal without modifying the published occurrence", async () => {
    const repository = new FixtureAdminRepository();

    await repository.resolveCandidateBlocker("candidate-change-E023", {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, "candidate-change-E023"),
      kind: "change_proposal",
      targetId: "change-E023-time",
      disposition: "rejected",
      reason: "Keep the currently published schedule",
    });

    const candidate = await repository.getCandidate("candidate-change-E023");
    if (!candidate || candidate.changeProposal.state !== "known") throw new Error("Expected change fixture");
    expect(candidate.changeProposal.value.status).toBe("rejected");
    expect(candidate.final.startLocal).toEqual(known("2026-10-07T19:00:00"));

    const published = await repository.listActivities({ statuses: ["published"] });
    const occurrence = published.items.find((item) => item.id === "pub-fixture-E023-web-1900");
    expect(occurrence?.startLocal).toEqual(known("2026-10-07T19:00:00"));
  });

  it("does not record acceptance when the target published occurrence is missing", async () => {
    const repository = new FixtureAdminRepository();
    const before = await repository.getCandidate("candidate-change-E023");
    const internal = repository as unknown as { published: Array<{ id: string }> };
    internal.published.splice(0, internal.published.length);

    await expect(
      repository.resolveCandidateBlocker("candidate-change-E023", {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, "candidate-change-E023"),
        kind: "change_proposal",
        targetId: "change-E023-time",
        disposition: "accepted",
        reason: "Accept only if the published occurrence can be updated",
      }),
    ).rejects.toThrow("Published occurrence does not exist");

    expect(await repository.getCandidate("candidate-change-E023")).toEqual(before);
  });

  it("refuses a stale competing proposal against an already updated occurrence", async () => {
    const repository = new FixtureAdminRepository();
    const original = await repository.getCandidate("candidate-change-E023");
    if (!original || original.changeProposal.state !== "known") throw new Error("Missing change fixture");

    const competing = structuredClone(original);
    competing.id = "candidate-change-E023-competing";
    if (competing.changeProposal.state !== "known") throw new Error("Missing competing proposal");
    competing.changeProposal.value.id = "change-E023-competing";
    const internal = repository as unknown as { candidates: AdminCandidate[]; published: PublishedOccurrence[] };
    internal.candidates.push(competing);

    await repository.resolveCandidateBlocker(original.id, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, original.id),
      kind: "change_proposal",
      targetId: "change-E023-time",
      disposition: "accepted",
      reason: "First reviewer confirms new time",
    });

    const beforeAttempt = await repository.getCandidate(competing.id);
    await expect(
      repository.resolveCandidateBlocker(competing.id, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, competing.id),
        kind: "change_proposal",
        targetId: "change-E023-competing",
        disposition: "accepted",
        reason: "Stale reviewer attempts to overwrite the current occurrence",
      }),
    ).rejects.toThrow("Stale change proposal");

    expect(await repository.getCandidate(competing.id)).toEqual(beforeAttempt);
    expect(internal.published[0].event.startLocal).toEqual(known("2026-10-07T18:30:00"));
    expect(internal.published[0].history).toHaveLength(2);
  });

  it("lets reviewers decide nonessential proposals and blocks silent publication", async () => {
    const repository = new FixtureAdminRepository();
    const internal = repository as unknown as { candidates: AdminCandidate[] };
    const candidate = internal.candidates.find((item) => item.id === "candidate-change-E023");
    if (!candidate || candidate.changeProposal.state !== "known") throw new Error("Missing change fixture");
    candidate.changeProposal.value.essential = false;

    expect(publicationBlockReasons(candidate)).toContain("pending_change_proposal");
    await repository.resolveCandidateBlocker(candidate.id, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidate.id),
      kind: "change_proposal",
      targetId: candidate.changeProposal.value.id,
      disposition: "rejected",
      reason: "Nonessential observation not corroborated",
    });

    const resolved = await repository.getCandidate(candidate.id);
    if (!resolved || resolved.changeProposal.state !== "known") throw new Error("Missing proposal");
    expect(resolved.changeProposal.value.status).toBe("rejected");
    expect(publicationBlockReasons(resolved)).not.toContain("pending_change_proposal");
  });

  it("updates both organizer projections when accepting an organizer change", async () => {
    const repository = new FixtureAdminRepository();
    const internal = repository as unknown as { candidates: AdminCandidate[]; published: PublishedOccurrence[] };
    const candidate = internal.candidates.find((item) => item.id === "candidate-change-E023");
    if (!candidate || candidate.changeProposal.state !== "known") throw new Error("Missing change fixture");
    candidate.changeProposal.value.fields.push({
      field: "organizerId",
      before: known("O022"),
      after: known("O033"),
      evidenceIds: ["ev-change-E023-meetup"],
    });

    const updated = await repository.resolveCandidateBlocker(candidate.id, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidate.id),
      kind: "change_proposal",
      targetId: candidate.changeProposal.value.id,
      disposition: "accepted",
      reason: "New organizer verified",
    });

    expect(updated.organizerId).toEqual(known("O033"));
    expect(updated.final.organizerId).toEqual(known("O033"));
    expect(internal.published[0].organizerId).toBe("O033");
    expect(internal.published[0].event.organizerId).toEqual(known("O033"));
    const byOrganizer = await repository.listActivities({ organizerId: "O033", statuses: ["published"] });
    expect(byOrganizer.items.map((item) => item.id)).toContain("pub-fixture-E023-web-1900");
  });

  it("rejects invalid proposed organizers without mutating either record", async () => {
    const repository = new FixtureAdminRepository();
    const internal = repository as unknown as { candidates: AdminCandidate[]; published: PublishedOccurrence[] };
    const candidate = internal.candidates.find((item) => item.id === "candidate-change-E023");
    if (!candidate || candidate.changeProposal.state !== "known") throw new Error("Missing change fixture");
    candidate.changeProposal.value.fields.push({
      field: "organizerId",
      before: known("O022"),
      after: known("O999"),
      evidenceIds: [],
    });
    const candidateBefore = structuredClone(candidate);
    const publishedBefore = structuredClone(internal.published[0]);

    await expect(
      repository.resolveCandidateBlocker(candidate.id, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidate.id),
        kind: "change_proposal",
        targetId: candidate.changeProposal.value.id,
        disposition: "accepted",
        reason: "Unknown organizer",
      }),
    ).rejects.toThrow("organizer does not exist");
    expect(candidate).toEqual(candidateBefore);
    expect(internal.published[0]).toEqual(publishedBefore);
  });

  it("publishes saved and approval-time editorial corrections to the existing occurrence", async () => {
    const repository = new FixtureAdminRepository();
    const candidateId = "candidate-change-E023";
    await repository.updateCandidateFinal(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      corrections: { description: known("Verified updated description") },
      reason: "Description checked with organizer",
    });
    await repository.resolveCandidateBlocker(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      kind: "change_proposal",
      targetId: "change-E023-time",
      disposition: "accepted",
      reason: "Accepted revised time",
    });
    await repository.resolveCandidateBlocker(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      kind: "rule",
      targetId: "rule-change-E023",
      reason: "Change revalidated",
    });
    const before = await repository.listActivities({ statuses: ["published"] });

    const approved = await repository.approveCandidate(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      corrections: { level: known("All levels accepted") },
      reason: "Publish verified editorial corrections",
    });

    const internal = repository as unknown as { published: PublishedOccurrence[] };
    const occurrence = internal.published.find((item) => item.id === "pub-fixture-E023-web-1900");
    expect(approved.editorialStatus).toBe("published");
    expect(occurrence?.event.startLocal).toEqual(known("2026-10-07T18:30:00"));
    expect(occurrence?.event.description).toEqual(known("Verified updated description"));
    expect(occurrence?.event.level).toEqual(known("All levels accepted"));
    expect(occurrence?.protectedCorrections).toEqual(expect.arrayContaining(["description", "level"]));
    expect(internal.published).toHaveLength(before.items.length);
  });

  it.each(["saved", "approval-time"] as const)(
    "rejects a stale %s title correction after another candidate updates the same occurrence",
    async (timing) => {
      const repository = new FixtureAdminRepository();
      const candidateId = "candidate-change-E023";
      const original = await repository.getCandidate(candidateId);
      if (!original || original.changeProposal.state !== "known") throw new Error("Missing change fixture");
      const competing = structuredClone(original);
      competing.id = "candidate-change-E023-concurrent-title";
      if (competing.changeProposal.state !== "known") throw new Error("Missing competing change fixture");
      competing.changeProposal.value.id = "change-E023-concurrent-title";

      const internal = repository as unknown as { candidates: AdminCandidate[]; published: PublishedOccurrence[] };
      const occurrence = internal.published.find((item) => item.id === "pub-fixture-E023-web-1900");
      if (!occurrence) throw new Error("Missing published occurrence");
      competing.changeProposal.value.fields = [
        {
          field: "title",
          before: structuredClone(occurrence.event.title),
          after: known("Updated title from concurrent reviewer"),
          evidenceIds: [],
        },
      ];
      internal.candidates.push(competing);

      if (timing === "saved") {
        await repository.updateCandidateFinal(candidateId, {
          actor: reviewer,
          expectedVersion: await currentVersion(repository, candidateId),
          corrections: { title: known("Editorial title from original reviewer") },
          reason: "Saved before concurrent publication",
        });
      }

      await repository.resolveCandidateBlocker(competing.id, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, competing.id),
        kind: "change_proposal",
        targetId: "change-E023-concurrent-title",
        disposition: "accepted",
        reason: "Concurrent title approved",
      });
      await repository.resolveCandidateBlocker(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        kind: "change_proposal",
        targetId: "change-E023-time",
        disposition: "rejected",
        reason: "Retain original time",
      });
      await repository.resolveCandidateBlocker(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        kind: "rule",
        targetId: "rule-change-E023",
        reason: "Rule reviewed",
      });

      const beforeApproval = await repository.getCandidate(candidateId);
      const beforeOccurrence = structuredClone(occurrence);
      await expect(
        repository.approveCandidate(candidateId, {
          actor: reviewer,
          expectedVersion: await currentVersion(repository, candidateId),
          ...(timing === "approval-time"
            ? { corrections: { title: known("Editorial title from original reviewer") } }
            : {}),
          reason: "Must not overwrite a newer published title",
        }),
      ).rejects.toThrow("Stale published occurrence correction: title");

      expect(await repository.getCandidate(candidateId)).toEqual(beforeApproval);
      expect(occurrence).toEqual(beforeOccurrence);
    },
  );

  it.each(["saved", "approval-time"] as const)(
    "permits an explicitly reviewed rebase before approving a %s correction",
    async (timing) => {
      const repository = new FixtureAdminRepository();
      const candidateId = "candidate-change-E023";
      const original = await repository.getCandidate(candidateId);
      if (!original || original.changeProposal.state !== "known") throw new Error("Missing change fixture");
      const competing = structuredClone(original);
      competing.id = "candidate-change-E023-rebase-peer";
      if (competing.changeProposal.state !== "known") throw new Error("Missing competing proposal");
      competing.changeProposal.value.id = "change-E023-rebase-peer";

      const internal = repository as unknown as { candidates: AdminCandidate[]; published: PublishedOccurrence[] };
      const occurrence = internal.published.find((item) => item.id === "pub-fixture-E023-web-1900");
      if (!occurrence) throw new Error("Missing published occurrence");
      competing.changeProposal.value.fields = [
        {
          field: "title",
          before: structuredClone(occurrence.event.title),
          after: known("Title from newer publication"),
          evidenceIds: [],
        },
      ];
      internal.candidates.push(competing);

      if (timing === "saved") {
        await repository.updateCandidateFinal(candidateId, {
          actor: reviewer,
          expectedVersion: await currentVersion(repository, candidateId),
          corrections: { title: known("Editorially verified title") },
        });
      }
      await repository.resolveCandidateBlocker(competing.id, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, competing.id),
        kind: "change_proposal",
        targetId: competing.changeProposal.value.id,
        disposition: "accepted",
        reason: "Other reviewer updated the title",
      });
      await repository.resolveCandidateBlocker(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        kind: "change_proposal",
        targetId: "change-E023-time",
        disposition: "rejected",
        reason: "Keep original schedule",
      });
      await repository.resolveCandidateBlocker(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        kind: "rule",
        targetId: "rule-change-E023",
        reason: "Rule checked",
      });

      const correction = { title: known("Editorially verified title") };
      const submittedCorrections = timing === "approval-time" ? { corrections: correction } : {};
      const before = await repository.getCandidate(candidateId);
      const current = await repository.getLinkedPublishedOccurrence(candidateId);
      if (!before || !current) throw new Error("Missing linked occurrence");

      await expect(
        repository.approveCandidate(candidateId, {
          actor: reviewer,
          expectedVersion: await currentVersion(repository, candidateId),
          ...submittedCorrections,
          reason: "Must first review published changes",
        }),
      ).rejects.toThrow("Stale published occurrence correction: title");

      const refreshed = await repository.refreshCandidatePublishedBaseline(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        expectedOccurrenceVersion: publishedOccurrenceReviewVersion(current),
        reason: "Checked the latest title against original editorial evidence",
      });
      expect(refreshed.publishedBaseline?.event.title).toEqual(known("Title from newer publication"));
      expect(refreshed.final.title).toEqual(before.final.title);
      expect(refreshed.history.at(-1)?.action).toBe("baseline_refreshed");
      expect(occurrence.event.title).toEqual(known("Title from newer publication"));

      const approved = await repository.approveCandidate(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        ...submittedCorrections,
        reason: "Publish title after explicit renewed review",
      });
      expect(approved.editorialStatus).toBe("published");
      expect(occurrence.event.title).toEqual(known("Editorially verified title"));
      expect(internal.published).toHaveLength(1);
    },
  );

  it("refuses a baseline refresh when the published occurrence changed after it was viewed", async () => {
    const repository = new FixtureAdminRepository();
    const candidateId = "candidate-change-E023";
    const current = await repository.getLinkedPublishedOccurrence(candidateId);
    if (!current) throw new Error("Missing published occurrence");

    const internal = repository as unknown as { published: PublishedOccurrence[] };
    const occurrence = internal.published.find((item) => item.id === current.id);
    if (!occurrence) throw new Error("Missing published occurrence");
    occurrence.event.title = known("Newer concurrent title");

    const before = await repository.getCandidate(candidateId);
    await expect(
      repository.refreshCandidatePublishedBaseline(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        expectedOccurrenceVersion: publishedOccurrenceReviewVersion(current),
        reason: "Outdated review must not authorize a new baseline",
      }),
    ).rejects.toThrow("Published occurrence changed during re-review");
    expect(await repository.getCandidate(candidateId)).toEqual(before);
    expect(occurrence.event.title).toEqual(known("Newer concurrent title"));
  });

  it("requires an explicit reason and disallows a no-op baseline refresh", async () => {
    const repository = new FixtureAdminRepository();
    const candidateId = "candidate-change-E023";
    const current = await repository.getLinkedPublishedOccurrence(candidateId);
    if (!current) throw new Error("Missing published occurrence");

    await expect(
      repository.refreshCandidatePublishedBaseline(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        expectedOccurrenceVersion: publishedOccurrenceReviewVersion(current),
        reason: "No changes",
      }),
    ).rejects.toThrow("no new changes to review");

    const internal = repository as unknown as { published: PublishedOccurrence[] };
    internal.published[0].event.title = known("New title");
    await expect(
      repository.refreshCandidatePublishedBaseline(candidateId, {
        actor: reviewer,
        expectedVersion: await currentVersion(repository, candidateId),
        expectedOccurrenceVersion: publishedOccurrenceReviewVersion(internal.published[0]),
        reason: "",
      }),
    ).rejects.toThrow("non-empty reason");
  });

  it("allows independent editorial corrections after another candidate updates a different field", async () => {
    const repository = new FixtureAdminRepository();
    const candidateId = "candidate-change-E023";
    const original = await repository.getCandidate(candidateId);
    if (!original || original.changeProposal.state !== "known") throw new Error("Missing change fixture");
    const competing = structuredClone(original);
    competing.id = "candidate-change-E023-independent";
    if (competing.changeProposal.state !== "known") throw new Error("Missing competing proposal");
    competing.changeProposal.value.id = "change-E023-independent";

    const internal = repository as unknown as { candidates: AdminCandidate[]; published: PublishedOccurrence[] };
    const occurrence = internal.published.find((item) => item.id === "pub-fixture-E023-web-1900");
    if (!occurrence) throw new Error("Missing published occurrence");
    competing.changeProposal.value.fields = [
      {
        field: "title",
        before: structuredClone(occurrence.event.title),
        after: known("Concurrent title"),
        evidenceIds: [],
      },
    ];
    internal.candidates.push(competing);

    await repository.updateCandidateFinal(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      corrections: { description: known("Verified independent description") },
    });
    await repository.resolveCandidateBlocker(competing.id, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, competing.id),
      kind: "change_proposal",
      targetId: "change-E023-independent",
      disposition: "accepted",
      reason: "Concurrent title accepted",
    });
    await repository.resolveCandidateBlocker(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      kind: "change_proposal",
      targetId: "change-E023-time",
      disposition: "rejected",
      reason: "No time adjustment",
    });
    await repository.resolveCandidateBlocker(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      kind: "rule",
      targetId: "rule-change-E023",
      reason: "Rule reviewed",
    });

    const approved = await repository.approveCandidate(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      reason: "Independent description correction",
    });
    expect(approved.editorialStatus).toBe("published");
    expect(occurrence.event.title).toEqual(known("Concurrent title"));
    expect(occurrence.event.description).toEqual(known("Verified independent description"));
  });

  it("refreshes the reviewed baseline for a proposal accepted by the same candidate", async () => {
    const repository = new FixtureAdminRepository();
    const candidateId = "candidate-change-E023";
    await repository.resolveCandidateBlocker(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      kind: "change_proposal",
      targetId: "change-E023-time",
      disposition: "accepted",
      reason: "Accept proposal",
    });
    await repository.resolveCandidateBlocker(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      kind: "rule",
      targetId: "rule-change-E023",
      reason: "Rule reviewed",
    });

    const approved = await repository.approveCandidate(candidateId, {
      actor: reviewer,
      expectedVersion: await currentVersion(repository, candidateId),
      corrections: { startLocal: known("2026-10-07T18:45:00") },
      reason: "Edit approved occurrence time again",
    });
    expect(approved.editorialStatus).toBe("published");
    expect(
      (await repository.listActivities({ statuses: ["published"] })).items.find(
        (item) => item.id === "pub-fixture-E023-web-1900",
      )?.startLocal,
    ).toEqual(known("2026-10-07T18:45:00"));
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
