import "server-only";

export type ReadErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "READ_CONFLICT"
  | "READ_UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "INCOMPATIBLE_CONTRACT";

export class DiscoveryReadError extends Error {
  constructor(readonly code: ReadErrorCode) {
    super(code);
    this.name = "DiscoveryReadError";
  }
}

export interface DiscoveryPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface DiscoveryClassification {
  kind: string;
  reason: string | null;
  sourceFamily: string | null;
  proposedAdapterKey: string | null;
  knownSourceId: string | null;
  ruleVersion: number;
  classifiedAt: string;
}

export interface DiscoveryObservation {
  id: string;
  candidateId: string | null;
  knownSourceId: string | null;
  queryId: string;
  executionId: string;
  providerKey: string;
  originalUrl: string;
  observedAt: string;
  title: string | null;
  snippet: string | null;
  resultPosition: number | null;
}

export interface DiscoveryReview {
  id: string;
  decision: string;
  reviewerRef: string | null;
  reasonCode: string;
  reviewedAt: string;
}

export interface DiscoveryCandidate {
  id: string;
  canonicalUrl: string;
  firstObservedAt: string;
  lastObservedAt: string;
  reviewStatus: string;
  latestReviewId: string | null;
  linkedSourceId: string | null;
  classification: DiscoveryClassification | null;
  observationCount: number;
  minPosition: number | null;
  maxPosition: number | null;
  latestObservation: DiscoveryObservation | null;
  source: { id: string; status: string; enabled: boolean | null; adapterKey: string | null } | null;
  latestReview: DiscoveryReview | null;
}

export interface DiscoveryCandidateDetail {
  candidate: DiscoveryCandidate;
  promotion: { sourceId: string; reviewId: string; reusedSource: boolean; promotedAt: string } | null;
}

export interface DiscoveryProvider {
  providerKey: string;
  displayName: string;
  enabled: boolean;
  maxRequestsPerExecution: number | null;
  dailyRequestCap: number | null;
  monthlyRequestCap: number | null;
}

export interface DiscoveryQuery {
  id: string;
  providerKey: string;
  expression: string | null;
  enabled: boolean;
  activityContext: string | null;
  geographicScope: string | null;
  localeHint: string | null;
  resultLimit: number | null;
  requestBudget: number | null;
  scheduleExpression: string | null;
  lastExecutionId: string | null;
  lastExecutionStatus: string | null;
  lastExecutionAt: string | null;
}

export interface DiscoveryExecution {
  id: string;
  queryId: string;
  providerKey: string;
  status: string;
  submissionState: string | null;
  recoveryState: string | null;
  originalExecutionId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  observed: number;
  candidatesCreated: number;
  candidatesReobserved: number | null;
  knownSources: number | null;
  invalidResults: number | null;
  providerFailures: number | null;
  countersVersion: number;
  providerRequestCount: number | null;
  failureCode: string | null;
  queryExpression: string | null;
  cost: number | null;
}

export interface CandidateFilters {
  reviewStatus?: string;
  classificationKind?: string;
  queryId?: string;
  providerKey?: string;
  executionId?: string;
  search?: string;
}

export interface DiscoveryReadRepository {
  candidates(filters?: CandidateFilters & PageArgs): Promise<DiscoveryPage<DiscoveryCandidate>>;
  candidate(id: string): Promise<DiscoveryCandidateDetail>;
  candidateObservations(id: string, page?: PageArgs): Promise<DiscoveryPage<DiscoveryObservation>>;
  candidateReviews(id: string, page?: PageArgs): Promise<DiscoveryPage<DiscoveryReview>>;
  providers(page?: PageArgs): Promise<DiscoveryPage<DiscoveryProvider>>;
  queries(page?: PageArgs): Promise<DiscoveryPage<DiscoveryQuery>>;
  executions(
    filters?: PageArgs & { providerKey?: string; queryId?: string },
  ): Promise<DiscoveryPage<DiscoveryExecution>>;
  execution(id: string): Promise<DiscoveryExecution>;
  executionObservations(id: string, page?: PageArgs): Promise<DiscoveryPage<DiscoveryObservation>>;
}

export interface PageArgs {
  cursor?: string;
  limit?: number;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const providerKeyPattern = /^[a-zA-Z0-9_-]{1,120}$/;
const maxBytes = 1024 * 1024;

export function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown): string {
  if (typeof value !== "string") throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
  return value;
}

export function requiredUuid(value: unknown): void {
  if (typeof value !== "string" || !uuid.test(value)) throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
}

function nullableString(value: unknown): void {
  if (value !== null) requiredString(value);
}

function nullableUuid(value: unknown): void {
  if (value !== null) requiredUuid(value);
}

function requiredInteger(value: unknown): void {
  if (!Number.isSafeInteger(value)) throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
}

function nullableInteger(value: unknown): void {
  if (value !== null) requiredInteger(value);
}

export function requiredBoolean(value: unknown): void {
  if (typeof value !== "boolean") throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
}

function requiredStrings(item: Record<string, unknown>, ...fields: string[]): void {
  for (const field of fields) requiredString(item[field]);
}

function nullableStrings(item: Record<string, unknown>, ...fields: string[]): void {
  for (const field of fields) nullableString(item[field]);
}

export function checkId(value: string): void {
  if (!uuid.test(value)) throw new DiscoveryReadError("INVALID_REQUEST");
}

function checkObservationIdentity(item: Record<string, unknown>): void {
  const candidateIdValid = typeof item.candidateId === "string" && uuid.test(item.candidateId);
  const knownSourceIdValid = typeof item.knownSourceId === "string" && uuid.test(item.knownSourceId);
  if (candidateIdValid && item.knownSourceId === null) return;
  if (item.candidateId === null && knownSourceIdValid) return;
  throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
}

export function checkPage(value: unknown): asserts value is DiscoveryPage<unknown> {
  const item = record(value);
  if (
    !Array.isArray(item.items) ||
    item.items.length > 100 ||
    (item.nextCursor !== null && typeof item.nextCursor !== "string")
  )
    throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
}

export function checkItem(resource: string, value: unknown, version: 1 | 2 = 1): void {
  const item = record(value);
  if (resource === "candidates") {
    requiredUuid(item.id);
    requiredStrings(item, "canonicalUrl", "firstObservedAt", "lastObservedAt", "reviewStatus");
    nullableUuid(item.latestReviewId);
    nullableUuid(item.linkedSourceId);
    requiredInteger(item.observationCount);
    nullableInteger(item.minPosition);
    nullableInteger(item.maxPosition);
    if (item.classification !== null) {
      const classification = record(item.classification);
      requiredStrings(classification, "kind", "classifiedAt");
      nullableStrings(classification, "reason", "sourceFamily", "proposedAdapterKey");
      nullableUuid(classification.knownSourceId);
      requiredInteger(classification.ruleVersion);
    }
    if (item.latestObservation !== null) {
      checkItem("observations", item.latestObservation, version);
      const latest = record(item.latestObservation);
      if (latest.candidateId !== item.id) throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
    }
    if (item.source !== null) {
      const source = record(item.source);
      requiredUuid(source.id);
      requiredStrings(source, "status");
      if (version === 2) nullableString(source.adapterKey);
      else requiredString(source.adapterKey);
      if (source.enabled !== null) requiredBoolean(source.enabled);
    }
    if (item.latestReview !== null) checkItem("reviews", item.latestReview, version);
  } else if (resource === "executions") {
    requiredUuid(item.id);
    requiredUuid(item.queryId);
    requiredStrings(item, "providerKey", "status", "createdAt");
    nullableStrings(
      item,
      "submissionState",
      "recoveryState",
      "startedAt",
      "finishedAt",
      "failureCode",
      "queryExpression",
    );
    nullableUuid(item.originalExecutionId);
    requiredInteger(item.observed);
    requiredInteger(item.candidatesCreated);
    requiredInteger(item.countersVersion);
    nullableInteger(item.candidatesReobserved);
    nullableInteger(item.knownSources);
    nullableInteger(item.invalidResults);
    nullableInteger(item.providerFailures);
    nullableInteger(item.providerRequestCount);
    if (item.cost !== null && (typeof item.cost !== "number" || !Number.isFinite(item.cost)))
      throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
  } else if (resource === "queries") {
    requiredUuid(item.id);
    requiredStrings(item, "providerKey");
    if (version === 2) nullableString(item.expression);
    else requiredString(item.expression);
    requiredBoolean(item.enabled);
    nullableStrings(
      item,
      "activityContext",
      "geographicScope",
      "localeHint",
      "scheduleExpression",
      "lastExecutionStatus",
      "lastExecutionAt",
    );
    if (version === 2) {
      nullableInteger(item.resultLimit);
      nullableInteger(item.requestBudget);
    } else {
      requiredInteger(item.resultLimit);
      requiredInteger(item.requestBudget);
    }
    nullableUuid(item.lastExecutionId);
  } else if (resource === "providers") {
    requiredStrings(item, "providerKey", "displayName");
    requiredBoolean(item.enabled);
    if (version === 2) nullableInteger(item.maxRequestsPerExecution);
    else requiredInteger(item.maxRequestsPerExecution);
    nullableInteger(item.dailyRequestCap);
    nullableInteger(item.monthlyRequestCap);
  } else if (resource === "observations") {
    requiredUuid(item.id);
    requiredUuid(item.queryId);
    requiredUuid(item.executionId);
    requiredStrings(item, "providerKey", "originalUrl", "observedAt");
    nullableStrings(item, "title", "snippet");
    nullableInteger(item.resultPosition);
    checkObservationIdentity(item);
  } else if (resource === "reviews") {
    requiredUuid(item.id);
    requiredStrings(item, "decision", "reasonCode", "reviewedAt");
    if (version === 2) nullableString(item.reviewerRef);
    else requiredString(item.reviewerRef);
  }
}

export function options<T extends PageArgs>(page: T): URLSearchParams {
  const p = new URLSearchParams();
  const limit = page.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DiscoveryReadError("INVALID_REQUEST");
  p.set("limit", String(limit));
  for (const [key, value] of Object.entries(page)) {
    if (key === "limit" || value === undefined || value === "") continue;
    if (
      (typeof value !== "string" && typeof value !== "number") ||
      (key === "cursor" && (typeof value !== "string" || value.length > 2048))
    )
      throw new DiscoveryReadError("INVALID_REQUEST");
    if (key === "search" && (typeof value !== "string" || value.length > 200))
      throw new DiscoveryReadError("INVALID_REQUEST");
    if ((key === "queryId" || key === "executionId") && typeof value === "string") checkId(value);
    if (key === "providerKey" && (typeof value !== "string" || !providerKeyPattern.test(value)))
      throw new DiscoveryReadError("INVALID_REQUEST");
    p.set(key, String(value));
  }
  return p;
}

export async function jsonBounded(response: Response): Promise<unknown> {
  if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json"))
    throw new DiscoveryReadError("READ_UNAVAILABLE");
  const reader = response.body?.getReader();
  if (!reader) throw new DiscoveryReadError("READ_UNAVAILABLE");
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
  }
}

export function knownError(status: number): ReadErrorCode {
  if (status === 400) return "INVALID_REQUEST";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "READ_CONFLICT";
  return "READ_UNAVAILABLE";
}
