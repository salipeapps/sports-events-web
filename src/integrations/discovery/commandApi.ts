import "server-only";

import { randomUUID } from "node:crypto";
import { canAdmin } from "@/domain/adminAccess";
import { getDiscoveryAccessToken, type DiscoveryTokenResult } from "@/integrations/auth/discoveryToken";
import { isApprovedStagingDeployment, parseStageConfig, workloadToken } from "./readApi";

export type CommandOperation = "rejection" | "promotion";
export const rejectionReasons = ["UNSUITABLE_SOURCE", "OUT_OF_SCOPE", "DUPLICATE_SOURCE", "INVALID_SOURCE"] as const;
export interface RejectionCommand {
  reasonCode: (typeof rejectionReasons)[number];
}
export interface PromotionCommand {
  expectedReviewStatus: "PENDING_REVIEW";
  expectedClassificationVersion: number;
  sourceName: string;
  sourceKind:
    "ORGANIZER" | "AGGREGATOR" | "MUNICIPAL" | "BOOKING_PLATFORM" | "SEARCH_RESULT" | "SOCIAL_NETWORK" | "OTHER";
  canonicalSourceUrl: string;
  adapterKey: string;
  allowedDomain: string;
  requestBudget: number;
}
export interface RejectionReceipt {
  candidateId: string;
  reviewId: string;
  reviewStatus: "REJECTED";
  reasonCode: RejectionCommand["reasonCode"];
  reviewerRef: string;
  reviewedAt: string;
}
export interface PromotionReceipt {
  candidateId: string;
  sourceId: string;
  reviewId: string;
  reusedSource: boolean;
  promotedAt: string;
}
export type CommandErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "REJECTION_CONFLICT"
  | "PROMOTION_CONFLICT"
  | "INVALID_REJECTION_REASON"
  | "CLASSIFICATION_NOT_SUPPORTED"
  | "ADAPTER_NOT_REGISTERED"
  | "INVALID_ALLOWED_DOMAINS"
  | "INVALID_REQUEST_BUDGET"
  | "RATE_LIMITED"
  | "WRITE_UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "INCOMPATIBLE_CONTRACT";
export class DiscoveryCommandError extends Error {
  constructor(
    readonly code: CommandErrorCode,
    readonly requestId: string = randomUUID(),
    // Delta-seconds hint for RATE_LIMITED, verified from the writer or the local backstop.
    readonly retryAfter: number = 60,
  ) {
    super(code);
  }
}
export const commandStatus: Record<CommandErrorCode, number> = {
  INVALID_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REJECTION_CONFLICT: 409,
  PROMOTION_CONFLICT: 409,
  INVALID_REJECTION_REASON: 422,
  CLASSIFICATION_NOT_SUPPORTED: 422,
  ADAPTER_NOT_REGISTERED: 422,
  INVALID_ALLOWED_DOMAINS: 422,
  INVALID_REQUEST_BUDGET: 422,
  RATE_LIMITED: 429,
  WRITE_UNAVAILABLE: 503,
  NOT_CONFIGURED: 404,
  INCOMPATIBLE_CONTRACT: 503,
};
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
function fail(code: CommandErrorCode = "INVALID_REQUEST"): never {
  throw new DiscoveryCommandError(code);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail();
}
const promotionKeys = [
  "expectedReviewStatus",
  "expectedClassificationVersion",
  "sourceName",
  "sourceKind",
  "canonicalSourceUrl",
  "adapterKey",
  "allowedDomain",
  "requestBudget",
];
export function validateCommand(
  operation: CommandOperation,
  candidateId: string,
  key: string,
  value: unknown,
): RejectionCommand | PromotionCommand {
  if (!isUuid(candidateId) || !isUuid(key)) fail();
  const body = object(value);
  if (operation === "rejection") {
    exact(body, ["reasonCode"]);
    if (typeof body.reasonCode !== "string") fail();
    if (!rejectionReasons.includes(body.reasonCode as RejectionCommand["reasonCode"])) fail("INVALID_REJECTION_REASON");
  } else {
    exact(body, promotionKeys);
    if (
      body.expectedReviewStatus !== "PENDING_REVIEW" ||
      !Number.isSafeInteger(body.expectedClassificationVersion) ||
      (body.expectedClassificationVersion as number) < 1 ||
      (body.expectedClassificationVersion as number) > 1000000
    )
      fail();
    if (
      typeof body.sourceName !== "string" ||
      !body.sourceName.trim() ||
      body.sourceName !== body.sourceName.trim() ||
      body.sourceName.length > 120 ||
      /[\p{Cc}\p{Cf}]/u.test(body.sourceName)
    )
      fail();
    if (
      ![
        "ORGANIZER",
        "AGGREGATOR",
        "MUNICIPAL",
        "BOOKING_PLATFORM",
        "SEARCH_RESULT",
        "SOCIAL_NETWORK",
        "OTHER",
      ].includes(body.sourceKind as string)
    )
      fail();
    if (typeof body.adapterKey !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(body.adapterKey)) fail();
    if (
      !Number.isInteger(body.requestBudget) ||
      (body.requestBudget as number) < 1 ||
      (body.requestBudget as number) > 8
    )
      fail("INVALID_REQUEST_BUDGET");
    if (typeof body.canonicalSourceUrl !== "string" || body.canonicalSourceUrl.length > 2048) fail();
    let url: URL;
    try {
      url = new URL(body.canonicalSourceUrl);
    } catch {
      return fail();
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      url.href !== body.canonicalSourceUrl
    )
      fail();
    if (
      typeof body.allowedDomain !== "string" ||
      body.allowedDomain.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(body.allowedDomain) ||
      body.allowedDomain !== url.hostname
    )
      fail("INVALID_ALLOWED_DOMAINS");
  }
  if (Buffer.byteLength(JSON.stringify(body)) > (operation === "rejection" ? 1024 : 4096)) fail();
  return body as unknown as RejectionCommand | PromotionCommand;
}

// Engine #102 admits exactly one operation (`discovery.reject`) inside the writer and
// refuses promotion while admission is enabled. Promotion therefore stays closed in
// the BFF regardless of its flag until Engine ships a reviewed promotion policy.
export const writerAdmittedOperations: readonly CommandOperation[] = ["rejection"];
// Pinned identifier of the Engine writer protocol (docs/command-admission-adr.md):
// authoritative shared admission after JWT/role and before SQL, one acquire per dispatch,
// 429 RATE_LIMITED + Retry-After, 503 WRITE_UNAVAILABLE, no BFF/browser-issued permits.
export const writerAdmissionContract = "engine-authoritative-rejection-v1";

export function commandsEnabled(operation: CommandOperation, env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    isApprovedStagingDeployment(env) &&
    env.DISCOVERY_READ_MODE !== "SUPABASE_READ" &&
    writerAdmittedOperations.includes(operation) &&
    env[operation === "rejection" ? "DISCOVERY_REJECTION_ENABLED" : "DISCOVERY_PROMOTION_ENABLED"] === "enabled"
  );
}

// #87 must verify and pin a dedicated writer origin/account before activation.
// Never fall back to the reader URL or reader service account. The operator also
// attests, for that exact origin, that the deployed writer enforces Engine's own
// authoritative admission. The BFF never reserves quota itself: one admission per
// dispatch, made by Engine. Without this attestation nothing is dispatched.
export function commandConfig(env: NodeJS.ProcessEnv = process.env) {
  const origin = env.ENGINE_COMMAND_STAGING_BASE_URL;
  const account = env.GCP_COMMAND_INVOKER_SERVICE_ACCOUNT_EMAIL;
  if (
    !origin ||
    origin !== env.ENGINE_COMMAND_STAGING_VERIFIED_ORIGIN ||
    env.ENGINE_COMMAND_ADMISSION_CONTRACT !== writerAdmissionContract ||
    origin !== env.ENGINE_COMMAND_ADMISSION_VERIFIED_ORIGIN ||
    origin === env.ENGINE_STAGING_BASE_URL ||
    !account ||
    account === env.GCP_INVOKER_SERVICE_ACCOUNT_EMAIL
  )
    fail("NOT_CONFIGURED");
  try {
    if (
      new URL(origin).origin !== origin ||
      (env.ENGINE_STAGING_BASE_URL && new URL(env.ENGINE_STAGING_BASE_URL).origin === origin) ||
      account.toLowerCase() === env.GCP_INVOKER_SERVICE_ACCOUNT_EMAIL?.toLowerCase()
    )
      fail("NOT_CONFIGURED");
    return parseStageConfig({
      ...env,
      ENGINE_STAGING_BASE_URL: origin,
      ENGINE_STAGING_ID_TOKEN_AUDIENCE: env.ENGINE_COMMAND_STAGING_ID_TOKEN_AUDIENCE,
      GCP_INVOKER_SERVICE_ACCOUNT_EMAIL: account,
    });
  } catch {
    return fail("NOT_CONFIGURED");
  }
}

export interface CommandTransport {
  fetcher: typeof fetch;
  getAccess(): Promise<DiscoveryTokenResult>;
  getWorkloadToken(): Promise<string>;
  origin: string;
}
export async function boundedText(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string> {
  const reader = body?.getReader();
  if (!reader) fail();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        fail();
      }
      chunks.push(value);
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    } catch {
      return fail();
    }
  } finally {
    reader.releaseLock();
  }
}

export class HttpDiscoveryCommandClient {
  constructor(
    private readonly transport: CommandTransport,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async execute(
    operation: "rejection",
    id: string,
    key: string,
    input: RejectionCommand,
  ): Promise<{ receipt: RejectionReceipt; requestId: string }>;
  async execute(
    operation: "promotion",
    id: string,
    key: string,
    input: PromotionCommand,
  ): Promise<{ receipt: PromotionReceipt; requestId: string }>;
  async execute(
    operation: CommandOperation,
    id: string,
    key: string,
    input: unknown,
  ): Promise<{ receipt: RejectionReceipt | PromotionReceipt; requestId: string }>;
  async execute(operation: CommandOperation, id: string, key: string, input: unknown) {
    if (!commandsEnabled(operation, this.env)) fail("NOT_CONFIGURED");
    const payload = JSON.stringify(validateCommand(operation, id, key, input));
    try {
      const origin = new URL(this.transport.origin);
      if (
        this.transport.origin !== commandConfig(this.env).origin ||
        origin.origin !== this.transport.origin ||
        origin.protocol !== "https:" ||
        !/^[a-z0-9-]+\.a\.run\.app$/.test(origin.hostname)
      )
        fail("NOT_CONFIGURED");
      // No retained user token: current membership and exact signed bearer on every attempt/replay.
      const preflight = await this.transport.getAccess();
      if (preflight.status === "denied") fail(preflight.code);
      const capability = operation === "rejection" ? "discovery.reject" : "discovery.promote";
      if (!canAdmin(preflight.role, capability)) fail("FORBIDDEN");
      const workload = await this.transport.getWorkloadToken();
      // STS/IAM can take seconds: check revocation, roles and the exact subject after the
      // exchange, immediately before dispatching a mutation with this verified bearer.
      // The writer charges its shared quota to this same identity (no BFF reservation).
      const access = await this.transport.getAccess();
      if (access.status === "denied") fail(access.code);
      if (access.subject !== preflight.subject) fail("UNAUTHENTICATED");
      if (!canAdmin(access.role, capability)) fail("FORBIDDEN");
      // Re-read the gates after the async work: a flag closed meanwhile dispatches nothing.
      if (!commandsEnabled(operation, this.env) || commandConfig(this.env).origin !== origin.origin)
        fail("NOT_CONFIGURED");
      const response = await this.transport.fetcher(
        `${origin.origin}/api/admin/v1/discovery/candidates/${id}/${operation}`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${access.accessToken}`,
            "X-Serverless-Authorization": `Bearer ${workload}`,
            "Idempotency-Key": key,
          },
          body: payload,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(30000),
        },
      );
      const requestId = response.headers.get("x-request-id");
      if (
        !isUuid(requestId) ||
        !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "") ||
        !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get("cache-control") ?? "")
      )
        fail("INCOMPATIBLE_CONTRACT");
      let body: Record<string, unknown>;
      try {
        body = object(JSON.parse(await boundedText(response.body, 8192)));
      } catch {
        throw new DiscoveryCommandError("INCOMPATIBLE_CONTRACT", requestId);
      }
      if (response.status !== 200) {
        const allowed: CommandErrorCode[] = [
          "INVALID_REQUEST",
          "UNAUTHENTICATED",
          "FORBIDDEN",
          "NOT_FOUND",
          "RATE_LIMITED",
          "WRITE_UNAVAILABLE",
          ...(operation === "rejection"
            ? (["REJECTION_CONFLICT", "INVALID_REJECTION_REASON"] as const)
            : ([
                "PROMOTION_CONFLICT",
                "CLASSIFICATION_NOT_SUPPORTED",
                "ADAPTER_NOT_REGISTERED",
                "INVALID_ALLOWED_DOMAINS",
                "INVALID_REQUEST_BUDGET",
              ] as const)),
        ];
        const code = body.code as CommandErrorCode;
        if (!allowed.includes(code) || commandStatus[code] !== response.status || body.requestId !== requestId)
          throw new DiscoveryCommandError("INCOMPATIBLE_CONTRACT", requestId);
        if (code === "RATE_LIMITED") {
          // Engine's authoritative denial always carries a delta-seconds hint.
          const retryAfter = response.headers.get("retry-after") ?? "";
          if (!/^[1-9][0-9]{0,4}$/.test(retryAfter) || Number(retryAfter) > 86400)
            throw new DiscoveryCommandError("INCOMPATIBLE_CONTRACT", requestId);
          throw new DiscoveryCommandError(code, requestId, Number(retryAfter));
        }
        throw new DiscoveryCommandError(code, requestId);
      }
      const invalid = () => {
        throw new DiscoveryCommandError("INCOMPATIBLE_CONTRACT", requestId);
      };
      if (body.candidateId !== id || !isUuid(body.reviewId)) invalid();
      const timestamp = operation === "rejection" ? body.reviewedAt : body.promotedAt;
      if (
        typeof timestamp !== "string" ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(timestamp) ||
        !Number.isFinite(Date.parse(timestamp))
      )
        invalid();
      if (operation === "rejection") {
        if (
          body.reviewStatus !== "REJECTED" ||
          body.reasonCode !== (input as RejectionCommand).reasonCode ||
          body.reviewerRef !== access.subject
        )
          invalid();
        return {
          requestId,
          receipt: {
            candidateId: id,
            reviewId: body.reviewId as string,
            reviewStatus: "REJECTED" as const,
            reasonCode: body.reasonCode as RejectionCommand["reasonCode"],
            reviewerRef: access.subject,
            reviewedAt: timestamp as string,
          },
        };
      }
      if (!isUuid(body.sourceId) || typeof body.reusedSource !== "boolean") invalid();
      return {
        requestId,
        receipt: {
          candidateId: id,
          reviewId: body.reviewId as string,
          sourceId: body.sourceId as string,
          reusedSource: body.reusedSource as boolean,
          promotedAt: timestamp as string,
        },
      };
    } catch (error) {
      // Timeout/transport loss is an uncertain outcome: never retried here. The writer
      // retains its admission slot; the browser keeps the exact key/payload for replay.
      if (error instanceof DiscoveryCommandError) throw error;
      throw new DiscoveryCommandError("WRITE_UNAVAILABLE");
    }
  }
}

export function createCommandClient() {
  const config = commandConfig();
  return new HttpDiscoveryCommandClient({
    origin: config.origin,
    fetcher: fetch,
    getAccess: getDiscoveryAccessToken,
    getWorkloadToken: () => workloadToken(config),
  });
}
