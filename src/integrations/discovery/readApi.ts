import "server-only";

import { headers } from "next/headers";
import { getDiscoveryAccessToken } from "@/integrations/auth/discoveryToken";

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
  reviewerRef: string;
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
  source: { id: string; status: string; enabled: boolean | null; adapterKey: string } | null;
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
  maxRequestsPerExecution: number;
  dailyRequestCap: number | null;
  monthlyRequestCap: number | null;
}

export interface DiscoveryQuery {
  id: string;
  providerKey: string;
  expression: string;
  enabled: boolean;
  activityContext: string | null;
  geographicScope: string | null;
  localeHint: string | null;
  resultLimit: number;
  requestBudget: number;
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
const basePath = "/api/admin/v1/discovery";

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
  return value as Record<string, unknown>;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string") throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
  return value;
}

function requiredUuid(value: unknown): void {
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

function requiredBoolean(value: unknown): void {
  if (typeof value !== "boolean") throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
}

function requiredStrings(item: Record<string, unknown>, ...fields: string[]): void {
  for (const field of fields) requiredString(item[field]);
}

function nullableStrings(item: Record<string, unknown>, ...fields: string[]): void {
  for (const field of fields) nullableString(item[field]);
}

function checkId(value: string): void {
  if (!uuid.test(value)) throw new DiscoveryReadError("INVALID_REQUEST");
}

function checkObservationIdentity(item: Record<string, unknown>): void {
  const candidateIdValid = typeof item.candidateId === "string" && uuid.test(item.candidateId);
  const knownSourceIdValid = typeof item.knownSourceId === "string" && uuid.test(item.knownSourceId);
  if (candidateIdValid && item.knownSourceId === null) return;
  if (item.candidateId === null && knownSourceIdValid) return;
  throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
}

function checkPage(value: unknown): asserts value is DiscoveryPage<unknown> {
  const item = record(value);
  if (
    !Array.isArray(item.items) ||
    item.items.length > 100 ||
    (item.nextCursor !== null && typeof item.nextCursor !== "string")
  )
    throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
}

function checkItem(resource: string, value: unknown): void {
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
      checkItem("observations", item.latestObservation);
      const latest = record(item.latestObservation);
      if (latest.candidateId !== item.id) throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
    }
    if (item.source !== null) {
      const source = record(item.source);
      requiredUuid(source.id);
      requiredStrings(source, "status", "adapterKey");
      if (source.enabled !== null) requiredBoolean(source.enabled);
    }
    if (item.latestReview !== null) checkItem("reviews", item.latestReview);
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
    requiredStrings(item, "expression", "providerKey");
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
    requiredInteger(item.resultLimit);
    requiredInteger(item.requestBudget);
    nullableUuid(item.lastExecutionId);
  } else if (resource === "providers") {
    requiredStrings(item, "providerKey", "displayName");
    requiredBoolean(item.enabled);
    requiredInteger(item.maxRequestsPerExecution);
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
    requiredStrings(item, "decision", "reviewerRef", "reasonCode", "reviewedAt");
  }
}

function options<T extends PageArgs>(page: T): URLSearchParams {
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

async function jsonBounded(response: Response): Promise<unknown> {
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
      if (total > maxBytes) throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
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

function knownError(status: number): ReadErrorCode {
  if (status === 400) return "INVALID_REQUEST";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "READ_CONFLICT";
  return "READ_UNAVAILABLE";
}

export interface EngineTransport {
  fetcher: typeof fetch;
  getUserToken(): Promise<string>;
  getWorkloadToken(): Promise<string>;
  origin: string;
}

export class HttpDiscoveryReadRepository implements DiscoveryReadRepository {
  constructor(private readonly transport: EngineTransport) {}

  private async get(path: string, params?: URLSearchParams): Promise<unknown> {
    const endpoint = this.transport.origin + basePath + path + (params ? "?" + params.toString() : "");
    let response: Response;
    try {
      // Authorization and active membership must be reverified before EACH upstream read.
      const userToken = await this.transport.getUserToken();
      const workloadToken = await this.transport.getWorkloadToken();
      response = await this.transport.fetcher(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + userToken,
          "X-Serverless-Authorization": "Bearer " + workloadToken,
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (error instanceof DiscoveryReadError) throw error;
      throw new DiscoveryReadError("READ_UNAVAILABLE");
    }
    if (!response.ok) {
      // Google IAM errors may not be JSON; never forward upstream details.
      if (!(response.headers.get("content-type") ?? "").startsWith("application/json"))
        throw new DiscoveryReadError("READ_UNAVAILABLE");
      const body = record(await jsonBounded(response));
      const code = knownError(response.status);
      if (body.code !== code || typeof body.requestId !== "string") throw new DiscoveryReadError("READ_UNAVAILABLE");
      throw new DiscoveryReadError(code);
    }
    return jsonBounded(response);
  }

  private async page<T>(resource: string, path: string, filters: PageArgs): Promise<DiscoveryPage<T>> {
    const body = await this.get(path, options(filters));
    checkPage(body);
    for (const item of body.items) checkItem(resource, item);
    return body as DiscoveryPage<T>;
  }

  async candidates(filters: CandidateFilters & PageArgs = {}): Promise<DiscoveryPage<DiscoveryCandidate>> {
    return this.page("candidates", "/candidates", filters);
  }

  async candidate(id: string): Promise<DiscoveryCandidateDetail> {
    checkId(id);
    const detail = record(await this.get("/candidates/" + id));
    checkItem("candidates", detail.candidate);
    if (detail.promotion !== null) {
      const promotion = record(detail.promotion);
      requiredUuid(promotion.sourceId);
      requiredUuid(promotion.reviewId);
      requiredBoolean(promotion.reusedSource);
      requiredString(promotion.promotedAt);
    }
    return detail as unknown as DiscoveryCandidateDetail;
  }

  async candidateObservations(id: string, page: PageArgs = {}): Promise<DiscoveryPage<DiscoveryObservation>> {
    checkId(id);
    return this.page("observations", "/candidates/" + id + "/observations", page);
  }

  async candidateReviews(id: string, page: PageArgs = {}): Promise<DiscoveryPage<DiscoveryReview>> {
    checkId(id);
    return this.page("reviews", "/candidates/" + id + "/reviews", page);
  }

  async providers(page: PageArgs = {}): Promise<DiscoveryPage<DiscoveryProvider>> {
    return this.page("providers", "/providers", page);
  }

  async queries(page: PageArgs = {}): Promise<DiscoveryPage<DiscoveryQuery>> {
    return this.page("queries", "/queries", page);
  }

  async executions(
    filters: PageArgs & { providerKey?: string; queryId?: string } = {},
  ): Promise<DiscoveryPage<DiscoveryExecution>> {
    return this.page("executions", "/executions", filters);
  }

  async execution(id: string): Promise<DiscoveryExecution> {
    checkId(id);
    const item = await this.get("/executions/" + id);
    checkItem("executions", item);
    return item as DiscoveryExecution;
  }

  async executionObservations(id: string, page: PageArgs = {}): Promise<DiscoveryPage<DiscoveryObservation>> {
    checkId(id);
    return this.page("observations", "/executions/" + id + "/observations", page);
  }
}

export type DiscoveryMode = "demo" | "staging" | "disabled";

export function getDiscoveryMode(env: NodeJS.ProcessEnv = process.env): DiscoveryMode {
  const localDemo =
    env.NODE_ENV === "development" &&
    env.APP_ENV === "development" &&
    env.ADMIN_DEV_AUTH_MODE === "enabled" &&
    !env.VERCEL &&
    !env.VERCEL_ENV &&
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$/.test(env.APP_ORIGIN ?? "");
  const requested = env.DISCOVERY_READ_MODE;
  if (requested === "demo" && !localDemo) return "disabled";
  if (requested === "demo" || (!requested && localDemo)) return "demo";
  if (requested === "staging" && env.VERCEL_ENV === "preview" && env.ADMIN_DEV_AUTH_MODE !== "enabled")
    return "staging";
  return "disabled";
}

interface StageConfig {
  origin: string;
  providerAudience: string;
  serviceEmail: string;
  expectedIssuer: string;
  expectedAudience: string;
}

export function parseStageConfig(env: Partial<NodeJS.ProcessEnv> = process.env): StageConfig {
  let u: URL;
  try {
    u = new URL(env.ENGINE_STAGING_BASE_URL ?? "");
  } catch {
    throw new DiscoveryReadError("NOT_CONFIGURED");
  }
  if (
    u.protocol !== "https:" ||
    !/^[a-z0-9-]+(?:-[a-z0-9]+)?\.a\.run\.app$/.test(u.hostname) ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    u.username ||
    u.password ||
    u.port ||
    env.ENGINE_STAGING_ID_TOKEN_AUDIENCE !== u.origin ||
    !/^\/\/iam\.googleapis\.com\/projects\/[0-9]+\/locations\/global\/workloadIdentityPools\/[a-zA-Z0-9-]+\/providers\/[a-zA-Z0-9-]+$/.test(
      env.GCP_WORKLOAD_PROVIDER_AUDIENCE ?? "",
    ) ||
    !/^[a-zA-Z0-9.-]+@[a-zA-Z0-9-]+\.iam\.gserviceaccount\.com$/.test(env.GCP_INVOKER_SERVICE_ACCOUNT_EMAIL ?? "") ||
    !/^https:\/\/oidc\.vercel\.com(?:\/[a-zA-Z0-9-]+)?$/.test(env.VERCEL_EXPECTED_OIDC_ISSUER ?? "") ||
    !(env.VERCEL_EXPECTED_OIDC_AUDIENCE ?? "").startsWith("https://vercel.com/")
  )
    throw new DiscoveryReadError("NOT_CONFIGURED");
  return {
    origin: u.origin,
    providerAudience: env.GCP_WORKLOAD_PROVIDER_AUDIENCE!,
    serviceEmail: env.GCP_INVOKER_SERVICE_ACCOUNT_EMAIL!,
    expectedIssuer: env.VERCEL_EXPECTED_OIDC_ISSUER!,
    expectedAudience: env.VERCEL_EXPECTED_OIDC_AUDIENCE!,
  };
}

function oidcClaims(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new DiscoveryReadError("NOT_CONFIGURED");
  try {
    return record(JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")));
  } catch {
    throw new DiscoveryReadError("NOT_CONFIGURED");
  }
}

async function shortPost(url: string, body: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new DiscoveryReadError("READ_UNAVAILABLE");
    return record(await jsonBounded(response));
  } catch {
    throw new DiscoveryReadError("READ_UNAVAILABLE");
  }
}

async function workloadToken(config: StageConfig): Promise<string> {
  // Only STS verifies this assertion; unverified claims are a fail-closed preflight,
  // never the authority to impersonate a workload.
  const assertion = (await headers()).get("x-vercel-oidc-token");
  if (!assertion) throw new DiscoveryReadError("NOT_CONFIGURED");
  const claims = oidcClaims(assertion);
  const audience = claims.aud;
  if (
    claims.iss !== config.expectedIssuer ||
    !(
      audience === config.expectedAudience ||
      (Array.isArray(audience) && audience.includes(config.expectedAudience))
    ) ||
    typeof claims.exp !== "number" ||
    claims.exp <= Math.floor(Date.now() / 1000) + 30
  )
    throw new DiscoveryReadError("NOT_CONFIGURED");
  const form = new URLSearchParams({
    audience: config.providerAudience,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    scope: "https://www.googleapis.com/auth/cloud-platform",
    subject_token: assertion,
  });
  const sts = await shortPost("https://sts.googleapis.com/v1/token", form.toString(), {
    "Content-Type": "application/x-www-form-urlencoded",
  });
  if (typeof sts.access_token !== "string") throw new DiscoveryReadError("READ_UNAVAILABLE");
  const iam = await shortPost(
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
      encodeURIComponent(config.serviceEmail) +
      ":generateIdToken",
    JSON.stringify({ audience: config.origin, includeEmail: true }),
    { Authorization: "Bearer " + sts.access_token, "Content-Type": "application/json" },
  );
  if (typeof iam.token !== "string") throw new DiscoveryReadError("READ_UNAVAILABLE");
  return iam.token;
}

export function getLiveDiscoveryRepository(): DiscoveryReadRepository {
  if (getDiscoveryMode() !== "staging") throw new DiscoveryReadError("NOT_CONFIGURED");
  const config = parseStageConfig();
  return new HttpDiscoveryReadRepository({
    origin: config.origin,
    fetcher: fetch,
    async getUserToken() {
      const result = await getDiscoveryAccessToken();
      if (result.status === "denied") throw new DiscoveryReadError(result.code);
      return result.accessToken;
    },
    async getWorkloadToken() {
      return workloadToken(config);
    },
  });
}
