import "server-only";

import { randomUUID } from "node:crypto";
import { isSafeRegistrationUrl } from "@/domain/registration";
import { isApprovedStagingDeployment, workloadIdentityConfig, workloadToken } from "@/integrations/discovery/readApi";
import { getDiscoveryAccessToken, type DiscoveryTokenResult } from "@/integrations/auth/discoveryToken";
import {
  composeTrustReason,
  isOfficialChannelOrigin,
  isOrganizerOfficialUrl,
  isValidAlias,
  isValidOrganizerName,
  maxAliasLength,
  organizerAction,
  organizerPath,
  organizerStatus,
  type OrganizerReceipt,
  trustActions,
  trustMethod,
  trustOperations,
  trustPath,
  trustStatuses,
  type TrustOperation,
  type TrustReceipt,
} from "@/domain/editorialTrust";
import { EditorialInspectionError, normalizeInspection } from "./inspection";

type Operation = "inspect" | "command" | "import";
type ErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "WRITE_UNAVAILABLE"
  | "INCOMPATIBLE_CONTRACT";
type Access = Extract<DiscoveryTokenResult, { status: "authorized" }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const actions = ["APPROVE", "REJECT", "CORRECT", "RESOLVE_CONFLICTS", "PUBLISH", "SUSPEND", "REVERIFY"] as const;
const categories = ["yoga", "running", "hiking", "cycling", "fitness", "swimming", "dance", "other"];
const status: Record<ErrorCode, number> = {
  NOT_CONFIGURED: 404,
  INVALID_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  WRITE_UNAVAILABLE: 503,
  INCOMPATIBLE_CONTRACT: 503,
};

export class EditorialBffError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}
function fail(code: ErrorCode): never {
  throw new EditorialBffError(code);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function str(value: unknown): value is string {
  return typeof value === "string";
}
function exactKeys(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).length !== keys.length || keys.some((key) => !Object.hasOwn(body, key)))
    fail("INVALID_REQUEST");
}
function isUuid(value: unknown): value is string {
  return str(value) && uuid.test(value);
}
function isPositiveVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isValidReason(value: unknown): boolean {
  return str(value) && value.trim().length > 0 && value.length <= 1000 && !/[\x00-\x1f]/.test(value);
}
function isHttpsVerificationUrl(value: unknown, registrationVerified = false): boolean {
  if (!str(value) || value.length > 2048) return false;
  try {
    // Preserve the audited evidence URI for Java's equality check; WHATWG serialization can change it.
    if (registrationVerified) return isSafeRegistrationUrl(value);
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !url.port &&
      url.href === value
    );
  } catch {
    return false;
  }
}
export function validateEditorialCommand(
  value: unknown,
): { action: (typeof actions)[number] } & Record<string, unknown> {
  if (
    !isRecord(value) ||
    !actions.includes(value.action as (typeof actions)[number]) ||
    !isPositiveVersion(value.expectedVersion) ||
    value.expectedVersion < 1 ||
    !isPositiveVersion(value.expectedRevision) ||
    !isValidReason(value.reason)
  )
    fail("INVALID_REQUEST");
  const action = value.action as (typeof actions)[number];
  const common = ["action", "expectedVersion", "expectedRevision", "reason"];
  if (action === "APPROVE") {
    exactKeys(value, [
      ...common,
      "verificationUrl",
      "category",
      ...(Object.hasOwn(value, "registrationVerified") ? ["registrationVerified"] : []),
    ]);
    if (Object.hasOwn(value, "registrationVerified") && value.registrationVerified !== true) fail("INVALID_REQUEST");
    if (
      !isHttpsVerificationUrl(value.verificationUrl, value.registrationVerified === true) ||
      !categories.includes(value.category as string)
    )
      fail("INVALID_REQUEST");
  } else if (action === "REVERIFY") {
    exactKeys(value, [...common, "verificationUrl", "registrationVerified"]);
    if (value.registrationVerified !== true || !isHttpsVerificationUrl(value.verificationUrl, true))
      fail("INVALID_REQUEST");
  } else if (action === "CORRECT") {
    exactKeys(value, [...common, "correction"]);
    if (!isRecord(value.correction)) fail("INVALID_REQUEST");
  } else if (action === "RESOLVE_CONFLICTS") {
    exactKeys(value, [...common, "conflictEvidenceIds"]);
    const ids = value.conflictEvidenceIds;
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 100 ||
      !ids.every(isUuid) ||
      new Set(ids).size !== ids.length
    )
      fail("INVALID_REQUEST");
  } else exactKeys(value, common);
  return value as { action: (typeof actions)[number] } & Record<string, unknown>;
}

export function editorialB1Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    isApprovedStagingDeployment(env) &&
    env.EDITORIAL_B1_ENABLED === "enabled" &&
    env.DISCOVERY_STAGING_SMOKE_ENABLED !== "enabled" &&
    ((env.EDITORIAL_REGISTRATION_ENABLED !== "enabled" &&
      env.EDITORIAL_ENGINE_REVIEWED_SHA === "eb4f4f5604a27ec410cdb5342ea5ef89a8b4378c") ||
      (env.EDITORIAL_REGISTRATION_ENABLED === "enabled" &&
        (env.EDITORIAL_ENGINE_REVIEWED_SHA === "fd593be3d44c48080fd211c2b390e0a055133e3a" ||
          env.EDITORIAL_ENGINE_REVIEWED_SHA === "36480eea25d392a90050cf49466cf55dd478e392")))
  );
}

interface EditorialConfig {
  origin: string;
  /** Set only when the Engine enforces Cloud Run invoker IAM; then it equals the origin exactly. */
  idTokenAudience: string | null;
}
const jwtShape = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export function editorialConfig(env: NodeJS.ProcessEnv = process.env): EditorialConfig {
  if (!editorialB1Enabled(env)) fail("NOT_CONFIGURED");
  const origin = env.EDITORIAL_ENGINE_STAGING_ORIGIN;
  try {
    const url = new URL(origin ?? "");
    if (
      url.origin !== origin ||
      url.protocol !== "https:" ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.port ||
      url.username ||
      url.password ||
      origin !== env.EDITORIAL_ENGINE_VERIFIED_ORIGIN ||
      !url.hostname.includes(".") ||
      /^(localhost|.*\.localhost|.*\.local)$/.test(url.hostname) ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(":") ||
      origin === env.ENGINE_STAGING_BASE_URL ||
      origin === env.ENGINE_COMMAND_STAGING_BASE_URL
    )
      fail("NOT_CONFIGURED");
    // Empty means the Engine does not enforce invoker IAM yet; any other value must name this origin exactly.
    const audience = env.EDITORIAL_ENGINE_ID_TOKEN_AUDIENCE ?? "";
    if (audience !== "" && audience !== origin) fail("NOT_CONFIGURED");
    return { origin, idTokenAudience: audience === "" ? null : origin };
  } catch {
    return fail("NOT_CONFIGURED");
  }
}
interface Dependencies {
  env: NodeJS.ProcessEnv;
  getAccess(): Promise<DiscoveryTokenResult>;
  getWorkloadToken(env: NodeJS.ProcessEnv, audience: string): Promise<string>;
  fetcher: typeof fetch;
}
const defaults: Dependencies = {
  env: process.env,
  getAccess: getDiscoveryAccessToken,
  getWorkloadToken: (env, audience) => workloadToken(workloadIdentityConfig(env, audience)),
  fetcher: fetch,
};

async function bounded(request: Request | Response, maximum: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) fail("INVALID_REQUEST");
  const bytes: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        fail("INVALID_REQUEST");
      }
      bytes.push(item.value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(bytes));
  } finally {
    reader.releaseLock();
  }
}
function respond(value: unknown, code: number, requestId: string) {
  return Response.json(value, {
    status: code,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      // The same ID is in the server log line of the Engine call, so an uncertain outcome can be traced.
      "X-Request-ID": requestId,
      ...(code === 401 ? { "WWW-Authenticate": "Bearer" } : {}),
    },
  });
}
function allowRole(access: Access, operation: Operation, action?: string) {
  if (operation === "import" || (operation === "command" && action !== "APPROVE" && action !== "REJECT")) {
    if (access.role !== "admin") fail("FORBIDDEN");
  }
}
function normalizeReceipt(raw: unknown) {
  if (
    !isRecord(raw) ||
    !isUuid(raw.commandKey) ||
    !Array.isArray(raw.candidateIds) ||
    raw.candidateIds.length > 100 ||
    !raw.candidateIds.every(isUuid) ||
    !(raw.publicationId === null || isUuid(raw.publicationId)) ||
    !(raw.decisionId === null || isUuid(raw.decisionId)) ||
    !isPositiveVersion(raw.candidateVersion) ||
    !isPositiveVersion(raw.revision) ||
    !str(raw.status) ||
    raw.status.length > 45 ||
    !str(raw.recordedAt) ||
    !Number.isFinite(Date.parse(raw.recordedAt))
  )
    fail("INCOMPATIBLE_CONTRACT");
  return {
    commandKey: raw.commandKey,
    candidateIds: raw.candidateIds,
    publicationId: raw.publicationId,
    decisionId: raw.decisionId,
    candidateVersion: raw.candidateVersion,
    revision: raw.revision,
    status: raw.status,
    recordedAt: raw.recordedAt,
  };
}
function validateRequest(request: Request, method: "GET" | "POST" | "PUT", env: NodeJS.ProcessEnv) {
  const origin = env.APP_ORIGIN;
  const url = new URL(request.url);
  if (!origin || url.origin !== origin || url.search || request.headers.get("host") !== new URL(origin).host)
    fail("FORBIDDEN");
  if (method === "GET") {
    if (request.method !== "GET") fail("INVALID_REQUEST");
    return;
  }
  if (
    request.method !== method ||
    request.headers.get("origin") !== origin ||
    (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin") ||
    request.headers.has("content-encoding")
  )
    fail("FORBIDDEN");
}

/** Server-only HTTPS BFF. The Java runtime verifies the user's Supabase JWT and live membership. */
/**
 * A cold Engine instance took ~14 s to answer its first read in STAGING (#54) and ~31 s on
 * 2026-11-14 (Cloud Run 0..1 instances, ~22 s of Spring startup). Reads are idempotent, so they
 * get room for a cold start; commands keep the short budget because an uncertain outcome is
 * already retried with the same Idempotency-Key, and a readiness probe (`warmEngine`) wakes the instance first.
 */
export function upstreamTimeoutMs(operation: Operation): number {
  return operation === "inspect" ? 45_000 : 12_000;
}

/**
 * The trust panel has no inspector read before its commands, so the first command of a window met a cold Engine and
 * its 12 s budget expired while the Engine still wrote (STAGING 15/11 and 16/11, Engine #125). B1 commands met the
 * same answer-lost-after-commit on 20/11 (#88): the inspector read does not keep a 0..1 instance warm while the admin
 * fills a form. Every B1 command and import, and every trust and organizer command, is therefore preceded by an
 * unauthenticated readiness probe with room for a cold start. The route budget is 38 s (probe) + 12 s (command) +
 * 10 s margin = the 60 s Hobby limit.
 */
export const engineWarmupTimeoutMs = 38_000;
const engineWarmupPath = "/actuator/health/readiness";

export async function handleEditorialB1(
  request: Request,
  operation: Operation,
  candidateId: string | null,
  deps: Dependencies = defaults,
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const config = editorialConfig(deps.env);
    const registrationContract = deps.env.EDITORIAL_REGISTRATION_ENABLED === "enabled";
    if ((operation !== "import" && !isUuid(candidateId)) || (operation === "import" && candidateId !== null))
      fail("INVALID_REQUEST");
    validateRequest(request, operation === "inspect" ? "GET" : "POST", deps.env);
    let rawBody: string | undefined, action: string | undefined, type: string | undefined, reason: string | undefined;
    const key = request.headers.get("idempotency-key");
    if (operation !== "inspect") {
      if (!isUuid(key)) fail("INVALID_REQUEST");
      type = request.headers.get("content-type") ?? "";
      if (operation === "command") {
        if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type)) fail("INVALID_REQUEST");
        rawBody = await bounded(request, 16384);
        const payload = validateEditorialCommand(JSON.parse(rawBody));
        action = payload.action;
        if (
          registrationContract &&
          ((action === "APPROVE" && payload.registrationVerified !== true) ||
            (action === "CORRECT" &&
              (!isRecord(payload.correction) || !Object.hasOwn(payload.correction, "registration"))))
        )
          fail("INVALID_REQUEST");
      } else {
        if (!/^(application\/json|text\/csv)(?:;\s*charset=utf-8)?$/i.test(type)) fail("INVALID_REQUEST");
        reason = request.headers.get("x-editorial-reason") ?? "";
        if (!isValidReason(reason)) fail("INVALID_REQUEST");
        rawBody = await bounded(request, 262144);
      }
    }
    const current = await authorizeTwice(deps, (access) => allowRole(access, operation, action));
    if (editorialConfig(deps.env).origin !== config.origin) fail("NOT_CONFIGURED");
    const headers: Record<string, string> = {};
    if (operation !== "inspect") {
      headers["Idempotency-Key"] = key!;
      headers["Content-Type"] = type!;
      if (reason !== undefined) headers["X-Editorial-Reason"] = reason;
    }
    const call: EngineCall = {
      method: operation === "inspect" ? "GET" : "POST",
      path:
        operation === "import"
          ? "/api/editorial/v1/imports"
          : "/api/editorial/v1/candidates/" + candidateId + (operation === "command" ? "/commands" : ""),
      headers,
      body: rawBody,
      timeoutMs: upstreamTimeoutMs(operation),
      maxBytes: operation === "inspect" ? 65536 : 8192,
      trace: { requestId, op: "b1." + operation, commandKey: key, target: candidateId },
    };
    // A write is never sent to a cold Engine with only its 12 s budget (#88); a read has its own 45 s instead.
    if (operation !== "inspect") await warmEngine(deps, config, current, call.trace);
    const upstream = await callEngine(deps, config, current, call);
    return settle(call, upstream, () => {
      if (!upstream.ok) return engineFailure(upstream, requestId);
      if (operation === "inspect") {
        const inspection = normalizeInspection(upstream.result, candidateId!);
        if (registrationContract && !inspection.registrationSupported) fail("INCOMPATIBLE_CONTRACT");
        return respond(inspection, 200, requestId);
      }
      return respond(normalizeReceipt(upstream.result), 200, requestId);
    });
  } catch (error) {
    return failure(error, requestId);
  }
}

function failure(error: unknown, requestId: string): Response {
  const err =
    error instanceof EditorialBffError
      ? error
      : error instanceof EditorialInspectionError
        ? new EditorialBffError("INCOMPATIBLE_CONTRACT")
        : error instanceof SyntaxError
          ? new EditorialBffError("INVALID_REQUEST")
          : new EditorialBffError("WRITE_UNAVAILABLE");
  return respond({ code: err.code }, status[err.code], requestId);
}

/** Two reads of the live session with the same subject; `allow` throws when the role may not act. */
async function authorizeTwice(deps: Dependencies, allow: (access: Access) => void): Promise<Access> {
  const first = await deps.getAccess();
  if (first.status === "denied") fail(first.code);
  allow(first);
  const current = await deps.getAccess();
  if (current.status === "denied") fail(current.code);
  if (current.subject !== first.subject) fail("UNAUTHENTICATED");
  allow(current);
  return current;
}

interface EngineCall {
  method: "GET" | "POST" | "PUT";
  path: string;
  /** Readiness probe: no user token, no body, any HTTP answer means the instance is up; the answer is discarded. */
  probe?: boolean;
  /** Operation-specific headers only; Accept and Authorization are set once, here. */
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxBytes: number;
  trace: EngineTrace;
}
/** Correlation fields of the diagnostic line. Opaque UUIDs only: never tokens, reasons, bodies or contact data. */
interface EngineTrace {
  requestId: string;
  op: string;
  commandKey: string | null;
  target: string | null;
}
interface EngineResult {
  status: number;
  ok: boolean;
  result: unknown;
  /** `performance.now()` when the call began, for the diagnostic line written by `settle`. */
  started: number;
}

/**
 * The ONLY request this BFF sends to the Engine. Every operation (B1 inspect/command/import and the V026 trust
 * commands) goes through here, so a perimeter header is added in exactly one place. No redirects, no cache, bounded
 * body and a hard timeout: an aborted call throws and is reported as WRITE_UNAVAILABLE (uncertain), never as success.
 */
async function callEngine(
  deps: Dependencies,
  config: EditorialConfig,
  access: Access,
  call: EngineCall,
): Promise<EngineResult> {
  const started = performance.now();
  let phase: EnginePhase = "prepare";
  let httpStatus: number | null = null;
  try {
    // The user's JWT never travels on the readiness probe: it is a public Engine endpoint.
    const headers: Record<string, string> = call.probe
      ? {}
      : { Accept: "application/json", Authorization: "Bearer " + access.accessToken, ...call.headers };
    if (config.idTokenAudience) {
      phase = "workload_token";
      // Cloud Run invoker IAM (phase P): the Google ID token travels only here; the user's JWT stays in Authorization.
      const workload = await deps.getWorkloadToken(deps.env, config.idTokenAudience);
      if (!jwtShape.test(workload)) fail("WRITE_UNAVAILABLE");
      headers["X-Serverless-Authorization"] = "Bearer " + workload;
    }
    phase = "fetch";
    const upstream = await deps.fetcher(config.origin + call.path, {
      method: call.method,
      headers,
      body: call.body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(call.timeoutMs),
    });
    phase = "response";
    httpStatus = upstream.status;
    if (call.probe) {
      await upstream.body?.cancel();
      recordEngineCall(call, phase, httpStatus, started);
      return { status: upstream.status, ok: upstream.ok, result: null, started };
    }
    if (
      !/^application\/json(?:;|$)/i.test(upstream.headers.get("content-type") ?? "") ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(upstream.headers.get("cache-control") ?? "")
    )
      fail("INCOMPATIBLE_CONTRACT");
    let result: unknown;
    try {
      result = JSON.parse(await bounded(upstream, call.maxBytes));
    } catch {
      // An unreadable Engine answer is never the caller's INVALID_REQUEST: a write may have happened.
      fail("INCOMPATIBLE_CONTRACT");
    }
    if (upstream.ok && upstream.status !== 200) fail("INCOMPATIBLE_CONTRACT");
    // Not logged here: the outcome is final only after the operation's own contract check (`settle`).
    return { status: upstream.status, ok: upstream.ok, result, started };
  } catch (error) {
    recordEngineCall(call, phase, httpStatus, started, error);
    throw error;
  }
}

/**
 * Where the Engine call stopped. It tells whether the command could have reached the Engine (#88): nothing was sent
 * before `fetch`; a throw during `fetch` (timeout, reset) leaves it unknown; in `response` the Engine answered.
 */
type EnginePhase = "prepare" | "workload_token" | "fetch" | "response";
const sentByPhase: Record<EnginePhase, "no" | "unknown" | "yes"> = {
  prepare: "no",
  workload_token: "no",
  fetch: "unknown",
  response: "yes",
};
const errorCode = /^[A-Z][A-Z0-9_]{0,39}$/;

function engineCallOutcome(httpStatus: number | null, error: unknown): { outcome: string; cause: string } {
  if (error === undefined) return { outcome: httpStatus === 200 ? "ok" : "http_error", cause: "none" };
  if (error instanceof EditorialBffError) return { outcome: "rejected", cause: error.code };
  if (error instanceof EditorialInspectionError) return { outcome: "rejected", cause: "INCOMPATIBLE_CONTRACT" };
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError") return { outcome: "timeout", cause: "none" };
  if (name === "AbortError") return { outcome: "aborted", cause: "none" };
  // undici reports transport failures as TypeError("fetch failed") with a system code (ECONNRESET, UND_ERR_*) as cause.
  const code = error instanceof Error && isRecord(error.cause) ? error.cause.code : undefined;
  if (error instanceof TypeError)
    return { outcome: "network_error", cause: str(code) && errorCode.test(code) ? code : "none" };
  return { outcome: "unexpected", cause: "none" };
}

/**
 * One line per Engine call, so an uncertain write can be traced to its phase, latency and budget and joined to
 * `editorial_receipts.command_key` and the Cloud Run request log by time (#88). Only opaque UUIDs, enumerations and
 * numbers are written: no token, header, URL, body, reason or contact data.
 */
function recordEngineCall(
  call: EngineCall,
  phase: EnginePhase,
  httpStatus: number | null,
  started: number,
  error?: unknown,
): void {
  const { outcome, cause } = engineCallOutcome(httpStatus, error);
  const id = (value: string | null) => (isUuid(value) ? value : "none");
  const line = [
    "MOUMEET_EDITORIAL_ENGINE_CALL",
    "request_id=" + id(call.trace.requestId),
    "op=" + call.trace.op,
    "method=" + call.method,
    "phase=" + phase,
    "sent=" + sentByPhase[phase],
    "outcome=" + outcome,
    "cause=" + cause,
    "http_status=" + (httpStatus ?? "none"),
    "elapsed_ms=" + Math.round(performance.now() - started),
    "budget_ms=" + call.timeoutMs,
    "command_key=" + id(call.trace.commandKey),
    "target=" + id(call.trace.target),
  ].join(" ");
  // A 4xx is a definite Engine answer; a 5xx, a timeout or an unreadable answer leaves a write uncertain.
  if (outcome === "ok" || (outcome === "http_error" && httpStatus! < 500)) console.info(line);
  else console.error(line);
}

/**
 * Turns an Engine answer into the BFF response and writes its diagnostic line with the FINAL outcome: a 200 whose
 * receipt or inspection fails the contract check, or a malformed error envelope, is logged as uncertain, never as ok.
 */
function settle(call: EngineCall, upstream: EngineResult, finish: () => Response): Response {
  try {
    const response = finish();
    recordEngineCall(call, "response", upstream.status, upstream.started);
    return response;
  } catch (error) {
    recordEngineCall(call, "response", upstream.status, upstream.started, error);
    throw error;
  }
}

/**
 * Wakes a cold Engine before a command so the command's short budget is not spent on the cold start. A probe that
 * fails (timeout, network, redirect) throws before the command is sent: reported as WRITE_UNAVAILABLE and retried
 * with the same Idempotency-Key, which is harmless because nothing reached the Engine's command endpoint.
 */
async function warmEngine(
  deps: Dependencies,
  config: EditorialConfig,
  access: Access,
  trace: EngineTrace,
): Promise<void> {
  await callEngine(deps, config, access, {
    method: "GET",
    path: engineWarmupPath,
    headers: {},
    timeoutMs: engineWarmupTimeoutMs,
    maxBytes: 0,
    probe: true,
    trace: { ...trace, op: trace.op + ".probe" },
  });
}

const engineErrors: Record<number, ErrorCode> = {
  400: "INVALID_REQUEST",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
  503: "WRITE_UNAVAILABLE",
};
/** Closed list: only a known status with its matching code is relayed, and only the code. */
function engineFailure(upstream: EngineResult, requestId: string, extra: Record<string, unknown> = {}): Response {
  if (!isRecord(upstream.result) || upstream.result.code !== engineErrors[upstream.status])
    fail("INCOMPATIBLE_CONTRACT");
  return respond({ code: upstream.result.code, ...extra }, upstream.status, requestId);
}

// ---------------------------------------------------------------------------------------------------------------
// V026 trust commands: reviewed alias, official channel and location authority. Admin only (Engine
// `authorize(jwt,false)`). Separate activation gate pinned to the reviewed Engine commit of the V026 runtime.
// ---------------------------------------------------------------------------------------------------------------

/** Engine `e66bc3a` (#280): V026 endpoints, with `PUT /sources/{id}/location-authority` open to admins. */
export const editorialTrustReviewedSha = "e66bc3abbc24ba577e0049562ac3a4c01e095953";

export function editorialTrustEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    editorialB1Enabled(env) &&
    env.EDITORIAL_TRUST_ENABLED === "enabled" &&
    env.EDITORIAL_ENGINE_TRUST_REVIEWED_SHA === editorialTrustReviewedSha
  );
}
function editorialTrustConfig(env: NodeJS.ProcessEnv): EditorialConfig {
  const config = editorialConfig(env);
  if (!editorialTrustEnabled(env)) fail("NOT_CONFIGURED");
  return config;
}

const trustInputKeys: Record<TrustOperation, string[]> = {
  alias: ["alias", "reason", "evidenceUrl"],
  channel: ["officialUrl", "reason", "evidenceUrl"],
  locationAuthority: ["authoritative", "reason", "evidenceUrl"],
};

/** Exact Web input → exact Engine body (`trustBody` in EditorialController rejects any other key or count). */
export function validateTrustInput(operation: TrustOperation, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) fail("INVALID_REQUEST");
  exactKeys(value, trustInputKeys[operation]);
  const reason =
    str(value.reason) && str(value.evidenceUrl) ? composeTrustReason(value.reason, value.evidenceUrl) : null;
  if (reason === null) fail("INVALID_REQUEST");
  if (operation === "alias") {
    if (!isValidAlias(value.alias)) fail("INVALID_REQUEST");
    return { alias: value.alias, reason };
  }
  if (operation === "channel") {
    if (!isOfficialChannelOrigin(value.officialUrl)) fail("INVALID_REQUEST");
    return { officialUrl: value.officialUrl, reason };
  }
  if (typeof value.authoritative !== "boolean") fail("INVALID_REQUEST");
  return { authoritative: value.authoritative, reason };
}

function nullable(value: unknown): boolean {
  return value === null || value === undefined;
}
function boundedText(value: unknown, maximum: number): value is string {
  return str(value) && value.length > 0 && value.length <= maximum && !/[\x00-\x1f\x7f]/.test(value);
}

export function normalizeTrustReceipt(
  raw: unknown,
  operation: TrustOperation,
  targetId: string,
  key: string,
  sent: Record<string, unknown>,
): TrustReceipt {
  if (
    !isRecord(raw) ||
    raw.commandKey !== key ||
    raw.action !== trustActions[operation] ||
    !str(raw.status) ||
    !trustStatuses[operation].includes(raw.status) ||
    !str(raw.recordedAt) ||
    !Number.isFinite(Date.parse(raw.recordedAt))
  )
    fail("INCOMPATIBLE_CONTRACT");
  const receipt: TrustReceipt = {
    commandKey: key,
    action: raw.action,
    organizerId: null,
    alias: null,
    officialUrl: null,
    channelId: null,
    sourceId: null,
    authoritative: null,
    status: raw.status,
    recordedAt: raw.recordedAt,
  };
  // V026 SQL echoes the submitted alias / official_url in both ADDED and EXISTS (Java only applies the presentation
  // normalization the BFF already enforces), so the receipt must confirm exactly what the admin reviewed.
  if (operation === "alias") {
    if (raw.organizerId !== targetId || !str(raw.alias) || raw.alias !== sent.alias) fail("INCOMPATIBLE_CONTRACT");
    if (![raw.officialUrl, raw.channelId, raw.sourceId, raw.authoritative].every(nullable))
      fail("INCOMPATIBLE_CONTRACT");
    return { ...receipt, organizerId: targetId, alias: raw.alias };
  }
  if (operation === "channel") {
    if (
      raw.organizerId !== targetId ||
      !str(raw.officialUrl) ||
      raw.officialUrl !== sent.officialUrl ||
      !isUuid(raw.channelId)
    )
      fail("INCOMPATIBLE_CONTRACT");
    if (![raw.alias, raw.sourceId, raw.authoritative].every(nullable)) fail("INCOMPATIBLE_CONTRACT");
    return { ...receipt, organizerId: targetId, officialUrl: raw.officialUrl, channelId: raw.channelId };
  }
  if (raw.sourceId !== targetId || raw.authoritative !== sent.authoritative) fail("INCOMPATIBLE_CONTRACT");
  if (![raw.organizerId, raw.alias, raw.officialUrl, raw.channelId].every(nullable)) fail("INCOMPATIBLE_CONTRACT");
  return { ...receipt, sourceId: targetId, authoritative: raw.authoritative as boolean };
}

const conflictReasons: Record<TrustOperation | "organizer", readonly string[]> = {
  alias: ["ALIAS_IN_USE"],
  channel: ["CHANNEL_IN_USE"],
  locationAuthority: [],
  organizer: ["ORGANIZER_EXISTS", "ORGANIZER_AMBIGUOUS"],
};
/** 409 detail: the public organizer names/IDs already holding the name, alias or host. Dropped unless exactly valid. */
function conflictDetail(operation: TrustOperation | "organizer", result: unknown): Record<string, unknown> {
  if (!isRecord(result) || !str(result.reason) || !conflictReasons[operation].includes(result.reason)) return {};
  const organizers = result.organizers;
  if (
    !Array.isArray(organizers) ||
    organizers.length > 20 ||
    !organizers.every(
      (item) =>
        isRecord(item) &&
        Object.keys(item).length === 2 &&
        isUuid(item.id) &&
        boundedText(item.canonicalName, maxAliasLength * 2),
    )
  )
    return { reason: result.reason };
  return {
    reason: result.reason,
    organizers: organizers.map((item: Record<string, unknown>) => ({ id: item.id, canonicalName: item.canonicalName })),
  };
}

export async function handleEditorialTrust(
  request: Request,
  operation: TrustOperation,
  targetId: string,
  deps: Dependencies = defaults,
): Promise<Response> {
  const requestId = randomUUID();
  try {
    if (!trustOperations.includes(operation)) fail("INVALID_REQUEST");
    const config = editorialTrustConfig(deps.env);
    if (!isUuid(targetId)) fail("INVALID_REQUEST");
    validateRequest(request, trustMethod(operation), deps.env);
    const key = request.headers.get("idempotency-key");
    if (!isUuid(key)) fail("INVALID_REQUEST");
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? ""))
      fail("INVALID_REQUEST");
    const body = validateTrustInput(operation, JSON.parse(await bounded(request, 4096)));
    // Engine `authorize(jwt,false)`: reviewer is never allowed on trust commands.
    const current = await authorizeTwice(deps, (access) => {
      if (access.role !== "admin") fail("FORBIDDEN");
    });
    if (editorialTrustConfig(deps.env).origin !== config.origin) fail("NOT_CONFIGURED");
    const trace = { requestId, op: "trust." + operation, commandKey: key, target: targetId };
    await warmEngine(deps, config, current, trace);
    const call: EngineCall = {
      method: trustMethod(operation),
      path: "/api/editorial/v1" + trustPath(operation, targetId),
      headers: { "Idempotency-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: upstreamTimeoutMs("command"),
      maxBytes: 8192,
      trace,
    };
    const upstream = await callEngine(deps, config, current, call);
    return settle(call, upstream, () => {
      if (!upstream.ok)
        return engineFailure(
          upstream,
          requestId,
          upstream.status === 409 ? conflictDetail(operation, upstream.result) : {},
        );
      return respond(normalizeTrustReceipt(upstream.result, operation, targetId, key, body), 200, requestId);
    });
  } catch (error) {
    return failure(error, requestId);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// V022 organizer registration (Engine #197): ONE organizer and its official channel. Admin only. Its own switch on top
// of the trust gate, so a trust window never enables registrations by accident.
// ---------------------------------------------------------------------------------------------------------------

export function editorialOrganizerCreationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return editorialTrustEnabled(env) && env.EDITORIAL_ORGANIZER_CREATION_ENABLED === "enabled";
}
function editorialOrganizerConfig(env: NodeJS.ProcessEnv): EditorialConfig {
  const config = editorialConfig(env);
  if (!editorialOrganizerCreationEnabled(env)) fail("NOT_CONFIGURED");
  return config;
}

/**
 * Exact Web input → exact Engine body. `distinctFromOrganizerIds` is always empty: this screen never acknowledges
 * similar organizers, so an AMBIGUOUS answer stops the intention for a separate human review.
 */
export function validateOrganizerInput(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) fail("INVALID_REQUEST");
  exactKeys(value, ["canonicalName", "officialUrl", "reason", "evidenceUrl"]);
  const reason =
    str(value.reason) && str(value.evidenceUrl) ? composeTrustReason(value.reason, value.evidenceUrl) : null;
  if (reason === null || !isValidOrganizerName(value.canonicalName) || !isOrganizerOfficialUrl(value.officialUrl))
    fail("INVALID_REQUEST");
  return { canonicalName: value.canonicalName, officialUrl: value.officialUrl, reason, distinctFromOrganizerIds: [] };
}

/** Engine `OrganizerReceipt`: must confirm THIS key and exactly the name and official URL the admin reviewed. */
export function normalizeOrganizerReceipt(raw: unknown, key: string, sent: Record<string, unknown>): OrganizerReceipt {
  if (
    !isRecord(raw) ||
    raw.commandKey !== key ||
    raw.status !== organizerStatus ||
    !isUuid(raw.organizerId) ||
    !isUuid(raw.officialChannelId) ||
    raw.canonicalName !== sent.canonicalName ||
    raw.officialUrl !== sent.officialUrl ||
    !str(raw.verifiedAt) ||
    !Number.isFinite(Date.parse(raw.verifiedAt)) ||
    !str(raw.recordedAt) ||
    !Number.isFinite(Date.parse(raw.recordedAt))
  )
    fail("INCOMPATIBLE_CONTRACT");
  return {
    commandKey: key,
    action: organizerAction,
    organizerId: raw.organizerId,
    canonicalName: sent.canonicalName as string,
    officialUrl: sent.officialUrl as string,
    officialChannelId: raw.officialChannelId,
    verifiedAt: raw.verifiedAt,
    status: organizerStatus,
    recordedAt: raw.recordedAt,
  };
}

export async function handleEditorialOrganizerCreation(
  request: Request,
  deps: Dependencies = defaults,
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const config = editorialOrganizerConfig(deps.env);
    validateRequest(request, "POST", deps.env);
    const key = request.headers.get("idempotency-key");
    if (!isUuid(key)) fail("INVALID_REQUEST");
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? ""))
      fail("INVALID_REQUEST");
    const body = validateOrganizerInput(JSON.parse(await bounded(request, 4096)));
    // Engine `authorize(jwt,false)`: reviewer is never allowed to register organizers.
    const current = await authorizeTwice(deps, (access) => {
      if (access.role !== "admin") fail("FORBIDDEN");
    });
    if (editorialOrganizerConfig(deps.env).origin !== config.origin) fail("NOT_CONFIGURED");
    const trace = { requestId, op: "organizer.create", commandKey: key, target: null };
    await warmEngine(deps, config, current, trace);
    const call: EngineCall = {
      method: "POST",
      path: "/api/editorial/v1" + organizerPath,
      headers: { "Idempotency-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: upstreamTimeoutMs("command"),
      maxBytes: 8192,
      trace,
    };
    const upstream = await callEngine(deps, config, current, call);
    return settle(call, upstream, () => {
      if (!upstream.ok)
        return engineFailure(
          upstream,
          requestId,
          upstream.status === 409 ? conflictDetail("organizer", upstream.result) : {},
        );
      return respond(normalizeOrganizerReceipt(upstream.result, key, body), 200, requestId);
    });
  } catch (error) {
    return failure(error, requestId);
  }
}
