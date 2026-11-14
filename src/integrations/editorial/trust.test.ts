import { describe, expect, it, vi } from "vitest";
import type { DiscoveryTokenResult } from "@/integrations/auth/discoveryToken";
import {
  composeTrustReason,
  isEvidenceUrl,
  isOfficialChannelOrigin,
  isValidAlias,
  normalizeAlias,
  type TrustOperation,
} from "@/domain/editorialTrust";
import {
  editorialTrustEnabled,
  editorialTrustReviewedSha,
  handleEditorialB1,
  handleEditorialTrust,
  validateTrustInput,
} from "./boundary";

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/auth/supabaseServer", () => ({ createAuthClient: vi.fn() }));

const organizerId = "0a9b0ff0-8001-4000-8000-222222222222";
const sourceId = "e37b522f-9d13-30e2-99ec-bffd47f2b228";
const channelId = "c4a2a2a2-1111-4000-8000-333333333333";
const actor = "20a2a2a2-1111-4000-8000-111111111111";
const key = "11a2a2a2-1111-4000-8000-111111111111";
const origin = "https://sports-events-web-staging.vercel.app";
const engine = "https://editorial-staging.example.org";
const evidenceUrl = "https://organizer.example.org/about";
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
  ENGINE_COMMAND_STAGING_BASE_URL: "https://writer.a.run.app",
  ENGINE_STAGING_BASE_URL: "https://reader.a.run.app",
};

const inputs: Record<TrustOperation, Record<string, unknown>> = {
  alias: { alias: "Fundació Esportiva Municipal", reason: "Mismo organizador en su web", evidenceUrl },
  channel: { officialUrl: "https://organizer.example.org", reason: "Web oficial del organizador", evidenceUrl },
  locationAuthority: { authoritative: true, reason: "Fuente municipal revisada", evidenceUrl },
};
const targets: Record<TrustOperation, string> = {
  alias: organizerId,
  channel: organizerId,
  locationAuthority: sourceId,
};
const paths: Record<TrustOperation, string> = {
  alias: "/api/editorial/v1/organizers/" + organizerId + "/aliases",
  channel: "/api/editorial/v1/organizers/" + organizerId + "/channels",
  locationAuthority: "/api/editorial/v1/sources/" + sourceId + "/location-authority",
};
const receipts: Record<TrustOperation, Record<string, unknown>> = {
  alias: {
    commandKey: key,
    action: "ADD_ORGANIZER_ALIAS",
    organizerId,
    alias: "Fundació Esportiva Municipal",
    officialUrl: null,
    channelId: null,
    sourceId: null,
    authoritative: null,
    status: "ADDED",
    recordedAt: "2026-11-15T10:00:00Z",
  },
  channel: {
    commandKey: key,
    action: "ADD_ORGANIZER_CHANNEL",
    organizerId,
    alias: null,
    officialUrl: "https://organizer.example.org",
    channelId,
    sourceId: null,
    authoritative: null,
    status: "EXISTS",
    recordedAt: "2026-11-15T10:00:00Z",
  },
  locationAuthority: {
    commandKey: key,
    action: "SET_LOCATION_AUTHORITY",
    organizerId: null,
    alias: null,
    officialUrl: null,
    channelId: null,
    sourceId,
    authoritative: true,
    status: "DECLARED",
    recordedAt: "2026-11-15T10:00:00Z",
  },
};
const operations: TrustOperation[] = ["alias", "channel", "locationAuthority"];
const method = (operation: TrustOperation) => (operation === "locationAuthority" ? "PUT" : "POST");

function upstream(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
function request(operation: TrustOperation, body: unknown = inputs[operation], headers: Record<string, string> = {}) {
  const path =
    "/api/internal/editorial" +
    (operation === "locationAuthority"
      ? "/sources/" + sourceId + "/location-authority"
      : "/organizers/" + organizerId + (operation === "alias" ? "/aliases" : "/channels"));
  return new Request(origin + path, {
    method: headers[":method"] ?? method(operation),
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
  const run = (operation: TrustOperation, req = request(operation), target = targets[operation]) =>
    handleEditorialTrust(req, operation, target, deps);
  return { getAccess, getWorkloadToken, fetcher, run, deps };
}

describe("V026 trust BFF: positive path", () => {
  it.each(operations)("forwards the exact %s body once with the admin bearer and returns the receipt", async (op) => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValue(upstream(receipts[op]));
    const response = await ctx.run(op);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toEqual(receipts[op]);
    expect(ctx.getAccess).toHaveBeenCalledTimes(2);
    expect(ctx.fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = ctx.fetcher.mock.calls[0];
    expect(url).toBe(engine + paths[op]);
    expect(init).toMatchObject({ method: method(op), cache: "no-store", redirect: "error" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer private-jwt",
      "Idempotency-Key": key,
      "Content-Type": "application/json",
    });
    const { evidenceUrl: evidence, reason, ...rest } = inputs[op];
    expect(JSON.parse(String(init?.body))).toEqual({ ...rest, reason: reason + " · Evidencia: " + evidence });
    expect(Object.keys(JSON.parse(String(init?.body)))).toHaveLength(2);
  });

  it("forwards a withdrawal as authoritative=false and checks the receipt echoes it", async () => {
    const ctx = setup();
    const withdraw = { ...inputs.locationAuthority, authoritative: false };
    ctx.fetcher.mockResolvedValue(
      upstream({ ...receipts.locationAuthority, authoritative: false, status: "WITHDRAWN" }),
    );
    expect((await ctx.run("locationAuthority", request("locationAuthority", withdraw))).status).toBe(200);
    expect(JSON.parse(String(ctx.fetcher.mock.calls[0][1]?.body)).authoritative).toBe(false);

    const mismatch = setup();
    mismatch.fetcher.mockResolvedValue(upstream(receipts.locationAuthority));
    const response = await mismatch.run("locationAuthority", request("locationAuthority", withdraw));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "INCOMPATIBLE_CONTRACT" });
  });

  it("all operations share the single Engine fetch helper (no per-operation dispatch)", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./boundary.ts", import.meta.url), "utf8"),
    );
    expect(source.match(/deps\.fetcher\(/g)).toHaveLength(1);
    expect(source.match(/Authorization: "Bearer "/g)).toHaveLength(1);
    // B1 still dispatches through the same helper.
    const ctx = setup();
    ctx.fetcher.mockResolvedValue(upstream({ code: "NOT_FOUND" }, 404));
    const inspect = new Request(origin + "/api/internal/editorial/candidates/" + organizerId, {
      headers: { Host: new URL(origin).host },
    });
    expect((await handleEditorialB1(inspect, "inspect", organizerId, ctx.deps)).status).toBe(404);
  });
});

describe("V026 trust BFF: activation gate fails closed", () => {
  it.each([
    { EDITORIAL_TRUST_ENABLED: undefined },
    { EDITORIAL_TRUST_ENABLED: "true" },
    { EDITORIAL_ENGINE_TRUST_REVIEWED_SHA: undefined },
    { EDITORIAL_ENGINE_TRUST_REVIEWED_SHA: "e66bc3a" },
    { EDITORIAL_B1_ENABLED: "disabled" },
    { VERCEL_ENV: "preview" },
    { APP_ENV: "production" },
    { EDITORIAL_ENGINE_VERIFIED_ORIGIN: "https://other.example.org" },
  ])("returns NOT_CONFIGURED without session read or dispatch for %o", async (change) => {
    const ctx = setup("admin", { ...env, ...change });
    const response = await ctx.run("alias");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "NOT_CONFIGURED" });
    expect(ctx.getAccess).not.toHaveBeenCalled();
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it("is disabled by default", () => {
    expect(editorialTrustEnabled({ NODE_ENV: "test" })).toBe(false);
    expect(editorialTrustEnabled(env)).toBe(true);
  });
});

describe("V026 trust BFF: request constraints before any session read", () => {
  const cases: [string, TrustOperation, Request][] = [
    ["cross origin", "alias", request("alias", undefined, { Origin: "https://evil.example" })],
    ["missing origin", "alias", request("alias", undefined, { Origin: "" })],
    ["cross-site fetch", "channel", request("channel", undefined, { "Sec-Fetch-Site": "cross-site" })],
    ["wrong host", "alias", request("alias", undefined, { Host: "evil.example" })],
    ["compressed body", "alias", request("alias", undefined, { "Content-Encoding": "gzip" })],
    ["POST to location authority", "locationAuthority", request("locationAuthority", undefined, { ":method": "POST" })],
    ["PUT to aliases", "alias", request("alias", undefined, { ":method": "PUT" })],
  ];
  it.each(cases)("rejects %s with 403", async (_name, op, req) => {
    const ctx = setup();
    const response = await ctx.run(op, req);
    expect(response.status).toBe(403);
    expect(ctx.getAccess).not.toHaveBeenCalled();
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it("rejects a query string on the BFF path", async () => {
    const ctx = setup();
    const req = new Request(origin + "/api/internal/editorial/organizers/" + organizerId + "/aliases?x=1", {
      method: "POST",
      headers: {
        Host: new URL(origin).host,
        Origin: origin,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(inputs.alias),
    });
    expect((await ctx.run("alias", req)).status).toBe(403);
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  const invalid: [string, TrustOperation, Request, string?][] = [
    ["missing key", "alias", request("alias", undefined, { "Idempotency-Key": "" })],
    ["non-UUID key", "alias", request("alias", undefined, { "Idempotency-Key": "not-a-uuid" })],
    ["uppercase key", "alias", request("alias", undefined, { "Idempotency-Key": key.toUpperCase() })],
    ["text/plain", "alias", request("alias", undefined, { "Content-Type": "text/plain" })],
    ["extra key", "alias", request("alias", { ...inputs.alias, organizerId })],
    [
      "extra key (role)",
      "locationAuthority",
      request("locationAuthority", { ...inputs.locationAuthority, role: "admin" }),
    ],
    ["missing evidence", "channel", request("channel", { officialUrl: "https://a.example.org", reason: "x" })],
    ["engine-shaped body", "alias", request("alias", { alias: "FDM Valencia", reason: "Reviewed" })],
    ["empty reason", "alias", request("alias", { ...inputs.alias, reason: "" })],
    ["padded reason", "alias", request("alias", { ...inputs.alias, reason: " motivo " })],
    ["control char reason", "alias", request("alias", { ...inputs.alias, reason: "a\u0000b" })],
    ["bidi reason", "alias", request("alias", { ...inputs.alias, reason: "a\u202eb" })],
    ["too long reason", "alias", request("alias", { ...inputs.alias, reason: "a".repeat(990) })],
    ["http evidence", "alias", request("alias", { ...inputs.alias, evidenceUrl: "http://organizer.example.org/" })],
    ["evidence with query", "alias", request("alias", { ...inputs.alias, evidenceUrl: evidenceUrl + "?a=1" })],
    ["non-normalized alias", "alias", request("alias", { ...inputs.alias, alias: "FDM  Valencia" })],
    ["one-letter alias", "alias", request("alias", { ...inputs.alias, alias: "F" })],
    ["digit-only alias", "alias", request("alias", { ...inputs.alias, alias: "2026" })],
    ["zero-width alias", "alias", request("alias", { ...inputs.alias, alias: "FD\u200bM" })],
    ["channel with path", "channel", request("channel", { ...inputs.channel, officialUrl: "https://a.example.org/x" })],
    ["channel http", "channel", request("channel", { ...inputs.channel, officialUrl: "http://a.example.org" })],
    ["channel uppercase", "channel", request("channel", { ...inputs.channel, officialUrl: "https://A.example.org" })],
    ["channel ip", "channel", request("channel", { ...inputs.channel, officialUrl: "https://10.0.0.1" })],
    ["channel port", "channel", request("channel", { ...inputs.channel, officialUrl: "https://a.example.org:8443" })],
    ["channel query", "channel", request("channel", { ...inputs.channel, officialUrl: "https://a.example.org/?a" })],
    [
      "authoritative string",
      "locationAuthority",
      request("locationAuthority", { ...inputs.locationAuthority, authoritative: "true" }),
    ],
    ["array body", "alias", request("alias", [inputs.alias])],
    ["malformed JSON", "alias", request("alias", "{")],
    ["oversized body", "alias", request("alias", { ...inputs.alias, alias: "a".repeat(5000) })],
  ];
  it.each(invalid)("rejects %s with 400", async (_name, op, req) => {
    const ctx = setup();
    const response = await ctx.run(op, req);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_REQUEST" });
    expect(ctx.getAccess).not.toHaveBeenCalled();
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID target", async () => {
    const ctx = setup();
    expect((await ctx.run("alias", request("alias"), "FDM")).status).toBe(400);
    expect((await ctx.run("alias", request("alias"), organizerId.toUpperCase())).status).toBe(400);
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });
});

describe("V026 trust BFF: role and session", () => {
  it.each(operations)("never forwards %s for a reviewer", async (op) => {
    const ctx = setup("reviewer");
    const response = await ctx.run(op);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "FORBIDDEN" });
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it("stops when the session is denied, changes subject or is demoted between reads", async () => {
    const denied = setup();
    denied.getAccess.mockResolvedValueOnce({ status: "denied", code: "UNAUTHENTICATED" });
    expect((await denied.run("alias")).status).toBe(401);

    const swapped = setup();
    swapped.getAccess
      .mockResolvedValueOnce({ status: "authorized", role: "admin", subject: actor, accessToken: "a" })
      .mockResolvedValueOnce({ status: "authorized", role: "admin", subject: organizerId, accessToken: "b" });
    expect((await swapped.run("alias")).status).toBe(401);

    const demoted = setup();
    demoted.getAccess
      .mockResolvedValueOnce({ status: "authorized", role: "admin", subject: actor, accessToken: "a" })
      .mockResolvedValueOnce({ status: "authorized", role: "reviewer", subject: actor, accessToken: "b" });
    expect((await demoted.run("channel")).status).toBe(403);

    for (const ctx of [denied, swapped, demoted]) expect(ctx.fetcher).not.toHaveBeenCalled();
  });
});

describe("V026 trust BFF: uncertain outcomes and Engine errors", () => {
  it("reports a timeout or network failure as WRITE_UNAVAILABLE, never as success", async () => {
    const timeout = setup();
    timeout.fetcher.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const response = await timeout.run("locationAuthority");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "WRITE_UNAVAILABLE" });

    const network = setup();
    network.fetcher.mockRejectedValue(new TypeError("fetch failed"));
    expect(await (await network.run("alias")).json()).toEqual({ code: "WRITE_UNAVAILABLE" });
  });

  it("uses the 12 s command budget", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    const ctx = setup();
    ctx.fetcher.mockResolvedValue(upstream(receipts.alias));
    await ctx.run("alias");
    expect(spy).toHaveBeenCalledWith(12_000);
    spy.mockRestore();
  });

  it.each([
    [400, "INVALID_REQUEST"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [503, "WRITE_UNAVAILABLE"],
  ])("relays Engine %i %s and only the code", async (code, name) => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValue(upstream({ code: name, detail: "internal sql" }, code));
    const response = await ctx.run("alias");
    expect(response.status).toBe(code);
    expect(await response.json()).toEqual({ code: name });
  });

  it("relays a 409 with the public organizers holding the alias, dropping anything else", async () => {
    const ctx = setup();
    const organizers = [{ id: channelId, canonicalName: "Beachbol Valencia" }];
    ctx.fetcher.mockResolvedValue(upstream({ code: "CONFLICT", reason: "ALIAS_IN_USE", organizers }, 409));
    const response = await ctx.run("alias");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "CONFLICT", reason: "ALIAS_IN_USE", organizers });

    const mismatched = setup();
    mismatched.fetcher.mockResolvedValue(upstream({ code: "CONFLICT", reason: "CHANNEL_IN_USE", organizers }, 409));
    expect(await (await mismatched.run("alias")).json()).toEqual({ code: "CONFLICT" });

    const bare = setup();
    bare.fetcher.mockResolvedValue(upstream({ code: "CONFLICT" }, 409));
    expect(await (await bare.run("locationAuthority")).json()).toEqual({ code: "CONFLICT" });
  });

  it.each([
    ["500", upstream({ code: "INTERNAL" }, 500)],
    ["mismatched code", upstream({ code: "FORBIDDEN" }, 404)],
    [
      "HTML",
      new Response("<html>", { status: 200, headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } }),
    ],
    ["cacheable", upstream(receipts.alias, 200, { "Cache-Control": "max-age=60" })],
    ["202", upstream(receipts.alias, 202)],
    [
      "malformed JSON on 200 (a write may have happened)",
      new Response("{", { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }),
    ],
    ["oversized 200 body", upstream({ ...receipts.alias, padding: "x".repeat(9000) })],
    ["redirect", new Response(null, { status: 302, headers: { Location: "https://evil.example" } })],
  ])("treats %s as an incompatible contract", async (_name, reply) => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValue(reply);
    const response = await ctx.run("alias");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "INCOMPATIBLE_CONTRACT" });
  });

  it.each([
    ["other key", { ...receipts.alias, commandKey: channelId }],
    ["other action", { ...receipts.alias, action: "ADD_ORGANIZER_CHANNEL" }],
    ["other organizer", { ...receipts.alias, organizerId: channelId }],
    ["unknown status", { ...receipts.alias, status: "APPROVED" }],
    ["channel fields", { ...receipts.alias, channelId }],
    ["bad date", { ...receipts.alias, recordedAt: "yesterday" }],
    ["array", [receipts.alias]],
  ])("rejects an alias receipt with %s", async (_name, body) => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValue(upstream(body));
    expect(await (await ctx.run("alias")).json()).toEqual({ code: "INCOMPATIBLE_CONTRACT" });
  });

  it("drops unknown receipt fields and accepts omitted nulls", async () => {
    const ctx = setup();
    const minimal = Object.fromEntries(
      Object.entries(receipts.locationAuthority).filter(
        ([name]) => !["alias", "officialUrl", "channelId", "organizerId"].includes(name),
      ),
    );
    ctx.fetcher.mockResolvedValue(upstream({ ...minimal, internal: "x" }));
    const body = await (await ctx.run("locationAuthority")).json();
    expect(body).toEqual(receipts.locationAuthority);
  });
});

describe("V026 trust validators", () => {
  it("normalizes aliases like the Engine and accepts only the presentation form", () => {
    expect(normalizeAlias("  BeachBol\u00a0 Vale\u0300ncia ")).toBe("BeachBol València");
    expect(isValidAlias("BeachBol València")).toBe(true);
    expect(isValidAlias("S.D. Correcaminos")).toBe(true);
    expect(isValidAlias("BeachBol Vale\u0300ncia")).toBe(false);
    expect(isValidAlias("a".repeat(201))).toBe(false);
  });

  it("accepts only lowercase HTTPS origins as channels", () => {
    expect(isOfficialChannelOrigin("https://valenciaciudaddelrunning.com")).toBe(true);
    expect(isOfficialChannelOrigin("https://tickets.valenciaciudaddelrunning.com/")).toBe(true);
    for (const bad of [
      "https://localhost",
      "https://example.local",
      "https://api.internal",
      "https://example.org//",
      "https://user@example.org",
      "https://secret.example.org",
      "https://1234567.example.org",
      "https://" + "a".repeat(32) + ".example.org",
      "https://example.org#x",
    ])
      expect(isOfficialChannelOrigin(bad)).toBe(false);
  });

  it("composes the reason with the evidence within the Engine limit", () => {
    expect(composeTrustReason("Motivo", evidenceUrl)).toBe("Motivo · Evidencia: " + evidenceUrl);
    expect(composeTrustReason("Motivo", "https://Example.org")).toBeNull();
    expect(composeTrustReason("a".repeat(1000), evidenceUrl)).toBeNull();
    expect(isEvidenceUrl("https://example.org/a b")).toBe(false);
    expect(isEvidenceUrl("https://user:pw@example.org/")).toBe(false);
  });

  it("returns exactly two Engine keys", () => {
    for (const op of operations) expect(Object.keys(validateTrustInput(op, inputs[op]))).toHaveLength(2);
  });
});
