import { afterEach, describe, expect, it, vi } from "vitest";
import { candidate as baseCandidate } from "../../../e2e/fixtures/discovery-ui/candidate";
import type { DiscoveryTokenResult } from "@/integrations/auth/discoveryToken";
import { getDiscoveryAccessToken } from "@/integrations/auth/discoveryToken";
import { SupabaseDiscoveryReadRepository } from "./supabaseRead";
import { getDiscoveryMode, getLiveDiscoveryRepository, workloadToken } from "./readApi";
import { commandsEnabled } from "./commandApi";

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/auth/discoveryToken", () => ({ getDiscoveryAccessToken: vi.fn() }));

const sample = {
  ...baseCandidate,
  latestObservation: {
    id: "3afeef88-1111-4000-8000-111111111111",
    candidateId: baseCandidate.id,
    knownSourceId: null,
    executionId: "20a2a2a2-1111-4000-8000-111111111111",
    queryId: "11a2a2a2-1111-4000-8000-111111111111",
    providerKey: "serpapi",
    originalUrl: "https://example.org/source",
    observedAt: "2026-10-09T08:00:00Z",
    title: null,
    snippet: null,
    resultPosition: null,
  },
};
const staging = {
  NODE_ENV: "production",
  APP_ENV: "staging",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_TARGET_ENV: "production",
  VERCEL_PROJECT_ID: "prj_MU4pprIXpAdKUGcBPx8uWztULHxb",
  VERCEL_GIT_COMMIT_REF: "develop",
  APP_ORIGIN: "https://sports-events-web-staging.vercel.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://yfytzogjrhwstcnzspdv.supabase.co",
  ADMIN_DEV_AUTH_MODE: "disabled",
  DISCOVERY_READ_MODE: "SUPABASE_READ",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_offline",
} as NodeJS.ProcessEnv;

const execution = {
  id: sample.latestObservation!.executionId,
  queryId: sample.latestObservation!.queryId,
  providerKey: "serpapi",
  status: "PARTIAL",
  submissionState: null,
  recoveryState: null,
  originalExecutionId: null,
  createdAt: "2026-10-09T08:00:00Z",
  startedAt: null,
  finishedAt: null,
  observed: 1,
  candidatesCreated: 1,
  candidatesReobserved: null,
  knownSources: null,
  invalidResults: null,
  providerFailures: null,
  countersVersion: 1,
  providerRequestCount: null,
  failureCode: null,
  queryExpression: null,
  cost: null,
};
const query = {
  id: execution.queryId,
  providerKey: "serpapi",
  expression: null,
  enabled: true,
  activityContext: null,
  geographicScope: null,
  localeHint: null,
  resultLimit: null,
  requestBudget: null,
  scheduleExpression: null,
  lastExecutionId: null,
  lastExecutionStatus: null,
  lastExecutionAt: null,
};
const provider = {
  providerKey: "serpapi",
  displayName: "SerpAPI",
  enabled: true,
  maxRequestsPerExecution: null,
  dailyRequestCap: null,
  monthlyRequestCap: null,
};
const review = {
  id: sample.id,
  decision: "REJECTED",
  reviewerRef: null,
  reasonCode: "OUT_OF_SCOPE",
  reviewedAt: "2026-10-09T08:00:00Z",
};
function setup(
  body: unknown = { contractVersion: 2, items: [sample], nextCursor: null },
  role: "admin" | "reviewer" = "reviewer",
  status = 200,
) {
  const authorize = vi
    .fn<() => Promise<DiscoveryTokenResult>>()
    .mockResolvedValue({ status: "authorized", role, subject: sample.id, accessToken: "verified-offline-bearer" });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    );
  const repo = new SupabaseDiscoveryReadRepository({
    origin: staging.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: staging.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    fetcher,
    authorize,
  });
  return { repo, fetcher, authorize };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Supabase Discovery v2 proposal, offline DB response fixtures (not RLS proof)", () => {
  it("uses only the fixed Supabase RPC, verified user bearer and publishable key without caching or Google calls", async () => {
    const f = setup();
    const result = await f.repo.candidates({
      search: "100%_!'; DROP TABLE sources; --",
      limit: 1,
      providerKey: "serpapi",
    });
    expect(result).toEqual({ items: [sample], nextCursor: null });
    expect(f.fetcher).toHaveBeenCalledOnce();
    const [url, init] = f.fetcher.mock.calls[0];
    expect(url).toBe(`${staging.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/discovery_candidates_v2`);
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      redirect: "error",
      headers: {
        "Content-Profile": "api",
        apikey: "sb_publishable_offline",
        Authorization: "Bearer verified-offline-bearer",
      },
    });
    expect(init!.headers).not.toHaveProperty("X-Serverless-Authorization");
    expect(JSON.parse(init!.body as string)).toEqual({
      p_search: "100%_!'; DROP TABLE sources; --",
      p_limit: 1,
      p_provider_key: "serpapi",
    });
    expect(String(url)).not.toContain("bearer");
  });
  it.each(["admin", "reviewer"] as const)(
    "preserves nullable mappings for %s without inventing inventory",
    async (role) => {
      const f = setup({ contractVersion: 2, items: [], nextCursor: null }, role);
      expect(await f.repo.candidates()).toEqual({ items: [], nextCursor: null });
      expect(JSON.parse(f.fetcher.mock.calls[0][1]!.body as string)).toEqual({ p_limit: 50 });
    },
  );
  it("covers all nine method/RPC bindings and redacted fields", async () => {
    const cases = [
      [
        "discovery_candidate_v2",
        { item: { candidate: sample, promotion: null } },
        (r: SupabaseDiscoveryReadRepository) => r.candidate(sample.id),
      ],
      [
        "discovery_candidate_observations_v2",
        { items: [sample.latestObservation], nextCursor: null },
        (r: SupabaseDiscoveryReadRepository) => r.candidateObservations(sample.id),
      ],
      [
        "discovery_candidate_reviews_v2",
        { items: [review], nextCursor: null },
        (r: SupabaseDiscoveryReadRepository) => r.candidateReviews(sample.id),
      ],
      [
        "discovery_providers_v2",
        { items: [provider], nextCursor: null },
        (r: SupabaseDiscoveryReadRepository) => r.providers(),
      ],
      [
        "discovery_queries_v2",
        { items: [query], nextCursor: null },
        (r: SupabaseDiscoveryReadRepository) => r.queries(),
      ],
      [
        "discovery_executions_v2",
        { items: [execution], nextCursor: null },
        (r: SupabaseDiscoveryReadRepository) => r.executions({ queryId: query.id, providerKey: "serpapi" }),
      ],
      [
        "discovery_execution_v2",
        { item: execution },
        (r: SupabaseDiscoveryReadRepository) => r.execution(execution.id),
      ],
      [
        "discovery_execution_observations_v2",
        { items: [sample.latestObservation], nextCursor: null },
        (r: SupabaseDiscoveryReadRepository) => r.executionObservations(execution.id),
      ],
    ] as const;
    for (const [rpc, body, call] of cases) {
      const f = setup({ contractVersion: 2, ...body });
      await expect(call(f.repo)).resolves.toBeDefined();
      expect(f.fetcher.mock.calls[0][0]).toBe(`${staging.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${rpc}`);
    }
  });
  it("forwards each cursor and the same filters, reauthorizing for each page", async () => {
    const f = setup({ contractVersion: 2, items: [sample], nextCursor: "v2-context-last-id" });
    const first = await f.repo.candidates({ limit: 1, reviewStatus: "PENDING_REVIEW" });
    f.fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          contractVersion: 2,
          items: [{ ...sample, id: "ca73b0ff-8001-4000-8000-999999999999", latestObservation: null }],
          nextCursor: null,
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    const second = await f.repo.candidates({ cursor: first.nextCursor!, limit: 1, reviewStatus: "PENDING_REVIEW" });
    expect(new Set([...first.items, ...second.items].map((c) => c.id)).size).toBe(2);
    expect(f.authorize).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.fetcher.mock.calls[1][1]!.body as string)).toEqual({
      p_cursor: first.nextCursor,
      p_limit: 1,
      p_review_status: "PENDING_REVIEW",
    });
  });
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
    "denies %s before any RPC, including after revocation between pages",
    async (code) => {
      const f = setup();
      await f.repo.candidates();
      f.authorize.mockResolvedValue({ status: "denied", code });
      await expect(f.repo.providers()).rejects.toMatchObject({ code });
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    [400, "INVALID_REQUEST"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_CONFIGURED"],
    [409, "READ_CONFLICT"],
    [429, "READ_UNAVAILABLE"],
    [500, "READ_UNAVAILABLE"],
    [503, "READ_UNAVAILABLE"],
  ])("maps HTTP %s safely to %s", async (status, code) => {
    const f = setup({ message: "SQL password and token", code: "malicious" }, "admin", Number(status));
    await expect(f.repo.candidates()).rejects.toMatchObject({ code, message: code });
  });
  it.each([
    { items: [], nextCursor: null },
    { contractVersion: 1, items: [], nextCursor: null },
    { contractVersion: 2, items: [sample, sample], nextCursor: null },
    { contractVersion: 2, items: [{ ...sample, secret: "must not serialize" }], nextCursor: null },
    { contractVersion: 2, items: [{ ...sample, observationCount: undefined }], nextCursor: null },
    { contractVersion: 2, items: [{ ...sample, canonicalUrl: "javascript:alert(1)" }], nextCursor: null },
    { contractVersion: 2, items: [], nextCursor: "loop" },
  ])("rejects malformed/incompatible DB response %j", async (body) => {
    await expect(setup(body).repo.candidates()).rejects.toMatchObject({ code: "INCOMPATIBLE_CONTRACT" });
  });
  it("rejects disclosure of actor identity or reviewer-only hidden configuration", async () => {
    for (const [resource, item] of [
      ["providers", { ...provider, maxRequestsPerExecution: 8 }],
      ["queries", { ...query, expression: "private query" }],
      ["executions", { ...execution, cost: 0 }],
    ] as const) {
      const f = setup({ contractVersion: 2, items: [item], nextCursor: null });
      await expect(f.repo[resource]()).rejects.toMatchObject({ code: "INCOMPATIBLE_CONTRACT" });
    }
    await expect(
      setup(
        { contractVersion: 2, items: [{ ...review, reviewerRef: "user@example.org" }], nextCursor: null },
        "admin",
      ).repo.candidateReviews(sample.id),
    ).rejects.toMatchObject({ code: "INCOMPATIBLE_CONTRACT" });
  });
  it.each([
    { limit: 0 },
    { limit: 101 },
    { cursor: "x".repeat(2049) },
    { search: "x".repeat(201) },
    { search: "bad\u0000" },
    { providerKey: "a,b" },
    { queryId: "not-uuid" },
    { reviewStatus: "UNKNOWN" },
  ])("validates input before networking %j", async (filters) => {
    const f = setup();
    await expect(f.repo.candidates(filters)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("fails closed for a missing detail, a cross-candidate observation or changed detail identity", async () => {
    await expect(setup({ contractVersion: 2, item: null }).repo.candidate(sample.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      setup({
        contractVersion: 2,
        items: [{ ...sample.latestObservation, candidateId: execution.id }],
        nextCursor: null,
      }).repo.candidateObservations(sample.id),
    ).rejects.toMatchObject({ code: "INCOMPATIBLE_CONTRACT" });
    await expect(
      setup({ contractVersion: 2, item: { candidate: sample, promotion: null } }).repo.candidate(execution.id),
    ).rejects.toMatchObject({ code: "INCOMPATIBLE_CONTRACT" });
  });
  it("bounds streams and sanitizes network failures, non-JSON and malformed JSON without logging", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = setup();
    for (const response of [
      new Response("x".repeat(1024 * 1024 + 1), { headers: { "Content-Type": "application/json" } }),
      new Response("<html>secret</html>"),
      new Response("{", { headers: { "Content-Type": "application/json" } }),
    ]) {
      f.fetcher.mockResolvedValueOnce(response);
      await expect(f.repo.candidates()).rejects.toHaveProperty("code");
    }
    f.fetcher.mockRejectedValueOnce(new Error("password token raw SQL"));
    await expect(f.repo.candidates()).rejects.toMatchObject({ message: "READ_UNAVAILABLE" });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("SUPABASE_READ deployment selection", () => {
  it("selects Supabase without OIDC configuration and remains read-only despite writer flags", async () => {
    for (const [key, value] of Object.entries(staging)) vi.stubEnv(key, value);
    vi.stubEnv("ENGINE_STAGING_BASE_URL", "");
    vi.mocked(getDiscoveryAccessToken).mockResolvedValue({
      status: "authorized",
      role: "reviewer",
      subject: sample.id,
      accessToken: "verified",
    });
    const f = setup();
    vi.stubGlobal("fetch", f.fetcher);
    expect(getDiscoveryMode()).toBe("SUPABASE_READ");
    await expect(getLiveDiscoveryRepository().candidates()).resolves.toHaveProperty("items");
    expect(f.fetcher.mock.calls.every(([url]) => String(url).startsWith(staging.NEXT_PUBLIC_SUPABASE_URL!))).toBe(true);
    expect(workloadToken).toBeTypeOf("function"); // Historical transport is retained.
    expect(commandsEnabled("rejection", { ...staging, DISCOVERY_REJECTION_ENABLED: "enabled" })).toBe(false);
  });
  it.each([
    { NODE_ENV: "development" },
    { APP_ENV: "production" },
    { VERCEL_ENV: "preview" },
    { VERCEL_PROJECT_ID: "other" },
    { VERCEL_GIT_COMMIT_REF: "master" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" },
    { ADMIN_DEV_AUTH_MODE: "enabled" },
    { DISCOVERY_STAGING_SMOKE_ENABLED: "enabled" },
    { DISCOVERY_REJECTION_ENABLED: "enabled" },
    { DISCOVERY_PROMOTION_ENABLED: "enabled" },
  ])("fails closed for an unapproved combination %j", (overrides) => {
    expect(getDiscoveryMode({ ...staging, ...overrides } as NodeJS.ProcessEnv)).toBe("disabled");
  });
  it("disables on rollback and rejects privileged keys", () => {
    expect(getDiscoveryMode({ ...staging, DISCOVERY_READ_MODE: "disabled" })).toBe("disabled");
    expect(
      () =>
        new SupabaseDiscoveryReadRepository({
          origin: staging.NEXT_PUBLIC_SUPABASE_URL!,
          publishableKey: "sb_secret_no",
          fetcher: fetch,
          authorize: vi.fn(),
        }),
    ).toThrow("NOT_CONFIGURED");
  });
});
