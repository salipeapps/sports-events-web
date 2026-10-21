import "server-only";

import { headers } from "next/headers";
import { getDiscoveryAccessToken } from "@/integrations/auth/discoveryToken";
import { createSupabaseReadRepository } from "./supabaseRead";

export * from "./readContract";
import {
  DiscoveryReadError,
  checkId,
  checkPage,
  checkItem,
  options,
  jsonBounded,
  knownError,
  record,
  requiredUuid,
  requiredBoolean,
  requiredString,
  type DiscoveryReadRepository,
  type DiscoveryPage,
  type DiscoveryCandidate,
  type DiscoveryCandidateDetail,
  type DiscoveryObservation,
  type DiscoveryReview,
  type DiscoveryProvider,
  type DiscoveryQuery,
  type DiscoveryExecution,
  type CandidateFilters,
  type PageArgs,
} from "./readContract";
const basePath = "/api/admin/v1/discovery";
// Only bounded, allowlisted categories are emitted. Never log upstream responses,
// error objects, request URLs, signed assertions, access tokens or SQL user data.
export type PrivateReadDiagnosticStage =
  "user_auth" | "oidc_exchange" | "google_sts" | "google_iam" | "engine_fetch" | "engine_response";
export type PrivateReadDiagnosticReason =
  "unexpected_error" | "network_error" | "http_error" | "non_json_response" | "invalid_response" | "missing_token";

export function recordStagingPrivateReadFailure(
  stage: PrivateReadDiagnosticStage,
  reason: PrivateReadDiagnosticReason,
  status?: number,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!(getDiscoveryMode(env) === "staging" || isStagingSmokeEnabled(env))) return;
  let statusClass: "none" | "5xx" | "4xx" | "other" = "none";
  if (status !== undefined) {
    if (status >= 500) statusClass = "5xx";
    else if (status >= 400) statusClass = "4xx";
    else statusClass = "other";
  }
  console.error(`MOUMEET_STAGING_PRIVATE_READ_FAILURE stage=${stage} reason=${reason} http_class=${statusClass}`);
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
    let stage: "user_auth" | "oidc_exchange" | "engine_fetch" = "user_auth";
    try {
      // Authorization and active membership must be reverified before EACH upstream read.
      const userToken = await this.transport.getUserToken();
      stage = "oidc_exchange";
      const workloadToken = await this.transport.getWorkloadToken();
      stage = "engine_fetch";
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
      recordStagingPrivateReadFailure(stage, stage === "engine_fetch" ? "network_error" : "unexpected_error");
      throw new DiscoveryReadError("READ_UNAVAILABLE");
    }
    if (!response.ok) {
      // Google IAM errors may not be JSON; never forward upstream details.
      if (!(response.headers.get("content-type") ?? "").startsWith("application/json")) {
        recordStagingPrivateReadFailure("engine_response", "non_json_response", response.status);
        throw new DiscoveryReadError("READ_UNAVAILABLE");
      }
      let body: Record<string, unknown>;
      try {
        body = record(await jsonBounded(response));
      } catch {
        recordStagingPrivateReadFailure("engine_response", "invalid_response", response.status);
        throw new DiscoveryReadError("READ_UNAVAILABLE");
      }
      const code = knownError(response.status);
      if (body.code !== code || typeof body.requestId !== "string") {
        recordStagingPrivateReadFailure("engine_response", "invalid_response", response.status);
        throw new DiscoveryReadError("READ_UNAVAILABLE");
      }
      // The contract-valid engine 5xx is the exact failure this diagnostic exists for.
      if (code === "READ_UNAVAILABLE")
        recordStagingPrivateReadFailure("engine_response", "http_error", response.status);
      throw new DiscoveryReadError(code);
    }
    try {
      return await jsonBounded(response);
    } catch (error) {
      recordStagingPrivateReadFailure("engine_response", "invalid_response", response.status);
      throw error;
    }
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
    if (record(detail.candidate).id !== id) throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
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
    const observations = await this.page<DiscoveryObservation>(
      "observations",
      "/candidates/" + id + "/observations",
      page,
    );
    if (observations.items.some((observation) => observation.candidateId !== id))
      throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
    return observations;
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
    if (record(item).id !== id) throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
    return item as DiscoveryExecution;
  }

  async executionObservations(id: string, page: PageArgs = {}): Promise<DiscoveryPage<DiscoveryObservation>> {
    checkId(id);
    const observations = await this.page<DiscoveryObservation>(
      "observations",
      "/executions/" + id + "/observations",
      page,
    );
    if (observations.items.some((observation) => observation.executionId !== id))
      throw new DiscoveryReadError("INCOMPATIBLE_CONTRACT");
    return observations;
  }
}

export type DiscoveryMode = "demo" | "staging" | "SUPABASE_READ" | "disabled";

// Project-scoped Hobby STAGING uses Vercel's "production" target, NOT our actual PROD project.
// These stable IDs are public identifiers, not credentials. Every condition fails closed.
export function isApprovedStagingDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === "production" &&
    env.APP_ENV === "staging" &&
    env.VERCEL === "1" &&
    env.VERCEL_ENV === "production" &&
    env.VERCEL_TARGET_ENV === "production" &&
    env.VERCEL_PROJECT_ID === "prj_MU4pprIXpAdKUGcBPx8uWztULHxb" &&
    env.VERCEL_GIT_COMMIT_REF === "develop" &&
    env.APP_ORIGIN === "https://sports-events-web-staging.vercel.app" &&
    env.NEXT_PUBLIC_SUPABASE_URL === "https://yfytzogjrhwstcnzspdv.supabase.co" &&
    env.ADMIN_DEV_AUTH_MODE === "disabled"
  );
}

export function isStagingSmokeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // Temporary, read-only acceptance path. Never active alongside live discovery.
  return (
    isApprovedStagingDeployment(env) &&
    env.DISCOVERY_READ_MODE === "disabled" &&
    env.DISCOVERY_STAGING_SMOKE_ENABLED === "enabled"
  );
}

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
  if (requested === "staging" && isApprovedStagingDeployment(env)) return "staging";
  if (
    requested === "SUPABASE_READ" &&
    isApprovedStagingDeployment(env) &&
    env.DISCOVERY_STAGING_SMOKE_ENABLED !== "enabled" &&
    env.DISCOVERY_REJECTION_ENABLED !== "enabled" &&
    env.DISCOVERY_PROMOTION_ENABLED !== "enabled"
  )
    return "SUPABASE_READ";
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
    env.VERCEL_EXPECTED_OIDC_ISSUER !== "https://oidc.vercel.com/raulsp" ||
    env.VERCEL_EXPECTED_OIDC_AUDIENCE !== "https://vercel.com/raulsp"
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

async function shortPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  stage: "google_sts" | "google_iam",
): Promise<Record<string, unknown>> {
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
  } catch {
    recordStagingPrivateReadFailure(stage, "network_error");
    throw new DiscoveryReadError("READ_UNAVAILABLE");
  }
  if (!response.ok) {
    recordStagingPrivateReadFailure(stage, "http_error", response.status);
    throw new DiscoveryReadError("READ_UNAVAILABLE");
  }
  try {
    return record(await jsonBounded(response));
  } catch {
    recordStagingPrivateReadFailure(stage, "invalid_response", response.status);
    throw new DiscoveryReadError("READ_UNAVAILABLE");
  }
}

export async function workloadToken(config: StageConfig): Promise<string> {
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
    claims.sub !== "owner:raulsp:project:sports-events-web-staging:environment:production" ||
    claims.owner_id !== "team_EH6GksyEmuYgo1EtauFaEdhv" ||
    claims.project_id !== "prj_MU4pprIXpAdKUGcBPx8uWztULHxb" ||
    claims.environment !== "production" ||
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
  const sts = await shortPost(
    "https://sts.googleapis.com/v1/token",
    form.toString(),
    { "Content-Type": "application/x-www-form-urlencoded" },
    "google_sts",
  );
  if (typeof sts.access_token !== "string") {
    recordStagingPrivateReadFailure("google_sts", "missing_token");
    throw new DiscoveryReadError("READ_UNAVAILABLE");
  }
  const iam = await shortPost(
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
      encodeURIComponent(config.serviceEmail) +
      ":generateIdToken",
    JSON.stringify({ audience: config.origin, includeEmail: true }),
    { Authorization: "Bearer " + sts.access_token, "Content-Type": "application/json" },
    "google_iam",
  );
  if (typeof iam.token !== "string") {
    recordStagingPrivateReadFailure("google_iam", "missing_token");
    throw new DiscoveryReadError("READ_UNAVAILABLE");
  }
  return iam.token;
}

function createStagingReadRepository(): DiscoveryReadRepository {
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

export function getLiveDiscoveryRepository(): DiscoveryReadRepository {
  if (getDiscoveryMode() === "SUPABASE_READ") return createSupabaseReadRepository();
  if (getDiscoveryMode() !== "staging") throw new DiscoveryReadError("NOT_CONFIGURED");
  return createStagingReadRepository();
}

export function getStagingSmokeDiscoveryRepository(): DiscoveryReadRepository {
  if (!isStagingSmokeEnabled()) throw new DiscoveryReadError("NOT_CONFIGURED");
  return createStagingReadRepository();
}
