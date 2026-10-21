import "server-only";

import { getAuthConfig } from "@/config/env";
import { getDiscoveryAccessToken, type DiscoveryTokenResult } from "@/integrations/auth/discoveryToken";
import {
  DiscoveryReadError,
  checkId,
  checkItem,
  checkPage,
  jsonBounded,
  record,
  requiredUuid,
  type CandidateFilters,
  type DiscoveryCandidate,
  type DiscoveryCandidateDetail,
  type DiscoveryExecution,
  type DiscoveryObservation,
  type DiscoveryPage,
  type DiscoveryProvider,
  type DiscoveryQuery,
  type DiscoveryReadRepository,
  type DiscoveryReview,
  type PageArgs,
} from "./readContract";

// H0 proposal: fixed RPCs in schema api. Bindings must be reconciled with Engine #121
// before this draft can be approved. No generic SQL/resource dispatcher is exposed.
const rpcNames = {
  candidates: "discovery_candidates_v2",
  candidate: "discovery_candidate_v2",
  candidateObservations: "discovery_candidate_observations_v2",
  candidateReviews: "discovery_candidate_reviews_v2",
  providers: "discovery_providers_v2",
  queries: "discovery_queries_v2",
  executions: "discovery_executions_v2",
  execution: "discovery_execution_v2",
  executionObservations: "discovery_execution_observations_v2",
} as const;
type Operation = keyof typeof rpcNames;

const fields = {
  candidates:
    "id canonicalUrl firstObservedAt lastObservedAt reviewStatus latestReviewId linkedSourceId classification observationCount minPosition maxPosition latestObservation source latestReview",
  observations:
    "id candidateId knownSourceId queryId executionId providerKey originalUrl observedAt title snippet resultPosition",
  reviews: "id decision reviewerRef reasonCode reviewedAt",
  providers: "providerKey displayName enabled maxRequestsPerExecution dailyRequestCap monthlyRequestCap",
  queries:
    "id providerKey expression enabled activityContext geographicScope localeHint resultLimit requestBudget scheduleExpression lastExecutionId lastExecutionStatus lastExecutionAt",
  executions:
    "id queryId providerKey status submissionState recoveryState originalExecutionId createdAt startedAt finishedAt observed candidatesCreated candidatesReobserved knownSources invalidResults providerFailures countersVersion providerRequestCount failureCode queryExpression cost",
} as const;
type Resource = keyof typeof fields;
function incompatible(): never {
  throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
}
function exact(value: unknown, keys: string) {
  const item = record(value);
  const allowed = keys.split(" ");
  if (Object.keys(item).length !== allowed.length || allowed.some((key) => !Object.hasOwn(item, key))) incompatible();
  return item;
}
function safeUrl(value: unknown) {
  try {
    const url = new URL(String(value));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) incompatible();
  } catch {
    incompatible();
  }
}
function validate(resource: Resource, value: unknown, role: "admin" | "reviewer") {
  checkItem(resource, value, 2);
  const item = exact(value, fields[resource]);
  if (resource === "candidates") {
    safeUrl(item.canonicalUrl);
    if (item.classification !== null)
      exact(item.classification, "kind reason sourceFamily proposedAdapterKey knownSourceId ruleVersion classifiedAt");
    if (item.latestObservation !== null) validate("observations", item.latestObservation, role);
    if (item.latestReview !== null) validate("reviews", item.latestReview, role);
    if (item.source !== null) {
      const source = exact(item.source, "id status enabled adapterKey");
      if (role === "reviewer" && (source.enabled !== null || source.adapterKey !== null)) incompatible();
    }
  }
  if (resource === "observations") safeUrl(item.originalUrl);
  if (resource === "reviews" && item.reviewerRef !== null) incompatible();
  if (resource === "executions" && (item.cost !== null || (role === "reviewer" && item.queryExpression !== null)))
    incompatible();
  const hidden =
    resource === "providers"
      ? ["maxRequestsPerExecution", "dailyRequestCap", "monthlyRequestCap"]
      : resource === "queries"
        ? ["expression", "requestBudget", "resultLimit", "scheduleExpression"]
        : [];
  if (role === "reviewer" && hidden.some((key) => item[key] !== null)) incompatible();
}

const parameters: Record<string, string> = {
  cursor: "p_cursor",
  limit: "p_limit",
  id: "p_id",
  reviewStatus: "p_review_status",
  classificationKind: "p_classification_kind",
  queryId: "p_query_id",
  providerKey: "p_provider_key",
  executionId: "p_execution_id",
  search: "p_search",
};
function args(input: Record<string, unknown>, allowed: string, paged: boolean) {
  const output: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === "") continue;
    if (!allowed.split(" ").includes(key)) throw new DiscoveryReadError("INVALID_REQUEST");
    if (key === "limit") {
      if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100)
        throw new DiscoveryReadError("INVALID_REQUEST");
    } else {
      if (
        typeof value !== "string" ||
        value.length > (key === "cursor" ? 2048 : key === "search" ? 200 : 120) ||
        /[\p{Cc}\p{Cf}]/u.test(value)
      )
        throw new DiscoveryReadError("INVALID_REQUEST");
      if (["id", "queryId", "executionId"].includes(key)) checkId(value);
      if (key === "providerKey" && !/^[a-zA-Z0-9_-]+$/.test(value)) throw new DiscoveryReadError("INVALID_REQUEST");
      if (key === "reviewStatus" && !["PENDING_REVIEW", "APPROVED", "REJECTED"].includes(value))
        throw new DiscoveryReadError("INVALID_REQUEST");
      if (
        key === "classificationKind" &&
        ![
          "SUPPORTED_ADAPTER_CANDIDATE",
          "UNSUPPORTED_REVIEWABLE",
          "AMBIGUOUS_REVIEW_REQUIRED",
          "KNOWN_SOURCE",
          "UNSAFE_OR_INVALID",
          "NON_SOURCE_RESULT",
        ].includes(value)
      )
        throw new DiscoveryReadError("INVALID_REQUEST");
    }
    output[parameters[key]] = value as string | number;
  }
  if (paged && output.p_limit === undefined) output.p_limit = 50;
  return output;
}

interface Transport {
  origin: string;
  publishableKey: string;
  fetcher: typeof fetch;
  authorize: () => Promise<DiscoveryTokenResult>;
}

export class SupabaseDiscoveryReadRepository implements DiscoveryReadRepository {
  constructor(private readonly transport: Transport) {
    // Production factory additionally pins the STAGING project through getDiscoveryMode.
    const url = new URL(transport.origin);
    if (
      url.origin !== transport.origin ||
      url.protocol !== "https:" ||
      !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(transport.publishableKey)
    )
      throw new DiscoveryReadError("NOT_CONFIGURED");
  }

  private async call(operation: Operation, input: Record<string, unknown>) {
    try {
      // Fresh online identity, active membership, exact bearer/claims on EVERY RPC.
      const auth = await this.transport.authorize();
      if (auth.status === "denied") throw new DiscoveryReadError(auth.code);
      const response = await this.transport.fetcher(`${this.transport.origin}/rest/v1/rpc/${rpcNames[operation]}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Profile": "api",
          apikey: this.transport.publishableKey,
          Authorization: `Bearer ${auth.accessToken}`,
        },
        body: JSON.stringify(input),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        // Do not parse or expose upstream messages, SQL details, hints or credentials.
        const code =
          response.status === 401
            ? "UNAUTHENTICATED"
            : response.status === 403
              ? "FORBIDDEN"
              : response.status === 400
                ? "INVALID_REQUEST"
                : response.status === 404
                  ? "NOT_CONFIGURED"
                  : response.status === 409
                    ? "READ_CONFLICT"
                    : "READ_UNAVAILABLE";
        await response.body?.cancel();
        throw new DiscoveryReadError(code);
      }
      const body = record(await jsonBounded(response));
      if (body.contractVersion !== 2) incompatible();
      return { body, role: auth.role };
    } catch (error) {
      if (error instanceof DiscoveryReadError) throw error;
      throw new DiscoveryReadError("READ_UNAVAILABLE");
    }
  }

  private async page<T>(
    operation: Operation,
    resource: Resource,
    input: Record<string, unknown>,
    allowed = "cursor limit",
  ): Promise<DiscoveryPage<T>> {
    const params = args(input, allowed, true);
    const { body, role } = await this.call(operation, params);
    exact(body, "contractVersion items nextCursor");
    checkPage(body);
    if (
      body.items.length > Number(params.p_limit) ||
      (body.nextCursor !== null &&
        (body.items.length === 0 ||
          !body.nextCursor ||
          body.nextCursor.length > 2048 ||
          body.nextCursor === input.cursor))
    )
      incompatible();
    const keys = new Set<string>();
    for (const item of body.items) {
      validate(resource, item, role);
      const key = String(record(item)[resource === "providers" ? "providerKey" : "id"]);
      if (keys.has(key)) incompatible();
      keys.add(key);
    }
    return { items: body.items as T[], nextCursor: body.nextCursor };
  }
  private async detail(operation: "candidate" | "execution", id: string) {
    checkId(id);
    const { body, role } = await this.call(operation, args({ id }, "id", false));
    exact(body, "contractVersion item");
    if (body.item === null) throw new DiscoveryReadError("NOT_FOUND");
    if (operation === "candidate") {
      const detail = exact(body.item, "candidate promotion");
      validate("candidates", detail.candidate, role);
      if (record(detail.candidate).id !== id) incompatible();
      if (detail.promotion !== null) {
        const promotion = exact(detail.promotion, "sourceId reviewId reusedSource promotedAt");
        requiredUuid(promotion.sourceId);
        requiredUuid(promotion.reviewId);
        if (typeof promotion.reusedSource !== "boolean" || typeof promotion.promotedAt !== "string") incompatible();
      }
    } else {
      validate("executions", body.item, role);
      if (record(body.item).id !== id) incompatible();
    }
    return body.item;
  }
  candidates(filters: CandidateFilters & PageArgs = {}) {
    return this.page<DiscoveryCandidate>(
      "candidates",
      "candidates",
      { ...filters },
      "cursor limit reviewStatus classificationKind queryId providerKey executionId search",
    );
  }
  async candidate(id: string) {
    return (await this.detail("candidate", id)) as DiscoveryCandidateDetail;
  }
  async candidateObservations(id: string, page: PageArgs = {}) {
    checkId(id);
    const result = await this.page<DiscoveryObservation>(
      "candidateObservations",
      "observations",
      { ...page, id },
      "id cursor limit",
    );
    if (result.items.some((item) => item.candidateId !== id)) incompatible();
    return result;
  }
  candidateReviews(id: string, page: PageArgs = {}) {
    checkId(id);
    return this.page<DiscoveryReview>("candidateReviews", "reviews", { ...page, id }, "id cursor limit");
  }
  providers(page: PageArgs = {}) {
    return this.page<DiscoveryProvider>("providers", "providers", { ...page });
  }
  queries(page: PageArgs = {}) {
    return this.page<DiscoveryQuery>("queries", "queries", { ...page });
  }
  executions(filters: PageArgs & { providerKey?: string; queryId?: string } = {}) {
    return this.page<DiscoveryExecution>(
      "executions",
      "executions",
      { ...filters },
      "cursor limit providerKey queryId",
    );
  }
  async execution(id: string) {
    return (await this.detail("execution", id)) as DiscoveryExecution;
  }
  async executionObservations(id: string, page: PageArgs = {}) {
    checkId(id);
    const result = await this.page<DiscoveryObservation>(
      "executionObservations",
      "observations",
      { ...page, id },
      "id cursor limit",
    );
    if (result.items.some((item) => item.executionId !== id)) incompatible();
    return result;
  }
}

export function createSupabaseReadRepository(): DiscoveryReadRepository {
  const config = getAuthConfig();
  if (!config) throw new DiscoveryReadError("NOT_CONFIGURED");
  return new SupabaseDiscoveryReadRepository({
    origin: config.url,
    publishableKey: config.key,
    fetcher: fetch,
    authorize: getDiscoveryAccessToken,
  });
}
