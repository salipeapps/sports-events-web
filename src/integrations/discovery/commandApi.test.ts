import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyDiscoveryAccessToken } from "@/integrations/auth/discoveryToken";
import { canAdmin } from "@/domain/adminAccess";
import type { DiscoveryTokenResult } from "@/integrations/auth/discoveryToken";
import {
  commandConfig,
  commandsEnabled,
  commandStatus,
  HttpDiscoveryCommandClient,
  validateCommand,
  writerAdmissionContract,
  type PromotionCommand,
} from "./commandApi";
import { ActorCommandBudget, handleDiscoveryCommand } from "./commandBoundary";
import { POST } from "@/app/api/internal/discovery/candidates/[id]/[operation]/route";

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/auth/supabaseServer", () => ({ createAuthClient: vi.fn() }));

const id = "ca73b0ff-8001-4000-8000-111111111111";
const key = "11a2a2a2-1111-4000-8000-111111111111";
const actor = "20a2a2a2-1111-4000-8000-111111111111";
const reviewId = "3afeef88-1111-4000-8000-111111111111";
const requestId = "43ade75d-0216-4cfd-a515-f1bcfdf062ef";
const origin = "https://sports-events-web-staging.vercel.app";
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
  DISCOVERY_REJECTION_ENABLED: "enabled",
  DISCOVERY_PROMOTION_ENABLED: "enabled",
  ENGINE_STAGING_BASE_URL: "https://reader.a.run.app",
  GCP_INVOKER_SERVICE_ACCOUNT_EMAIL: "reader@offline.iam.gserviceaccount.com",
  ENGINE_COMMAND_STAGING_BASE_URL: "https://writer.a.run.app",
  ENGINE_COMMAND_STAGING_VERIFIED_ORIGIN: "https://writer.a.run.app",
  ENGINE_COMMAND_STAGING_ID_TOKEN_AUDIENCE: "https://writer.a.run.app",
  GCP_COMMAND_INVOKER_SERVICE_ACCOUNT_EMAIL: "writer@offline.iam.gserviceaccount.com",
  ENGINE_COMMAND_ADMISSION_CONTRACT: "engine-authoritative-rejection-v1",
  ENGINE_COMMAND_ADMISSION_VERIFIED_ORIGIN: "https://writer.a.run.app",
  GCP_WORKLOAD_PROVIDER_AUDIENCE:
    "//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/offline/providers/vercel",
  VERCEL_EXPECTED_OIDC_ISSUER: "https://oidc.vercel.com/raulsp",
  VERCEL_EXPECTED_OIDC_AUDIENCE: "https://vercel.com/raulsp",
};
const rejection = { reasonCode: "OUT_OF_SCOPE" } as const;
const promotion: PromotionCommand = {
  expectedReviewStatus: "PENDING_REVIEW",
  expectedClassificationVersion: 1,
  sourceName: "Reviewed studio",
  sourceKind: "BOOKING_PLATFORM",
  canonicalSourceUrl: "https://www.momoyoga.com/studio/schedule",
  adapterKey: "momoyoga",
  allowedDomain: "www.momoyoga.com",
  requestBudget: 8,
};
const rejected = {
  candidateId: id,
  reviewId,
  reviewStatus: "REJECTED",
  reasonCode: "OUT_OF_SCOPE",
  reviewerRef: actor,
  reviewedAt: "2026-10-14T12:00:00Z",
};
function response(body: unknown = rejected, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-ID": requestId, ...headers },
  });
}
function setup(role: "admin" | "reviewer" = "admin", deployment = { ...env }) {
  const getAccess = vi
    .fn<() => Promise<DiscoveryTokenResult>>()
    .mockResolvedValue({ status: "authorized", accessToken: "user-secret", subject: actor, role });
  const getWorkloadToken = vi.fn(async () => "workload-secret");
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response());
  const transport = { origin: "https://writer.a.run.app", fetcher, getAccess, getWorkloadToken };
  const client = new HttpDiscoveryCommandClient(transport, deployment);
  const createClient = vi.fn(() => client);
  const deps = { env: deployment, getAccess, createClient, budget: new ActorCommandBudget() };
  const run = (request: Request = req(), operation: string = "rejection", candidateId = id) =>
    handleDiscoveryCommand(request, candidateId, operation, deps);
  return { client, getAccess, getWorkloadToken, fetcher, createClient, deps, run, transport };
}
function req(
  body: unknown = rejection,
  headers: Record<string, string> = {},
  url = `${origin}/api/internal/discovery/candidates/${id}/rejection`,
) {
  return new Request(url, {
    method: "POST",
    headers: {
      Host: new URL(origin).host,
      Origin: origin,
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
      "Idempotency-Key": key,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
afterEach(() => vi.unstubAllEnvs());

describe("command deployment gates", () => {
  it("defaults off, independent from read and smoke modes", () => {
    expect(commandsEnabled("rejection", { NODE_ENV: "test" })).toBe(false);
    for (const mode of ["demo", "staging", "disabled"]) {
      const disabled = {
        ...env,
        DISCOVERY_READ_MODE: mode,
        DISCOVERY_STAGING_SMOKE_ENABLED: "enabled",
        DISCOVERY_REJECTION_ENABLED: undefined,
        DISCOVERY_PROMOTION_ENABLED: undefined,
      };
      expect(commandsEnabled("rejection", disabled)).toBe(false);
      expect(commandsEnabled("promotion", disabled)).toBe(false);
      expect(commandsEnabled("rejection", { ...disabled, DISCOVERY_REJECTION_ENABLED: "enabled" })).toBe(true);
      expect(commandsEnabled("promotion", { ...disabled, DISCOVERY_REJECTION_ENABLED: "enabled" })).toBe(false);
      // Engine admits only discovery.reject: promotion stays closed even with its own flag.
      expect(commandsEnabled("promotion", { ...disabled, DISCOVERY_PROMOTION_ENABLED: "enabled" })).toBe(false);
    }
  });
  it.each([
    { NODE_ENV: "development" },
    { APP_ENV: "production" },
    { VERCEL_ENV: "preview" },
    { VERCEL_TARGET_ENV: "preview" },
    { VERCEL_PROJECT_ID: "prod-project" },
    { VERCEL_GIT_COMMIT_REF: "master" },
    { APP_ORIGIN: "https://evil.test" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://prod.supabase.co" },
    { ADMIN_DEV_AUTH_MODE: "enabled" },
    { VERCEL: undefined },
  ])("blocks non-approved deployment %j before all dependencies", async (overrides) => {
    const f = setup("admin", { ...env, ...overrides } as NodeJS.ProcessEnv);
    expect((await f.run()).status).toBe(404);
    await expect(f.client.execute("rejection", id, key, rejection)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(f.getAccess).not.toHaveBeenCalled();
    expect(f.createClient).not.toHaveBeenCalled();
    expect(f.getWorkloadToken).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("actual route with gates disabled touches neither Auth, DB nor HTTP", async () => {
    vi.stubEnv("DISCOVERY_REJECTION_ENABLED", "disabled");
    const fetcher = vi.spyOn(globalThis, "fetch");
    const { createAuthClient } = await import("@/integrations/auth/supabaseServer");
    const result = await POST(req(), { params: Promise.resolve({ id, operation: "rejection" }) });
    expect(result.status).toBe(404);
    expect(createAuthClient).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });
  it("requires separately verified writer configuration", () => {
    expect(commandConfig(env).origin).toBe("https://writer.a.run.app");
    for (const field of [
      "ENGINE_COMMAND_STAGING_BASE_URL",
      "ENGINE_COMMAND_STAGING_VERIFIED_ORIGIN",
      "ENGINE_COMMAND_STAGING_ID_TOKEN_AUDIENCE",
      "GCP_COMMAND_INVOKER_SERVICE_ACCOUNT_EMAIL",
      "GCP_WORKLOAD_PROVIDER_AUDIENCE",
      "ENGINE_COMMAND_ADMISSION_CONTRACT",
      "ENGINE_COMMAND_ADMISSION_VERIFIED_ORIGIN",
    ])
      expect(() => commandConfig({ ...env, [field]: undefined })).toThrow("NOT_CONFIGURED");
    expect(writerAdmissionContract).toBe("engine-authoritative-rejection-v1");
    for (const contract of ["engine-authoritative-rejection-v0", "bff-local", "ENGINE-AUTHORITATIVE-REJECTION-V1", " "])
      expect(() => commandConfig({ ...env, ENGINE_COMMAND_ADMISSION_CONTRACT: contract })).toThrow("NOT_CONFIGURED");
    // The attestation is bound to the exact writer origin it was verified for.
    expect(() =>
      commandConfig({ ...env, ENGINE_COMMAND_ADMISSION_VERIFIED_ORIGIN: "https://old-writer.a.run.app" }),
    ).toThrow("NOT_CONFIGURED");
    for (const url of [
      "https://evil.test",
      "http://writer.a.run.app",
      "https://writer.a.run.app/path",
      "https://writer.a.run.app?secret=1",
      "https://user:secret@writer.a.run.app",
      "https://writer.a.run.app:444",
      "https://writer.a.run.app#fragment",
      env.ENGINE_STAGING_BASE_URL!,
    ])
      expect(() =>
        commandConfig({
          ...env,
          ENGINE_COMMAND_STAGING_BASE_URL: url,
          ENGINE_COMMAND_STAGING_VERIFIED_ORIGIN: url,
          ENGINE_COMMAND_STAGING_ID_TOKEN_AUDIENCE: url,
        }),
      ).toThrow("NOT_CONFIGURED");
    expect(() =>
      commandConfig({ ...env, GCP_COMMAND_INVOKER_SERVICE_ACCOUNT_EMAIL: env.GCP_INVOKER_SERVICE_ACCOUNT_EMAIL }),
    ).toThrow("NOT_CONFIGURED");
  });
});

describe("full command boundary and mocked private HTTP", () => {
  it("never dispatches without a writer attested to enforce Engine admission", async () => {
    for (const missing of [
      { ENGINE_COMMAND_ADMISSION_CONTRACT: undefined },
      { ENGINE_COMMAND_ADMISSION_CONTRACT: "bff-shared-quota-v1" },
      { ENGINE_COMMAND_ADMISSION_VERIFIED_ORIGIN: undefined },
      { ENGINE_COMMAND_ADMISSION_VERIFIED_ORIGIN: "https://other.a.run.app" },
    ]) {
      const f = setup("admin", { ...env, ...missing });
      const result = await f.run();
      expect(result.status).toBe(404);
      expect(await result.json()).toMatchObject({ code: "NOT_CONFIGURED" });
      expect(f.getWorkloadToken).not.toHaveBeenCalled();
      expect(f.fetcher).not.toHaveBeenCalled();
    }
  });
  it("delegates admission to Engine once per dispatch and maps its 429 Retry-After", async () => {
    const f = setup();
    f.fetcher.mockImplementation(async () =>
      response({ code: "RATE_LIMITED", requestId }, 429, { "Retry-After": "37" }),
    );
    const limited = await f.run();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("37");
    expect(await limited.json()).toEqual({ code: "RATE_LIMITED", requestId });
    // No BFF reservation, retry or second admission: the writer saw exactly one request.
    expect(f.fetcher).toHaveBeenCalledOnce();
    const headers = f.fetcher.mock.calls[0][1]?.headers as Record<string, string>;
    expect(Object.keys(headers).sort()).toEqual(
      ["Accept", "Authorization", "Content-Type", "Idempotency-Key", "X-Serverless-Authorization"].sort(),
    );
  });
  it.each([undefined, "", "0", "-1", "1.5", "60, 60", "Wed, 21 Oct 2026 07:28:00 GMT", "86401"])(
    "fails closed on Engine 429 without a valid Retry-After %s",
    async (retryAfter) => {
      const f = setup();
      f.fetcher.mockImplementation(async () =>
        response(
          { code: "RATE_LIMITED", requestId },
          429,
          retryAfter === undefined ? {} : { "Retry-After": retryAfter },
        ),
      );
      const result = await f.run();
      expect(result.status).toBe(503);
      expect((await result.json()).code).toBe("INCOMPATIBLE_CONTRACT");
      expect(result.headers.get("retry-after")).toBeNull();
    },
  );
  it("timeout is uncertain: the writer keeps its permit and the exact retry is replayed", async () => {
    const f = setup();
    f.fetcher
      .mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
      .mockResolvedValueOnce(response({ code: "RATE_LIMITED", requestId }, 429, { "Retry-After": "60" }))
      .mockResolvedValueOnce(response());
    const timeout = await f.run();
    expect(timeout.status).toBe(503);
    expect((await timeout.json()).code).toBe("WRITE_UNAVAILABLE");
    // Engine retains the uncertain slot until operator reconciliation.
    expect((await f.run()).status).toBe(429);
    const replay = await f.run();
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(rejected);
    const sent = f.fetcher.mock.calls.map(([, init]) => [
      init?.body,
      (init?.headers as Record<string, string>)["Idempotency-Key"],
    ]);
    expect(sent).toEqual([
      [JSON.stringify(rejection), key],
      [JSON.stringify(rejection), key],
      [JSON.stringify(rejection), key],
    ]);
  });
  it("a gate closed during workload exchange dispatches nothing", async () => {
    const deployment = { ...env };
    const f = setup("admin", deployment);
    f.getWorkloadToken.mockImplementation(async () => {
      deployment.DISCOVERY_REJECTION_ENABLED = "disabled";
      return "workload-secret";
    });
    const result = await f.run();
    expect(result.status).toBe(404);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("private writer unavailable or IAM denied stays 503 without retry or detail", async () => {
    for (const failure of [
      () => Promise.reject(new TypeError("fetch failed ECONNREFUSED writer.a.run.app")),
      () => Promise.resolve(new Response("<html>403 IAM denied</html>", { status: 403 })),
      () => Promise.resolve(response({ code: "WRITE_UNAVAILABLE", requestId }, 503)),
    ]) {
      const f = setup();
      f.fetcher.mockImplementation(failure);
      const result = await f.run();
      expect(result.status).toBe(503);
      expect(await result.text()).not.toMatch(/IAM|ECONNREFUSED|writer\.a\.run\.app/);
      expect(f.fetcher).toHaveBeenCalledOnce();
    }
  });
  it("checks real RSA signature, signed role and fresh membership through the whole boundary", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: "jwk" }), kid: "command-offline", alg: "RS256", use: "sig" };
    const sdk = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, "sb_publishable_fixture_only", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => Response.json({ keys: [jwk] }) },
    });
    const claims = {
      iss: `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
      sub: actor,
      role: "authenticated",
      aud: "authenticated",
      is_anonymous: false,
      exp: Math.floor(Date.now() / 1000) + 300,
      iat: Math.floor(Date.now() / 1000) - 10,
      app_metadata: { discovery_role: "reviewer" },
      user_metadata: { discovery_role: "admin" },
    };
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ kid: jwk.kid, alg: jwk.alg, typ: "JWT" })}.${encode(claims)}`;
    const validToken = `${unsigned}.${sign("sha256", Buffer.from(unsigned), privateKey).toString("base64url")}`;
    let token = validToken;
    let active = true;
    let role = "reviewer";
    const membership = vi.fn(async () => ({ data: { role, is_active: active }, error: null }));
    const authClient = {
      auth: {
        getClaims: sdk.auth.getClaims.bind(sdk.auth),
        getUser: async () => ({ data: { user: { id: actor, is_anonymous: false } }, error: null }),
        getSession: async () => ({ data: { session: { access_token: token } }, error: null }),
      },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: membership }) }) }),
    } as unknown as SupabaseClient;
    const f = setup("reviewer");
    f.getAccess.mockImplementation(() => verifyDiscoveryAccessToken(authClient, claims.iss));
    expect((await f.run()).status).toBe(200);
    expect((await f.run(req(promotion), "promotion")).status).toBe(404);
    active = false;
    expect((await f.run()).status).toBe(403);
    active = true;
    role = "admin";
    expect((await f.run()).status).toBe(403); // Fresh membership differs from signed reviewer claim.
    role = "reviewer";
    token = `${unsigned}.${Buffer.alloc(256).toString("base64url")}`;
    expect((await f.run()).status).toBe(401);
    token = validToken;
    expect((await f.run()).status).toBe(200);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(membership.mock.calls.length).toBeGreaterThanOrEqual(7);
  });
  it.each(["admin", "reviewer"] as const)("allows %s rejection with double identity and safe receipt", async (role) => {
    const f = setup(role);
    f.fetcher.mockImplementation(async () => response({ ...rejected, token: "upstream-secret" }));
    const result = await f.run(
      req(rejection, {
        Authorization: "Bearer attacker",
        "X-Actor-ID": "attacker",
        "X-Discovery-Role": "admin",
        "X-Serverless-Authorization": "Bearer attacker",
      }),
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(rejected);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(result.headers.get("x-request-id")).toBe(requestId);
    expect(f.getAccess).toHaveBeenCalledTimes(3);
    const [url, init] = f.fetcher.mock.calls[0];
    expect(url).toBe(`https://writer.a.run.app/api/admin/v1/discovery/candidates/${id}/rejection`);
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      redirect: "error",
      body: JSON.stringify(rejection),
      headers: {
        Authorization: "Bearer user-secret",
        "X-Serverless-Authorization": "Bearer workload-secret",
        "Idempotency-Key": key,
      },
    });
    expect(JSON.stringify(init)).not.toContain("attacker");
  });
  it("promotion stays closed without Engine admission even for admins with its flag enabled", async () => {
    expect(canAdmin("reviewer", "discovery.reject")).toBe(true);
    expect(canAdmin("reviewer", "discovery.promote")).toBe(false);
    const f = setup();
    expect((await f.run(req(promotion), "promotion")).status).toBe(404);
    await expect(f.client.execute("promotion", id, key, promotion)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(f.getAccess).not.toHaveBeenCalled();
    expect(f.getWorkloadToken).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
    "denies missing/revoked/claim-mismatched access: %s",
    async (code) => {
      const f = setup();
      f.getAccess.mockResolvedValue({ status: "denied", code });
      expect((await f.run()).status).toBe(commandStatus[code]);
      expect(f.createClient).not.toHaveBeenCalled();
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );
  it("rechecks revocation between boundary and dispatch and on every replay", async () => {
    const f = setup();
    f.getAccess
      .mockResolvedValueOnce({ status: "authorized", role: "admin", subject: actor, accessToken: "user-secret" })
      .mockResolvedValue({ status: "denied", code: "FORBIDDEN" });
    expect((await f.run()).status).toBe(403);
    expect(f.fetcher).not.toHaveBeenCalled();
    expect((await f.run()).status).toBe(403);
  });
  it("denies revocation during STS/IAM before engine dispatch", async () => {
    const f = setup();
    f.getWorkloadToken.mockImplementation(async () => {
      f.getAccess.mockResolvedValue({ status: "denied", code: "FORBIDDEN" });
      return "workload-secret";
    });
    const result = await f.run();
    expect(result.status).toBe(403);
    expect(f.getAccess).toHaveBeenCalledTimes(3);
    expect(f.getWorkloadToken).toHaveBeenCalledOnce();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("rejects a switched user identity after async work and before dispatch", async () => {
    const f = setup();
    f.getWorkloadToken.mockImplementation(async () => {
      f.getAccess.mockResolvedValue({
        status: "authorized",
        accessToken: "new-user-secret",
        subject: key,
        role: "admin",
      });
      return "workload-secret";
    });
    expect((await f.run()).status).toBe(401);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    { Origin: "https://evil.test" },
    { Origin: "null" },
    { Origin: "" },
    { Host: "evil.test" },
    { "Sec-Fetch-Site": "cross-site" },
    { "Sec-Fetch-Site": "same-site" },
    { "Sec-Fetch-Site": "none" },
  ])("denies CSRF/forged origin before authentication %j", async (headers) => {
    const f = setup();
    expect((await f.run(req(rejection, headers))).status).toBe(403);
    expect(f.getAccess).not.toHaveBeenCalled();
  });
  it("denies forged request URL, method, queries and unsupported operation", async () => {
    const f = setup();
    expect((await f.run(req(rejection, {}, "https://evil.test/path"))).status).toBe(403);
    expect((await f.run(new Request(req().url, { method: "GET", headers: req().headers }))).status).toBe(403);
    expect((await f.run(req(rejection, {}, req().url + "?actor=admin"))).status).toBe(400);
    expect((await f.run(req(), "search")).status).toBe(404);
    expect(f.getAccess).not.toHaveBeenCalled();
  });
  it.each([
    "{}",
    "[]",
    "null",
    '{"reasonCode":null}',
    '{"reasonCode":"OUT_OF_SCOPE","reviewerRef":"attacker"}',
    '{"reasonCode":"OUT_OF_SCOPE","reasonCode":"INVALID_SOURCE"}',
    '{"reasonCode":"OUT_OF_SCOPE","reason\\u0043ode":"INVALID_SOURCE"}',
    '{"reasonCode":"OUT_OF_SCOPE"} {}',
    '{"reasonCode":{"nested":true}}',
    '{"reasonCode":"OUT_OF_SCOPE",}',
    '{"reasonCode":"OUT_OF_SCOPE","comment":"secret"}',
    '{"reasonCode":"OUT_OF_SCOPE","__proto__":null}',
  ])("rejects malformed/spoofed JSON %s", async (body) => {
    const f = setup();
    expect((await f.run(req(body))).status).toBe(400);
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.createClient).not.toHaveBeenCalled();
  });
  it.each(["", key.toUpperCase(), `${key}, ${key}`, "not-a-uuid"])(
    "requires exactly one canonical idempotency key %s",
    async (invalidKey) => {
      const f = setup();
      expect((await f.run(req(rejection, { "Idempotency-Key": invalidKey }))).status).toBe(400);
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );
  it("validates candidate ID, reason, UTF8 bytes and body limits including chunked", async () => {
    const f = setup();
    expect((await f.run(req(), "rejection", "../promotion")).status).toBe(400);
    expect((await f.run(req({ reasonCode: "SUITABLE_SOURCE" }))).status).toBe(422);
    expect((await f.run(req(rejection, { "Content-Type": "text/plain" }))).status).toBe(400);
    expect((await f.run(req(rejection, { "Content-Encoding": "gzip" }))).status).toBe(400);
    expect((await f.run(req(rejection, { "Content-Length": "1025" }))).status).toBe(400);
    expect((await f.run(req(" ".repeat(1025)))).status).toBe(400);
    expect((await f.run(req(JSON.stringify({ reasonCode: "ñ".repeat(600) })))).status).toBe(400);
    const badUtf8 = new Request(req().url, { method: "POST", headers: req().headers, body: new Uint8Array([0xff]) });
    expect((await f.run(badUtf8)).status).toBe(400);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { expectedReviewStatus: "APPROVED" },
    { expectedClassificationVersion: 0 },
    { expectedClassificationVersion: 1.5 },
    { expectedClassificationVersion: 1000001 },
    { expectedClassificationVersion: undefined },
    { sourceName: " " },
    { sourceName: "x\nsecret" },
    { sourceName: "x".repeat(121) },
    { sourceKind: "UNKNOWN" },
    { requestBudget: 0 },
    { requestBudget: 9 },
    { requestBudget: 1.5 },
    { canonicalSourceUrl: "http://www.momoyoga.com/studio" },
    { canonicalSourceUrl: "https://user:pass@www.momoyoga.com/studio" },
    { canonicalSourceUrl: "https://www.momoyoga.com/studio#fragment" },
    { allowedDomain: "*.momoyoga.com" },
    { allowedDomain: "evil.test" },
    { adapterKey: "../other" },
    { reviewerRef: actor },
    { initiallyEnabled: true },
    { scheduleExpression: "* * * * *" },
    { role: "admin" },
  ])("validates promotion allowlist/expected state/version/config %j", async (override) => {
    const f = setup();
    expect((await f.run(req({ ...promotion, ...override }), "promotion")).status).toBeGreaterThanOrEqual(400);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("bounds actor attempts, isolates actors, and resets after one minute", async () => {
    const f = setup();
    for (let i = 0; i < 20; i++) expect((await f.run(req("{}"))).status).toBe(400);
    const limited = await f.run();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(f.fetcher).not.toHaveBeenCalled();
    let now = 0;
    const budget = new ActorCommandBudget(() => now);
    for (let i = 0; i < 20; i++) expect(budget.take(actor)).toBe(true);
    expect(budget.take(actor)).toBe(false);
    expect(budget.take(key)).toBe(true);
    now = 60000;
    expect(budget.take(actor)).toBe(true);
  });
});

describe("upstream contract, redaction and uncertain outcomes", () => {
  const errors = [
    "INVALID_REQUEST",
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "NOT_FOUND",
    "REJECTION_CONFLICT",
    "INVALID_REJECTION_REASON",
    "RATE_LIMITED",
    "WRITE_UNAVAILABLE",
  ] as const;
  it.each(errors)("preserves typed %s and correlation but strips error details", async (code) => {
    const f = setup();
    f.fetcher.mockImplementation(async () =>
      response({ code, requestId, detail: "SQL user-secret workload-secret" }, commandStatus[code], {
        "Retry-After": "60",
      }),
    );
    const result = await f.run();
    expect(result.status).toBe(commandStatus[code]);
    expect(await result.json()).toEqual({ code, requestId });
    expect(result.headers.get("x-request-id")).toBe(requestId);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    () => response({ ...rejected, candidateId: key }),
    () => response({ ...rejected, reviewerRef: key }),
    () => response({ ...rejected, reasonCode: "INVALID_SOURCE" }),
    () => response({ ...rejected, reviewId: "secret" }),
    () => response({ ...rejected, reviewedAt: "secret" }),
    () => response({ ...rejected, reviewStatus: "APPROVED" }),
    () => response(rejected, 200, { "X-Request-ID": "secret" }),
    () => response(rejected, 200, { "Cache-Control": "public" }),
    () => response(rejected, 200, { "Content-Type": "text/html" }),
    () => response({ code: "SQL_SECRET", requestId }, 503),
    () => response({ code: "FORBIDDEN", requestId: key }, 403),
    () => response({ code: "FORBIDDEN", requestId }, 409),
    () => response({ code: "PROMOTION_CONFLICT", requestId }, 409),
    () => response("x".repeat(9000)),
    () => new Response("{malformed", { headers: response().headers }),
    () => response([], 200),
  ])("fails closed on incompatible response %#", async (factory) => {
    const f = setup();
    f.fetcher.mockImplementation(async () => factory());
    const result = await f.run();
    expect(result.status).toBe(503);
    expect((await result.json()).code).toBe("INCOMPATIBLE_CONTRACT");
  });
  it("never automatically retries timeout/503; manual retries preserve the exact key and payload", async () => {
    const f = setup();
    f.fetcher
      .mockRejectedValueOnce(new Error("timeout user-secret"))
      .mockImplementation(async () => response({ code: "WRITE_UNAVAILABLE", requestId }, 503));
    let result = await f.run();
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("secret");
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    result = await f.run();
    expect(result.status).toBe(503);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(f.fetcher.mock.calls[0][1]?.body).toBe(f.fetcher.mock.calls[1][1]?.body);
    expect(
      f.fetcher.mock.calls.map(([, init]) => (init?.headers as Record<string, string>)["Idempotency-Key"]),
    ).toEqual([key, key]);
  });
  it("concurrent duplicates reach the writer, whose single admission arbitrates them", async () => {
    const f = setup();
    let calls = 0;
    f.fetcher.mockImplementation(async () =>
      ++calls === 1 ? response() : response({ code: "RATE_LIMITED", requestId }, 429, { "Retry-After": "60" }),
    );
    const results = await Promise.all([f.run(), f.run()]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 429]);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    f.fetcher.mockImplementation(async () => response());
    const replay = await f.run();
    expect(await replay.json()).toEqual(rejected);
    f.fetcher.mockImplementation(async () => response({ code: "REJECTION_CONFLICT", requestId }, 409));
    const conflict = await f.run(req(rejection, { "Idempotency-Key": reviewId }));
    expect(conflict.status).toBe(409);
    expect(f.fetcher).toHaveBeenCalledTimes(4);
  });
  it("safe workload and unknown auth failures never reach engine or expose exceptions", async () => {
    const f = setup();
    f.getWorkloadToken.mockRejectedValue(new Error("OIDC SQL secret"));
    const result = await f.run();
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("secret");
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("requires UUIDs and expected classification even when called directly", () => {
    expect(() => validateCommand("rejection", id.toUpperCase(), key, rejection)).toThrow("INVALID_REQUEST");
    expect(() =>
      validateCommand("promotion", id, key, { ...promotion, expectedClassificationVersion: undefined }),
    ).toThrow("INVALID_REQUEST");
  });
});
