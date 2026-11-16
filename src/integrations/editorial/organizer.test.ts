import { describe, expect, it, vi } from "vitest";
import type { DiscoveryTokenResult } from "@/integrations/auth/discoveryToken";
import { isOrganizerOfficialUrl, isValidOrganizerName, normalizeOrganizerName } from "@/domain/editorialTrust";
import {
  editorialOrganizerCreationEnabled,
  editorialTrustReviewedSha,
  handleEditorialOrganizerCreation,
  validateOrganizerInput,
} from "./boundary";

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/auth/supabaseServer", () => ({ createAuthClient: vi.fn() }));

const organizerId = "0a9b0ff0-8001-4000-8000-222222222222";
const channelId = "c4a2a2a2-1111-4000-8000-333333333333";
const actor = "20a2a2a2-1111-4000-8000-111111111111";
const key = "11a2a2a2-1111-4000-8000-111111111111";
const origin = "https://sports-events-web-staging.vercel.app";
const engine = "https://editorial-staging.example.org";
const evidenceUrl = "https://organizer.example.org/aviso-legal/";
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  APP_ENV: "staging",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_TARGET_ENV: "production",
  VERCEL_PROJECT_ID: "prj_MU4pprIXpAdKUGcBPx8uWztULHxb",
  VERCEL_GIT_COMMIT_REF: "develop",
  APP_ORIGIN: origin,
  NEXT_PUBLIC_SUPABASE_URL: "https://yfytzogjrhwstcnzspdv.supabase.co",
  ADMIN_DEV_AUTH_MODE: "disabled",
  EDITORIAL_B1_ENABLED: "enabled",
  EDITORIAL_ENGINE_REVIEWED_SHA: "eb4f4f5604a27ec410cdb5342ea5ef89a8b4378c",
  EDITORIAL_ENGINE_STAGING_ORIGIN: engine,
  EDITORIAL_ENGINE_VERIFIED_ORIGIN: engine,
  EDITORIAL_TRUST_ENABLED: "enabled",
  EDITORIAL_ENGINE_TRUST_REVIEWED_SHA: editorialTrustReviewedSha,
  EDITORIAL_ORGANIZER_CREATION_ENABLED: "enabled",
  ENGINE_COMMAND_STAGING_BASE_URL: "https://writer.a.run.app",
  ENGINE_STAGING_BASE_URL: "https://reader.a.run.app",
};

const input = {
  canonicalName: "Club Atletismo Ejemplo",
  officialUrl: "https://organizer.example.org",
  reason: "Club titular del dominio según su aviso legal",
  evidenceUrl,
};
const engineReceipt = {
  commandKey: key,
  organizerId,
  canonicalName: "Club Atletismo Ejemplo",
  officialUrl: "https://organizer.example.org",
  officialChannelId: channelId,
  verifiedAt: "2026-11-16T10:00:00.000001Z",
  status: "CREATED",
  recordedAt: "2026-11-16T10:00:00.000002Z",
};

function upstream(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
function request(
  body: unknown = input,
  headers: Record<string, string> = {},
  path = "/api/internal/editorial/organizers",
) {
  return new Request(origin + path, {
    method: headers[":method"] ?? "POST",
    headers: Object.fromEntries(
      Object.entries({
        Host: new URL(origin).host,
        Origin: origin,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        ...headers,
      }).filter(([name, value]) => !name.startsWith(":") && value !== ""),
    ),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function setup(role: "admin" | "reviewer" = "admin", deployment: NodeJS.ProcessEnv = { ...env }) {
  const getAccess = vi
    .fn<() => Promise<DiscoveryTokenResult>>()
    .mockResolvedValue({ status: "authorized", role, subject: actor, accessToken: "private-jwt" });
  const fetcher = vi.fn<typeof fetch>();
  const getWorkloadToken = vi.fn(async () => "aaaa.bbbb.cccc");
  const deps = { env: deployment, getAccess, getWorkloadToken, fetcher };
  const run = (req = request()) => handleEditorialOrganizerCreation(req, deps);
  return { getAccess, getWorkloadToken, fetcher, run };
}

describe("V022 organizer registration BFF: positive path", () => {
  it("forwards the exact body once with the admin bearer and returns the receipt", async () => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValue(upstream(engineReceipt));
    const response = await ctx.run();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toEqual({ ...engineReceipt, action: "CREATE_ORGANIZER" });
    expect(ctx.getAccess).toHaveBeenCalledTimes(2);
    expect(ctx.fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = ctx.fetcher.mock.calls[0];
    expect(url).toBe(engine + "/api/editorial/v1/organizers");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer private-jwt",
      "Idempotency-Key": key,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      canonicalName: input.canonicalName,
      officialUrl: input.officialUrl,
      reason: input.reason + " · Evidencia: " + evidenceUrl,
      distinctFromOrganizerIds: [],
    });
  });

  it("inherits the Cloud Run ID token header through the single Engine call", async () => {
    const withAudience = { ...env, EDITORIAL_ENGINE_ID_TOKEN_AUDIENCE: engine };
    const ctx = setup("admin", withAudience);
    ctx.fetcher.mockResolvedValue(upstream(engineReceipt));
    expect((await ctx.run()).status).toBe(200);
    expect(ctx.getWorkloadToken).toHaveBeenCalledWith(withAudience, engine);
    expect(ctx.fetcher.mock.calls[0][1]?.headers).toHaveProperty("X-Serverless-Authorization", "Bearer aaaa.bbbb.cccc");
  });

  it("uses the 12 s command budget", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    const ctx = setup();
    ctx.fetcher.mockResolvedValue(upstream(engineReceipt));
    await ctx.run();
    expect(spy).toHaveBeenCalledWith(12_000);
    spy.mockRestore();
  });
});

describe("V022 organizer registration BFF: activation gate fails closed", () => {
  it.each([
    { EDITORIAL_ORGANIZER_CREATION_ENABLED: undefined },
    { EDITORIAL_ORGANIZER_CREATION_ENABLED: "true" },
    { EDITORIAL_TRUST_ENABLED: undefined },
    { EDITORIAL_ENGINE_TRUST_REVIEWED_SHA: "e66bc3a" },
    { EDITORIAL_B1_ENABLED: "disabled" },
    { VERCEL_ENV: "preview" },
    { EDITORIAL_ENGINE_VERIFIED_ORIGIN: "https://other.example.org" },
    { EDITORIAL_ENGINE_ID_TOKEN_AUDIENCE: "https://other.example.org" },
  ])("returns NOT_CONFIGURED without session read or dispatch for %o", async (change) => {
    const ctx = setup("admin", { ...env, ...change });
    const response = await ctx.run();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "NOT_CONFIGURED" });
    expect(ctx.getAccess).not.toHaveBeenCalled();
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it("is disabled by default and needs its own switch on top of the trust gate", () => {
    expect(editorialOrganizerCreationEnabled({ NODE_ENV: "test" })).toBe(false);
    expect(editorialOrganizerCreationEnabled({ ...env, EDITORIAL_ORGANIZER_CREATION_ENABLED: undefined })).toBe(false);
    expect(editorialOrganizerCreationEnabled(env)).toBe(true);
  });
});

describe("V022 organizer registration BFF: request constraints before any session read", () => {
  it.each([
    ["cross origin", request(input, { Origin: "https://evil.example" })],
    ["missing origin", request(input, { Origin: "" })],
    ["cross-site fetch", request(input, { "Sec-Fetch-Site": "cross-site" })],
    ["wrong host", request(input, { Host: "evil.example" })],
    ["compressed body", request(input, { "Content-Encoding": "gzip" })],
    ["PUT", request(input, { ":method": "PUT" })],
    ["query string", request(input, {}, "/api/internal/editorial/organizers?x=1")],
  ])("rejects %s with 403", async (_name, req) => {
    const ctx = setup();
    expect((await ctx.run(req)).status).toBe(403);
    expect(ctx.getAccess).not.toHaveBeenCalled();
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["missing key", request(input, { "Idempotency-Key": "" })],
    ["uppercase key", request(input, { "Idempotency-Key": key.toUpperCase() })],
    ["text/plain", request(input, { "Content-Type": "text/plain" })],
    ["acknowledged organizers", request({ ...input, distinctFromOrganizerIds: [organizerId] })],
    [
      "engine-shaped body",
      request({ canonicalName: input.canonicalName, officialUrl: input.officialUrl, reason: "x" }),
    ],
    ["missing evidence", request({ ...input, evidenceUrl: undefined })],
    ["padded reason", request({ ...input, reason: " motivo " })],
    ["bidi reason", request({ ...input, reason: "a‮b" })],
    ["too long reason", request({ ...input, reason: "a".repeat(990) })],
    ["evidence with query", request({ ...input, evidenceUrl: evidenceUrl + "?a=1" })],
    ["non-normalized name", request({ ...input, canonicalName: "Club  Atletismo" })],
    ["one-letter name", request({ ...input, canonicalName: "C" })],
    ["digit-only name", request({ ...input, canonicalName: "2026" })],
    ["zero-width name", request({ ...input, canonicalName: "AC​B" })],
    ["URL with path", request({ ...input, officialUrl: "https://organizer.example.org/inscripciones" })],
    ["http URL", request({ ...input, officialUrl: "http://organizer.example.org" })],
    ["uppercase host", request({ ...input, officialUrl: "https://Organizer.example.org" })],
    ["URL with port", request({ ...input, officialUrl: "https://organizer.example.org:8443" })],
    ["IP URL", request({ ...input, officialUrl: "https://10.0.0.1" })],
    ["array body", request([input])],
    ["malformed JSON", request("{")],
    ["oversized body", request({ ...input, canonicalName: "a".repeat(5000) })],
  ])("rejects %s with 400", async (_name, req) => {
    const ctx = setup();
    const response = await ctx.run(req);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_REQUEST" });
    expect(ctx.getAccess).not.toHaveBeenCalled();
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });
});

describe("V022 organizer registration BFF: role, conflicts and uncertain outcomes", () => {
  it("never forwards for a reviewer, so no ID token is minted", async () => {
    const ctx = setup("reviewer", { ...env, EDITORIAL_ENGINE_ID_TOKEN_AUDIENCE: engine });
    const response = await ctx.run();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "FORBIDDEN" });
    expect(ctx.getWorkloadToken).not.toHaveBeenCalled();
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it("stops when the session changes subject between reads", async () => {
    const ctx = setup();
    ctx.getAccess
      .mockResolvedValueOnce({ status: "authorized", role: "admin", subject: actor, accessToken: "a" })
      .mockResolvedValueOnce({ status: "authorized", role: "admin", subject: organizerId, accessToken: "b" });
    expect((await ctx.run()).status).toBe(401);
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it.each(["ORGANIZER_EXISTS", "ORGANIZER_AMBIGUOUS"])("relays a 409 %s with the public matches", async (reason) => {
    const ctx = setup();
    const organizers = [{ id: organizerId, canonicalName: "Club Atletismo Ejemplo" }];
    ctx.fetcher.mockResolvedValue(upstream({ code: "CONFLICT", reason, organizers, detail: "sql" }, 409));
    const response = await ctx.run();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "CONFLICT", reason, organizers });
  });

  it("drops a 409 reason that does not belong to registrations", async () => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValue(upstream({ code: "CONFLICT", reason: "ALIAS_IN_USE", organizers: [] }, 409));
    expect(await (await ctx.run()).json()).toEqual({ code: "CONFLICT" });
  });

  it("reports a timeout as WRITE_UNAVAILABLE, never as success", async () => {
    const ctx = setup();
    ctx.fetcher.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const response = await ctx.run();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "WRITE_UNAVAILABLE" });
  });

  it.each([
    ["other key", { ...engineReceipt, commandKey: channelId }],
    ["other status", { ...engineReceipt, status: "EXISTS" }],
    ["other name", { ...engineReceipt, canonicalName: "Club Atletismo" }],
    ["other URL", { ...engineReceipt, officialUrl: "https://www.organizer.example.org" }],
    ["missing channel", { ...engineReceipt, officialChannelId: null }],
    ["bad organizer id", { ...engineReceipt, organizerId: "x" }],
    ["bad verifiedAt", { ...engineReceipt, verifiedAt: "today" }],
    ["array", [engineReceipt]],
  ])("treats a receipt with %s as an incompatible contract", async (_name, body) => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValue(upstream(body));
    const response = await ctx.run();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "INCOMPATIBLE_CONTRACT" });
  });
});

describe("V022 organizer registration validators", () => {
  it("normalizes names like the Engine and accepts only the presentation form", () => {
    expect(normalizeOrganizerName("  Club  Atletismo ")).toBe("Club Atletismo");
    expect(isValidOrganizerName("Federació Esportiva d'Exemple")).toBe(true);
    expect(isValidOrganizerName("ACB")).toBe(true);
    expect(isValidOrganizerName("Club  Atletismo")).toBe(false);
  });

  it("accepts only an official origin", () => {
    expect(isOrganizerOfficialUrl("https://www.organizer.example.org")).toBe(true);
    expect(isOrganizerOfficialUrl("https://organizer.example.org/")).toBe(true);
    expect(isOrganizerOfficialUrl("https://organizer.example.org/aviso-legal/")).toBe(false);
  });

  it("always sends an empty acknowledgement list and exactly four Engine keys", () => {
    const body = validateOrganizerInput(input);
    expect(Object.keys(body)).toEqual(["canonicalName", "officialUrl", "reason", "distinctFromOrganizerIds"]);
    expect(body.distinctFromOrganizerIds).toEqual([]);
  });
});
