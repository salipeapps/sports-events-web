import "server-only";

import { randomUUID } from "node:crypto";
import { isSafeRegistrationUrl } from "@/domain/registration";
import { isApprovedStagingDeployment } from "@/integrations/discovery/readApi";
import { getDiscoveryAccessToken, type DiscoveryTokenResult } from "@/integrations/auth/discoveryToken";
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
const actions = ["APPROVE", "REJECT", "CORRECT", "RESOLVE_CONFLICTS", "PUBLISH", "SUSPEND"] as const;
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
    (env.EDITORIAL_ENGINE_REVIEWED_SHA === "eb4f4f5604a27ec410cdb5342ea5ef89a8b4378c" ||
      (env.EDITORIAL_REGISTRATION_ENABLED === "enabled" &&
        env.EDITORIAL_ENGINE_REVIEWED_SHA === "fd593be3d44c48080fd211c2b390e0a055133e3a"))
  );
}

interface EditorialConfig {
  origin: string;
}
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
    return { origin };
  } catch {
    return fail("NOT_CONFIGURED");
  }
}
interface Dependencies {
  env: NodeJS.ProcessEnv;
  getAccess(): Promise<DiscoveryTokenResult>;
  fetcher: typeof fetch;
}
const defaults: Dependencies = {
  env: process.env,
  getAccess: getDiscoveryAccessToken,
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
function respond(value: unknown, code: number) {
  return Response.json(value, {
    status: code,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Request-ID": randomUUID(),
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
function validateRequest(request: Request, operation: Operation, env: NodeJS.ProcessEnv) {
  const origin = env.APP_ORIGIN;
  const url = new URL(request.url);
  if (!origin || url.origin !== origin || url.search || request.headers.get("host") !== new URL(origin).host)
    fail("FORBIDDEN");
  if (operation === "inspect") {
    if (request.method !== "GET") fail("INVALID_REQUEST");
    return;
  }
  if (
    request.method !== "POST" ||
    request.headers.get("origin") !== origin ||
    (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin") ||
    request.headers.has("content-encoding")
  )
    fail("FORBIDDEN");
}

/** Server-only HTTPS BFF. The Java runtime verifies the user's Supabase JWT and live membership. */
/**
 * A cold Engine instance took ~14 s to answer its first read in STAGING (#54). Reads are
 * idempotent, so they get room for a cold start; commands keep the short budget because an
 * uncertain outcome is already retried with the same Idempotency-Key.
 */
export function upstreamTimeoutMs(operation: Operation): number {
  return operation === "inspect" ? 25_000 : 12_000;
}

export async function handleEditorialB1(
  request: Request,
  operation: Operation,
  candidateId: string | null,
  deps: Dependencies = defaults,
): Promise<Response> {
  try {
    const config = editorialConfig(deps.env);
    const registrationContract = deps.env.EDITORIAL_REGISTRATION_ENABLED === "enabled";
    if ((operation !== "import" && !isUuid(candidateId)) || (operation === "import" && candidateId !== null))
      fail("INVALID_REQUEST");
    validateRequest(request, operation, deps.env);
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
    const first = await deps.getAccess();
    if (first.status === "denied") fail(first.code);
    allowRole(first, operation, action);
    const current = await deps.getAccess();
    if (current.status === "denied") fail(current.code);
    if (current.subject !== first.subject) fail("UNAUTHENTICATED");
    allowRole(current, operation, action);
    if (editorialConfig(deps.env).origin !== config.origin) fail("NOT_CONFIGURED");
    const path =
      operation === "import"
        ? "/api/editorial/v1/imports"
        : "/api/editorial/v1/candidates/" + candidateId + (operation === "command" ? "/commands" : "");
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: "Bearer " + current.accessToken,
    };
    if (operation !== "inspect") {
      headers["Idempotency-Key"] = key!;
      headers["Content-Type"] = type!;
      if (reason !== undefined) headers["X-Editorial-Reason"] = reason;
    }
    const upstream = await deps.fetcher(config.origin + path, {
      method: operation === "inspect" ? "GET" : "POST",
      headers,
      body: rawBody,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(upstreamTimeoutMs(operation)),
    });
    if (
      !/^application\/json(?:;|$)/i.test(upstream.headers.get("content-type") ?? "") ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(upstream.headers.get("cache-control") ?? "")
    )
      fail("INCOMPATIBLE_CONTRACT");
    const result = JSON.parse(await bounded(upstream, operation === "inspect" ? 65536 : 8192));
    if (!upstream.ok) {
      const allowed: Record<number, string> = {
        400: "INVALID_REQUEST",
        401: "UNAUTHENTICATED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        429: "RATE_LIMITED",
        503: "WRITE_UNAVAILABLE",
      };
      if (!isRecord(result) || result.code !== allowed[upstream.status]) fail("INCOMPATIBLE_CONTRACT");
      return respond({ code: result.code }, upstream.status);
    }
    if (upstream.status !== 200) fail("INCOMPATIBLE_CONTRACT");
    if (operation === "inspect") {
      const inspection = normalizeInspection(result, candidateId!);
      if (registrationContract && !inspection.registrationSupported) fail("INCOMPATIBLE_CONTRACT");
      return respond(inspection, 200);
    }
    return respond(normalizeReceipt(result), 200);
  } catch (error) {
    const err =
      error instanceof EditorialBffError
        ? error
        : error instanceof EditorialInspectionError
          ? new EditorialBffError("INCOMPATIBLE_CONTRACT")
          : error instanceof SyntaxError
            ? new EditorialBffError("INVALID_REQUEST")
            : new EditorialBffError("WRITE_UNAVAILABLE");
    return respond({ code: err.code }, status[err.code]);
  }
}
