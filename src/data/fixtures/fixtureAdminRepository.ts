import type {
  ActivityFilters,
  ActivityListItem,
  AdminCandidate,
  CandidateFilters,
  DashboardSummary,
  EditorialAction,
  EditorialHistoryEntry,
  EngineRun,
  EventDetails,
  FieldValue,
  Organizer,
  PageResult,
  PublishedOccurrence,
  SourceConfig,
} from "@/domain/admin";
import { isCandidateBlockerResolved, parseAdminCandidate, publicationBlockReasons } from "@/domain/adminValidation";
import { assertExpectedCandidateVersion } from "@/domain/candidateReviewVersion";
import type {
  AdminRepository,
  CandidateActionInput,
  CandidateApprovalInput,
  CandidateBlockerResolutionInput,
  CandidateCorrectionInput,
  CandidateDecisionInput,
} from "../adminRepository";
import {
  candidateFixtures,
  organizerFixtures,
  publishedOccurrenceFixtures,
  runFixtures,
  sourceFixtures,
} from "./adminFixtures";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function valueOrUndefined<T>(field: FieldValue<T>): T | undefined {
  return field.state === "known" ? field.value : undefined;
}

function reasonCodes(candidate: AdminCandidate): string[] {
  return [
    ...candidate.rules.filter((rule) => rule.outcome !== "pass").map((rule) => rule.code),
    ...candidate.conflicts.filter((conflict) => conflict.status === "open").map((conflict) => conflict.type),
    ...candidate.matches.filter((match) => match.status === "pending").map(() => "possible_match"),
    ...(candidate.changeProposal.state === "known" && candidate.changeProposal.value.status === "pending"
      ? ["pending_change"]
      : []),
  ];
}

function candidateToListItem(candidate: AdminCandidate): ActivityListItem {
  const organizerName = organizerFixtures.find(
    (organizer) => organizer.id === valueOrUndefined(candidate.organizerId),
  )?.name;
  const sourceName = sourceFixtures.find((source) => source.id === candidate.sourceId)?.name;
  return {
    id: candidate.id,
    kind: "candidate",
    title: candidate.final.title,
    category: candidate.final.category,
    startLocal: candidate.final.startLocal,
    organizerId: candidate.organizerId,
    organizerName: organizerName
      ? { state: "known", value: organizerName }
      : { state: "unknown", reason: "not_observed" },
    sourceId: { state: "known", value: candidate.sourceId },
    sourceName: sourceName ? { state: "known", value: sourceName } : { state: "unknown", reason: "not_observed" },
    editorialStatus: candidate.editorialStatus,
    temporalStatus: candidate.temporalStatus,
    lastCheckedAt: candidate.lastCheckedAt,
    reasonCodes: reasonCodes(candidate),
  };
}

function publishedToListItem(occurrence: PublishedOccurrence): ActivityListItem {
  return {
    id: occurrence.id,
    kind: "published",
    title: occurrence.event.title,
    category: occurrence.event.category,
    startLocal: occurrence.event.startLocal,
    organizerId: { state: "known", value: occurrence.organizerId },
    organizerName: (() => {
      const name = organizerFixtures.find((organizer) => organizer.id === occurrence.organizerId)?.name;
      return name
        ? { state: "known" as const, value: name }
        : { state: "unknown" as const, reason: "not_observed" as const };
    })(),
    sourceId: {
      state: "unknown",
      reason: "not_observed",
      note: "Published fixture links evidence IDs rather than one canonical source.",
    },
    sourceName: { state: "unknown", reason: "not_observed" },
    editorialStatus: occurrence.editorialStatus,
    temporalStatus: occurrence.temporalStatus,
    lastCheckedAt: occurrence.lastCheckedAt,
    reasonCodes: [],
  };
}

const madridDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function normalizeLocalDateTimePrecision(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);
  if (!match) return value;

  const seconds = match[2] ?? "00";
  const milliseconds = (match[3] ?? "").padEnd(3, "0").slice(0, 3);
  return `${match[1]}:${seconds}.${milliseconds}`;
}

function toMadridLocalDateTime(value: string, boundary: "from" | "to"): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return boundary === "from" ? `${value}T00:00:00.000` : `${value}T23:59:59.999`;
  }

  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    return normalizeLocalDateTimePrecision(value);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const parts = Object.fromEntries(
    madridDateTimeFormatter
      .formatToParts(parsed)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const milliseconds = String(parsed.getUTCMilliseconds()).padStart(3, "0");

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}`;
}

function matchesFilters(item: ActivityListItem, filters: ActivityFilters): boolean {
  if (filters.statuses && !filters.statuses.includes(item.editorialStatus)) return false;
  if (filters.sourceId && valueOrUndefined(item.sourceId) !== filters.sourceId) return false;
  if (filters.organizerId && valueOrUndefined(item.organizerId) !== filters.organizerId) return false;
  if (filters.category && valueOrUndefined(item.category) !== filters.category) return false;

  const start = valueOrUndefined(item.startLocal);
  const normalizedStart = start ? normalizeLocalDateTimePrecision(start) : undefined;
  if (filters.dateFrom) {
    const normalizedDateFrom = toMadridLocalDateTime(filters.dateFrom, "from");
    if (!normalizedStart || normalizedStart < normalizedDateFrom) return false;
  }
  if (filters.dateTo) {
    const normalizedDateTo = toMadridLocalDateTime(filters.dateTo, "to");
    if (!normalizedStart || normalizedStart > normalizedDateTo) return false;
  }

  if (filters.search) {
    const normalizedSearch = filters.search.trim().toLocaleLowerCase("es");
    if (normalizedSearch.length > 0) {
      const title = valueOrUndefined(item.title)?.toLocaleLowerCase("es") ?? "";
      const organizerId = valueOrUndefined(item.organizerId);
      const organizerName =
        organizerFixtures.find((organizer) => organizer.id === organizerId)?.name.toLocaleLowerCase("es") ?? "";
      if (!title.includes(normalizedSearch) && !organizerName.includes(normalizedSearch)) return false;
    }
  }

  return true;
}

function paginate<T>(items: T[], filters: ActivityFilters): PageResult<T> {
  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

function historyEntry(
  candidate: AdminCandidate,
  action: EditorialAction,
  actor: CandidateActionInput["actor"],
  reason?: string,
): EditorialHistoryEntry {
  return {
    id: `history-${candidate.id}-${candidate.history.length + 1}`,
    action,
    at: new Date().toISOString(),
    actor: clone(actor),
    reason:
      reason && reason.trim().length > 0
        ? { state: "known", value: reason.trim() }
        : { state: "unknown", reason: "not_provided" },
  };
}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) throw new Error("A non-empty reason is required for this editorial decision.");
  return trimmed;
}

function assertValidActor(actor: CandidateActionInput["actor"]): void {
  if (!actor.id.trim() || !actor.displayName.trim() || !["admin", "reviewer", "system"].includes(actor.role)) {
    throw new Error("A valid editorial actor is required.");
  }
}

function applyCorrections(candidate: AdminCandidate, corrections?: Partial<EventDetails>): void {
  if (!corrections) return;
  candidate.final = { ...candidate.final, ...clone(corrections) };
}

function assertActionableCandidate(candidate: AdminCandidate, action: string): void {
  if (candidate.editorialStatus === "published") {
    throw new Error(`Published candidate cannot be ${action}; use the published occurrence lifecycle instead.`);
  }
  if (["rejected", "cancelled", "archived"].includes(candidate.editorialStatus)) {
    throw new Error(
      `Candidate in terminal state ${candidate.editorialStatus} cannot be ${action} without an explicit reopen operation.`,
    );
  }
}

function hasOpenCandidateBlocker(candidate: AdminCandidate, input: CandidateBlockerResolutionInput): boolean {
  switch (input.kind) {
    case "conflict":
      return candidate.conflicts.some(
        (conflict) => conflict.id === input.targetId && conflict.status === "open" && conflict.blocking,
      );
    case "rule":
      return candidate.rules.some((rule) => rule.id === input.targetId && rule.outcome === "block");
    case "match":
      return candidate.matches.some((match) => match.id === input.targetId && match.status === "pending");
    case "change_proposal":
      return (
        candidate.changeProposal.state === "known" &&
        candidate.changeProposal.value.id === input.targetId &&
        candidate.changeProposal.value.status === "pending" &&
        candidate.changeProposal.value.essential
      );
  }
}

export class FixtureAdminRepository implements AdminRepository {
  private candidates = clone(candidateFixtures);
  private published = clone(publishedOccurrenceFixtures);
  private protectedCorrectionFields = new Map<string, Set<keyof EventDetails>>();
  private sources = clone(sourceFixtures);
  private runs = clone(runFixtures);

  async getDashboardSummary(): Promise<DashboardSummary> {
    const openConflicts = this.candidates.reduce(
      (total, candidate) =>
        total +
        candidate.conflicts.filter(
          (conflict) => conflict.status === "open" && !isCandidateBlockerResolved(candidate, "conflict", conflict.id),
        ).length,
      0,
    );
    const pendingCandidates = this.candidates.filter((candidate) =>
      ["candidate", "review", "blocked"].includes(candidate.editorialStatus),
    ).length;
    const activeSources = this.sources.filter((source) => source.status === "active").length;

    const statuses = new Map<string, number>();
    for (const item of [
      ...this.candidates.filter((candidate) => candidate.editorialStatus !== "published").map(candidateToListItem),
      ...this.published.map(publishedToListItem),
    ]) {
      statuses.set(item.editorialStatus, (statuses.get(item.editorialStatus) ?? 0) + 1);
    }

    const categories = new Map<string, { candidateCount: number; publishedCount: number }>();
    for (const candidate of this.candidates.filter((item) => item.editorialStatus !== "published")) {
      const category = valueOrUndefined(candidate.final.category);
      if (!category) continue;
      const current = categories.get(category) ?? { candidateCount: 0, publishedCount: 0 };
      current.candidateCount += 1;
      categories.set(category, current);
    }
    for (const occurrence of this.published) {
      const category = valueOrUndefined(occurrence.event.category);
      if (!category) continue;
      const current = categories.get(category) ?? { candidateCount: 0, publishedCount: 0 };
      current.publishedCount += 1;
      categories.set(category, current);
    }

    return {
      metrics: {
        publishedActivities: {
          state: "known",
          value: this.published.filter((item) => item.editorialStatus === "published").length,
        },
        pendingCandidates: { state: "known", value: pendingCandidates },
        conflicts: { state: "known", value: openConflicts },
        activeSources: { state: "known", value: activeSources },
        runsToday: {
          state: "unknown",
          reason: "not_verified",
          note: "Fixture run timestamps are fixed research scenarios; they are not compared with the current clock.",
        },
        coverageNext14Days: {
          state: "unknown",
          reason: "not_verified",
          note: "The seed research contains candidates, not a confirmed published 14-day catalog.",
        },
      },
      coverageTrend: {
        state: "unknown",
        reason: "not_observed",
        note: "Dataset v0.1 is one snapshot and contains no historical coverage series.",
      },
      statusDistribution: Array.from(statuses.entries()).map(([status, count]) => ({
        status: status as DashboardSummary["statusDistribution"][number]["status"],
        count,
      })),
      categoryCoverage: Array.from(categories.entries()).map(([category, counts]) => ({
        category: category as DashboardSummary["categoryCoverage"][number]["category"],
        ...counts,
        target: { state: "unknown", reason: "not_observed" },
      })),
      urgentItems: this.candidates
        .filter((candidate) => ["candidate", "review", "blocked"].includes(candidate.editorialStatus))
        .flatMap((candidate) => {
          const items: DashboardSummary["urgentItems"] = [];
          for (const conflict of candidate.conflicts.filter(
            (item) => item.status === "open" && !isCandidateBlockerResolved(candidate, "conflict", item.id),
          )) {
            items.push({
              id: `urgent-${conflict.id}`,
              kind: "conflict",
              title: valueOrUndefined(candidate.final.title) ?? candidate.sourceRecordId,
              candidateId: { state: "known", value: candidate.id },
              sourceId: { state: "known", value: candidate.sourceId },
              reason: conflict.summary,
            });
          }
          if (
            candidate.matches.some(
              (match) => match.status === "pending" && !isCandidateBlockerResolved(candidate, "match", match.id),
            )
          ) {
            items.push({
              id: `urgent-match-${candidate.id}`,
              kind: "duplicate",
              title: valueOrUndefined(candidate.final.title) ?? candidate.sourceRecordId,
              candidateId: { state: "known", value: candidate.id },
              sourceId: { state: "known", value: candidate.sourceId },
              reason: "Candidate has a pending identity/match decision.",
            });
          }
          if (
            candidate.changeProposal.state === "known" &&
            candidate.changeProposal.value.status === "pending" &&
            !isCandidateBlockerResolved(candidate, "change_proposal", candidate.changeProposal.value.id)
          ) {
            items.push({
              id: `urgent-change-${candidate.id}`,
              kind: "change",
              title: valueOrUndefined(candidate.final.title) ?? candidate.sourceRecordId,
              candidateId: { state: "known", value: candidate.id },
              sourceId: { state: "known", value: candidate.sourceId },
              reason: "Essential change requires editorial review.",
            });
          }
          return items;
        }),
    };
  }

  async listActivities(filters: ActivityFilters = {}): Promise<PageResult<ActivityListItem>> {
    const items = [
      ...this.candidates.filter((candidate) => candidate.editorialStatus !== "published").map(candidateToListItem),
      ...this.published.map(publishedToListItem),
    ]
      .filter((item) => matchesFilters(item, filters))
      .sort((a, b) =>
        (valueOrUndefined(a.startLocal) ?? "9999").localeCompare(valueOrUndefined(b.startLocal) ?? "9999"),
      );
    return clone(paginate(items, filters));
  }

  async listCandidates(filters: CandidateFilters = {}): Promise<PageResult<ActivityListItem>> {
    let candidates = this.candidates.filter((candidate) => candidate.editorialStatus !== "published");
    if (filters.reason) {
      candidates = candidates.filter((candidate) => reasonCodes(candidate).includes(filters.reason ?? ""));
    }
    if (filters.executionId) {
      candidates = candidates.filter((candidate) => valueOrUndefined(candidate.runId) === filters.executionId);
    }

    const items = candidates
      .map(candidateToListItem)
      .filter((item) => matchesFilters(item, filters))
      .sort((a, b) =>
        (valueOrUndefined(a.startLocal) ?? "9999").localeCompare(valueOrUndefined(b.startLocal) ?? "9999"),
      );
    return clone(paginate(items, filters));
  }

  async getCandidate(candidateId: string): Promise<AdminCandidate | null> {
    const candidate = this.candidates.find((item) => item.id === candidateId);
    return candidate ? clone(candidate) : null;
  }

  async listOrganizers(): Promise<Organizer[]> {
    return clone(organizerFixtures);
  }

  async getOrganizer(organizerId: string): Promise<Organizer | null> {
    const organizer = organizerFixtures.find((item) => item.id === organizerId);
    return organizer ? clone(organizer) : null;
  }

  async updateCandidateFinal(candidateId: string, input: CandidateCorrectionInput): Promise<AdminCandidate> {
    const candidate = this.requireCandidate(candidateId);
    assertValidActor(input.actor);
    assertExpectedCandidateVersion(candidate, input.expectedVersion);
    assertActionableCandidate(candidate, "corrected");

    if (Object.keys(input.corrections).length === 0) return clone(candidate);

    const correctedCandidate = clone(candidate);
    applyCorrections(correctedCandidate, input.corrections);

    if (input.corrections.organizerId) {
      correctedCandidate.organizerId = clone(correctedCandidate.final.organizerId);
    }

    parseAdminCandidate(correctedCandidate);

    const organizerId = valueOrUndefined(correctedCandidate.final.organizerId);
    if (organizerId && !organizerFixtures.some((organizer) => organizer.id === organizerId)) {
      throw new Error(`Candidate organizer does not exist: ${organizerId}.`);
    }

    correctedCandidate.history.push(historyEntry(correctedCandidate, "corrected", input.actor, input.reason));

    const protectedFields = this.protectedCorrectionFields.get(candidateId) ?? new Set<keyof EventDetails>();
    for (const field of Object.keys(input.corrections) as (keyof EventDetails)[]) protectedFields.add(field);

    Object.assign(candidate, correctedCandidate);
    this.protectedCorrectionFields.set(candidateId, protectedFields);
    return clone(candidate);
  }

  async approveCandidate(candidateId: string, input: CandidateApprovalInput): Promise<AdminCandidate> {
    const candidate = this.requireCandidate(candidateId);
    assertValidActor(input.actor);
    assertExpectedCandidateVersion(candidate, input.expectedVersion);
    assertActionableCandidate(candidate, "approved again");
    const candidateForApproval = clone(candidate);

    applyCorrections(candidateForApproval, input.corrections);
    candidateForApproval.organizerId = clone(candidateForApproval.final.organizerId);
    parseAdminCandidate(candidateForApproval);

    const publicationBlocks = publicationBlockReasons(candidateForApproval);
    if (publicationBlocks.length > 0) {
      throw new Error(
        `Candidate cannot be approved while an essential block is open: ${publicationBlocks.join(", ")}.`,
      );
    }

    const organizerId = valueOrUndefined(candidateForApproval.final.organizerId);
    if (!organizerId) throw new Error("Candidate requires a known organizer before publication.");
    if (!organizerFixtures.some((organizer) => organizer.id === organizerId)) {
      throw new Error(`Candidate organizer does not exist: ${organizerId}.`);
    }

    if (input.corrections && Object.keys(input.corrections).length > 0) {
      candidateForApproval.history.push(historyEntry(candidateForApproval, "corrected", input.actor, input.reason));
    }
    candidateForApproval.editorialStatus = "published";
    candidateForApproval.history.push(historyEntry(candidateForApproval, "approved", input.actor, input.reason));
    candidateForApproval.history.push(historyEntry(candidateForApproval, "published", input.actor, input.reason));

    const publishedOccurrence = this.published.some((occurrence) =>
      occurrence.sourceRecordIds.includes(candidateForApproval.sourceRecordId),
    )
      ? null
      : {
          id: `published-${candidateForApproval.id}`,
          sourceRecordIds: [candidateForApproval.sourceRecordId],
          organizerId,
          editorialStatus: "published" as const,
          temporalStatus: candidateForApproval.temporalStatus,
          publishedAt: new Date().toISOString(),
          lastCheckedAt: candidateForApproval.lastCheckedAt,
          event: clone(candidateForApproval.final),
          evidenceIds: candidateForApproval.evidence.map((evidence) => evidence.id),
          protectedCorrections: Array.from(
            new Set<keyof EventDetails>([
              ...(this.protectedCorrectionFields.get(candidateId) ?? []),
              ...((input.corrections ? Object.keys(input.corrections) : []) as (keyof EventDetails)[]),
            ]),
          ),
          history: clone(candidateForApproval.history),
        };

    Object.assign(candidate, candidateForApproval);
    if (publishedOccurrence) this.published.push(publishedOccurrence);

    return clone(candidateForApproval);
  }

  async rejectCandidate(candidateId: string, input: CandidateDecisionInput): Promise<AdminCandidate> {
    const candidate = this.requireCandidate(candidateId);
    assertValidActor(input.actor);
    assertExpectedCandidateVersion(candidate, input.expectedVersion);
    assertActionableCandidate(candidate, "rejected");
    const reason = requireReason(input.reason);
    candidate.editorialStatus = "rejected";
    candidate.history.push(historyEntry(candidate, "rejected", input.actor, reason));
    return clone(candidate);
  }

  async blockCandidate(candidateId: string, input: CandidateDecisionInput): Promise<AdminCandidate> {
    const candidate = this.requireCandidate(candidateId);
    assertValidActor(input.actor);
    assertExpectedCandidateVersion(candidate, input.expectedVersion);
    assertActionableCandidate(candidate, "blocked");
    const reason = requireReason(input.reason);
    candidate.editorialStatus = "blocked";
    candidate.history.push(historyEntry(candidate, "blocked", input.actor, reason));
    return clone(candidate);
  }

  async unblockCandidate(candidateId: string, input: CandidateDecisionInput): Promise<AdminCandidate> {
    const candidate = this.requireCandidate(candidateId);
    assertValidActor(input.actor);
    assertExpectedCandidateVersion(candidate, input.expectedVersion);
    const reason = requireReason(input.reason);

    if (candidate.editorialStatus !== "blocked") {
      throw new Error(`Only a blocked candidate can be unblocked; current state is ${candidate.editorialStatus}.`);
    }

    candidate.editorialStatus = "review";
    candidate.history.push(historyEntry(candidate, "unblocked", input.actor, reason));
    return clone(candidate);
  }

  async resolveCandidateBlocker(candidateId: string, input: CandidateBlockerResolutionInput): Promise<AdminCandidate> {
    const candidate = this.requireCandidate(candidateId);
    assertValidActor(input.actor);
    assertExpectedCandidateVersion(candidate, input.expectedVersion);
    assertActionableCandidate(candidate, "updated");
    const reason = requireReason(input.reason);

    if (isCandidateBlockerResolved(candidate, input.kind, input.targetId)) {
      throw new Error(`Candidate blocker is already resolved: ${input.kind}:${input.targetId}.`);
    }

    if (!hasOpenCandidateBlocker(candidate, input)) {
      throw new Error(`Unknown or non-blocking candidate blocker: ${input.kind}:${input.targetId}.`);
    }

    candidate.blockerResolutions ??= [];
    candidate.blockerResolutions.push({
      id: `blocker-resolution-${candidate.id}-${candidate.blockerResolutions.length + 1}`,
      kind: input.kind,
      targetId: input.targetId,
      at: new Date().toISOString(),
      actor: clone(input.actor),
      reason,
    });
    candidate.history.push(
      historyEntry(candidate, "blocker_resolved", input.actor, `${input.kind}:${input.targetId} · ${reason}`),
    );
    parseAdminCandidate(candidate);
    return clone(candidate);
  }

  async requestRequery(candidateId: string, input: CandidateActionInput): Promise<AdminCandidate> {
    const candidate = this.requireCandidate(candidateId);
    assertValidActor(input.actor);
    assertExpectedCandidateVersion(candidate, input.expectedVersion);
    assertActionableCandidate(candidate, "requeried");
    candidate.history.push(historyEntry(candidate, "requery_requested", input.actor, input.reason));
    return clone(candidate);
  }

  async requestReprocess(candidateId: string, input: CandidateActionInput): Promise<AdminCandidate> {
    const candidate = this.requireCandidate(candidateId);
    assertValidActor(input.actor);
    assertExpectedCandidateVersion(candidate, input.expectedVersion);
    assertActionableCandidate(candidate, "reprocessed");
    candidate.history.push(historyEntry(candidate, "reprocess_requested", input.actor, input.reason));
    return clone(candidate);
  }

  async listSources(): Promise<SourceConfig[]> {
    return clone(this.sources);
  }

  async listRuns(): Promise<EngineRun[]> {
    return clone(this.runs);
  }

  private requireCandidate(candidateId: string): AdminCandidate {
    const candidate = this.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw new Error(`Unknown candidate: ${candidateId}`);
    return candidate;
  }
}
