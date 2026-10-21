import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { getDiscoveryAccessToken } from "@/integrations/auth/discoveryToken";
import { candidate } from "../../../../e2e/fixtures/discovery-ui/candidate";
import Page from "./page";
import CandidatePage from "./results/[resultId]/page";
import ExecutionPage from "./executions/[executionId]/page";

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/auth/adminAuth", () => ({ requireAdminAccess: vi.fn() }));
vi.mock("@/integrations/auth/discoveryToken", () => ({ getDiscoveryAccessToken: vi.fn() }));

beforeEach(() => {
  const env = {
    NODE_ENV: "production",
    APP_ENV: "staging",
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_TARGET_ENV: "production",
    VERCEL_PROJECT_ID: "prj_MU4pprIXpAdKUGcBPx8uWztULHxb",
    VERCEL_GIT_COMMIT_REF: "develop",
    APP_ORIGIN: "https://sports-events-web-staging.vercel.app",
    NEXT_PUBLIC_SUPABASE_URL: "https://yfytzogjrhwstcnzspdv.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_offline",
    ADMIN_DEV_AUTH_MODE: "disabled",
    DISCOVERY_READ_MODE: "SUPABASE_READ",
    DISCOVERY_REJECTION_ENABLED: "disabled",
    DISCOVERY_PROMOTION_ENABLED: "disabled",
    DISCOVERY_STAGING_SMOKE_ENABLED: "disabled",
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.mocked(requireAdminAccess).mockResolvedValue({
    subject: candidate.id,
    role: "reviewer",
    displayName: "Offline reviewer",
  });
  vi.mocked(getDiscoveryAccessToken).mockResolvedValue({
    status: "authorized",
    accessToken: "server-only-bearer",
    subject: candidate.id,
    role: "reviewer",
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("routes the real server page through Supabase, preserves filters and keeps tokens out of rendered HTML", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ contractVersion: 2, items: [candidate], nextCursor: "v2-next" }), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({ tab: "resultados", search: "Studio", cursor: "v2-first" }) }),
  );
  expect(requireAdminAccess).toHaveBeenCalledWith("discovery.view");
  expect(fetcher.mock.calls[0][0]).toContain("supabase.co/rest/v1/rpc/discovery_candidates_v2");
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({
    p_limit: 20,
    p_cursor: "v2-first",
    p_search: "Studio",
  });
  expect(html).toContain(candidate.canonicalUrl);
  expect(html).toContain("v2-next");
  expect(html).not.toContain("server-only-bearer");
  expect(html).not.toContain("sb_publishable");
  expect(html).not.toContain('<button type="button"');
});

it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
  "fails closed on %s without any network or fixtures",
  async (code) => {
    vi.mocked(getDiscoveryAccessToken).mockResolvedValue({ status: "denied", code });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ tab: "resultados" }) }));
    expect(html).toContain(code);
    expect(html).not.toContain(candidate.canonicalUrl);
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it("loads candidate detail, observations and reviews using independently paged RPCs", async () => {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (url) => {
      urls.push(String(url));
      const body = String(url).endsWith("/discovery_candidate_v2")
        ? { contractVersion: 2, item: { candidate, promotion: null } }
        : { contractVersion: 2, items: [], nextCursor: null };
      return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    }),
  );
  const html = renderToStaticMarkup(
    await CandidatePage({
      params: Promise.resolve({ resultId: candidate.id }),
      searchParams: Promise.resolve({ observationsCursor: "obs-next", reviewsCursor: "review-next" }),
    }),
  );
  expect(html).toContain(candidate.canonicalUrl);
  expect(urls.map((url) => url.split("/").pop()).sort()).toEqual([
    "discovery_candidate_observations_v2",
    "discovery_candidate_reviews_v2",
    "discovery_candidate_v2",
  ]);
  expect(getDiscoveryAccessToken).toHaveBeenCalledTimes(3);
});

it("routes execution detail to Supabase and shows unavailable on upstream failure", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response("private SQL secret", { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  const html = renderToStaticMarkup(
    await ExecutionPage({ params: Promise.resolve({ executionId: candidate.id }), searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("READ_UNAVAILABLE");
  expect(html).not.toContain("private SQL secret");
  expect(fetcher.mock.calls.map(([url]) => String(url).split("/").pop()).sort()).toEqual([
    "discovery_execution_observations_v2",
    "discovery_execution_v2",
  ]);
});
