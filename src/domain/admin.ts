export const activityCategories = [
  "pilates",
  "yoga",
  "fitness",
  "dance_fitness",
  "beach_sports",
  "cycling",
  "team_sports",
  "hiking",
  "water_sports",
  "padel",
  "running",
  "barre",
  "cross_training",
  "multi_sport",
] as const;

export type ActivityCategory = (typeof activityCategories)[number];

export const editorialStatuses = [
  "candidate",
  "review",
  "blocked",
  "published",
  "rejected",
  "cancelled",
  "archived",
] as const;

export type EditorialStatus = (typeof editorialStatuses)[number];

export const temporalStatuses = ["upcoming", "ongoing", "past", "unknown"] as const;
export type TemporalStatus = (typeof temporalStatuses)[number];

export const unknownReasons = ["not_observed", "not_provided", "not_verified", "conflict", "not_applicable"] as const;

export type UnknownReason = (typeof unknownReasons)[number];

export type FieldValue<T> = { state: "known"; value: T } | { state: "unknown"; reason: UnknownReason; note?: string };

export function known<T>(value: T): FieldValue<T> {
  return { state: "known", value };
}

export function unknown<T>(reason: UnknownReason, note?: string): FieldValue<T> {
  return note === undefined ? { state: "unknown", reason } : { state: "unknown", reason, note };
}

export function isKnown<T>(value: FieldValue<T>): value is { state: "known"; value: T } {
  return value.state === "known";
}

export type PriceKind =
  | "free"
  | "fixed"
  | "trial"
  | "payment_variant"
  | "transport_included"
  | "membership"
  | "annual_membership"
  | "annual_insurance"
  | "donation";

export interface PriceOption {
  amount: number;
  currency: "EUR";
  label?: string;
  paymentMethod?: string;
  condition?: string;
}

export interface PriceDetails {
  kind: PriceKind;
  options: PriceOption[];
  perSessionComparable: boolean;
  note?: string;
}

export interface EventDetails {
  title: FieldValue<string>;
  description: FieldValue<string>;
  category: FieldValue<ActivityCategory>;
  startLocal: FieldValue<string>;
  endLocal: FieldValue<string>;
  timezone: FieldValue<"Europe/Madrid">;
  location: FieldValue<string>;
  departureCity: FieldValue<string>;
  destination: FieldValue<string>;
  organizerId: FieldValue<string>;
  price: FieldValue<PriceDetails>;
  languages: FieldValue<string[]>;
  level: FieldValue<string>;
  registrationUrl: FieldValue<string>;
  individualAccess: FieldValue<boolean>;
}

export interface Organizer {
  id: string;
  name: string;
  categories: ActivityCategory[];
  city: FieldValue<string>;
  channels: string[];
  status: "candidate" | "reviewed" | "blocked";
  sourceUrl: string;
  checkedAt: string;
  confirmedAt: FieldValue<string>;
  membersObserved: FieldValue<number>;
  websiteUrl: FieldValue<string>;
  notes: string[];
}

export type EvidenceMethod = "page" | "search" | "structured" | "import" | "manual";
export type EvidenceSourceRole =
  "organizer_published" | "aggregator" | "search_result" | "booking_platform" | "community_platform" | "import";

export interface EvidenceRecord {
  id: string;
  sourceId: string;
  sourceUrl: string;
  sourceRole: EvidenceSourceRole;
  method: EvidenceMethod;
  capturedAt: string;
  externalId: FieldValue<string>;
  fields: string[];
  excerpt: FieldValue<string>;
}

export type RuleOutcome = "pass" | "warning" | "block";

export interface RuleEvaluation {
  id: string;
  code: string;
  outcome: RuleOutcome;
  field: FieldValue<keyof EventDetails>;
  reason: string;
  evidenceIds: string[];
}

export type AiEvaluation =
  | { state: "not_run"; reason: string }
  | { state: "failed"; reason: string; evaluatedAt: string; provider: FieldValue<string> }
  | {
      state: "completed";
      evaluatedAt: string;
      provider: string;
      modelVersion: string;
      promptVersion: string;
      suitability: "suitable" | "not_suitable" | "uncertain";
      proposedCategory: FieldValue<ActivityCategory>;
      modelReportedConfidence: FieldValue<number>;
      reasons: string[];
      missingFields: (keyof EventDetails)[];
      conflictIds: string[];
      evidenceIds: string[];
    };

export const conflictTypes = [
  "schedule",
  "price",
  "location",
  "identity",
  "access",
  "source_disagreement",
  "other",
] as const;

export type ConflictType = (typeof conflictTypes)[number];

export interface Conflict {
  id: string;
  type: ConflictType;
  status: "open" | "resolved";
  blocking: boolean;
  field: FieldValue<keyof EventDetails>;
  summary: string;
  evidenceIds: string[];
}

export type MatchRelation =
  "exact_source_identity" | "same_event" | "same_series" | "possible_duplicate" | "different_event";

export interface CandidateMatch {
  id: string;
  targetId: string;
  relation: MatchRelation;
  status: "pending" | "confirmed" | "rejected";
  signals: string[];
  evidenceIds: string[];
}

export interface ChangeField {
  field: keyof EventDetails;
  before: FieldValue<unknown>;
  after: FieldValue<unknown>;
  evidenceIds: string[];
}

export interface ChangeProposal {
  id: string;
  publishedOccurrenceId: string;
  status: "pending" | "approved" | "rejected";
  essential: boolean;
  fields: ChangeField[];
  detectedAt: string;
}

export interface EditorialActor {
  id: string;
  role: "admin" | "reviewer" | "system";
  displayName: string;
}

export const candidateBlockerKinds = ["conflict", "rule", "match", "change_proposal"] as const;
export type CandidateBlockerKind = (typeof candidateBlockerKinds)[number];

export interface CandidateBlockerResolution {
  id: string;
  kind: CandidateBlockerKind;
  targetId: string;
  disposition?: "accepted" | "rejected" | "distinct" | "duplicate";
  at: string;
  actor: EditorialActor;
  reason: string;
}

export type EditorialAction =
  | "captured"
  | "normalized"
  | "review_requested"
  | "approved"
  | "published"
  | "corrected"
  | "rejected"
  | "blocked"
  | "unblocked"
  | "blocker_resolved"
  | "baseline_refreshed"
  | "requery_requested"
  | "reprocess_requested"
  | "cancelled"
  | "archived";

export interface EditorialHistoryEntry {
  id: string;
  action: EditorialAction;
  at: string;
  actor: EditorialActor;
  reason: FieldValue<string>;
}

export interface AdminCandidate {
  id: string;
  sourceRecordId: string;
  sourceId: string;
  runId: FieldValue<string>;
  organizerId: FieldValue<string>;
  editorialStatus: EditorialStatus;
  temporalStatus: TemporalStatus;
  lastCheckedAt: string;
  extracted: EventDetails;
  final: EventDetails;
  evidence: EvidenceRecord[];
  rules: RuleEvaluation[];
  aiEvaluation: AiEvaluation;
  conflicts: Conflict[];
  matches: CandidateMatch[];
  changeProposal: FieldValue<ChangeProposal>;
  /** Published values observed when editorial review began; used to reject stale manual corrections. */
  publishedBaseline?: { occurrenceId: string; event: EventDetails };
  blockerResolutions?: CandidateBlockerResolution[];
  history: EditorialHistoryEntry[];
}

export interface PublishedOccurrence {
  id: string;
  sourceRecordIds: string[];
  organizerId: string;
  editorialStatus: "published" | "cancelled" | "archived";
  temporalStatus: TemporalStatus;
  publishedAt: string;
  lastCheckedAt: string;
  event: EventDetails;
  evidenceIds: string[];
  protectedCorrections: (keyof EventDetails)[];
  history: EditorialHistoryEntry[];
}

export type PublicationPolicy = "capture_only" | "capture_and_evaluate" | "human_review" | "auto_publish";

export type SourceStatus = "active" | "paused" | "blocked" | "proposed";

export interface SourceConfig {
  id: string;
  name: string;
  type: string;
  priority: "P1" | "P2" | "P3";
  status: SourceStatus;
  coverage: string[];
  accessMethod: string;
  observedFields: string[];
  allowedUrls: string[];
  frequency: FieldValue<string>;
  publicationPolicy: PublicationPolicy;
  autoPublishMode: "disabled" | "simulation" | "enabled";
  lastRunAt: FieldValue<string>;
  budget: FieldValue<{ amount: number; currency: "EUR"; period: string }>;
  capabilities: string[];
  limitations: string[];
  notes: string[];
}

export type RunStatus = "queued" | "running" | "succeeded" | "partial" | "failed";

export interface RunCounters {
  discovered: number;
  created: number;
  updated: number;
  discarded: number;
  review: number;
}

export interface EngineRun {
  id: string;
  kind: "discovery" | "capture" | "reprocess";
  sourceId: FieldValue<string>;
  query: FieldValue<string>;
  startedAt: string;
  finishedAt: FieldValue<string>;
  durationSeconds: FieldValue<number>;
  status: RunStatus;
  counters: RunCounters;
  cost: FieldValue<{ amount: number; currency: "EUR" }>;
  incident: FieldValue<string>;
  retryCount: number;
}

export interface ActivityListItem {
  id: string;
  kind: "candidate" | "published";
  title: FieldValue<string>;
  category: FieldValue<ActivityCategory>;
  startLocal: FieldValue<string>;
  organizerId: FieldValue<string>;
  organizerName: FieldValue<string>;
  sourceId: FieldValue<string>;
  sourceName: FieldValue<string>;
  editorialStatus: EditorialStatus;
  temporalStatus: TemporalStatus;
  lastCheckedAt: string;
  reasonCodes: string[];
}

export interface ActivityFilters {
  statuses?: EditorialStatus[];
  sourceId?: string;
  organizerId?: string;
  category?: ActivityCategory;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CandidateFilters extends ActivityFilters {
  executionId?: string;
  reason?: string;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardSummary {
  metrics: {
    publishedActivities: FieldValue<number>;
    pendingCandidates: FieldValue<number>;
    conflicts: FieldValue<number>;
    activeSources: FieldValue<number>;
    runsToday: FieldValue<number>;
    coverageNext14Days: FieldValue<{ published: number; target: number; percent: number }>;
  };
  coverageTrend: FieldValue<Array<{ date: string; published: number; candidates: number }>>;
  statusDistribution: Array<{ status: EditorialStatus; count: number }>;
  categoryCoverage: Array<{
    category: ActivityCategory;
    candidateCount: number;
    publishedCount: number;
    target: FieldValue<number>;
  }>;
  urgentItems: Array<{
    id: string;
    kind: "conflict" | "incomplete" | "duplicate" | "source_incident" | "change";
    title: string;
    candidateId: FieldValue<string>;
    sourceId: FieldValue<string>;
    reason: string;
  }>;
}
