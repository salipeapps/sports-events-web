import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdminAccessResult } from "@/domain/adminAccess";
import Dashboard from "./page";
import Activities from "./activities/page";
import Candidates from "./candidates/page";
import Candidate from "./candidates/[candidateId]/page";
import Sources from "./sources/page";
import Source from "./sources/[sourceId]/page";
import Runs from "./runs/page";
import Run from "./runs/[runId]/page";

const { getAccess } = vi.hoisted(() => ({ getAccess: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/integrations/auth/supabaseServer", () => ({ createAuthClient: async () => ({}) }));
vi.mock("@/integrations/auth/supabaseAccess", () => ({
  SupabaseAdminSessionProvider: class {
    getAccess = getAccess;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const query = Promise.resolve({ page: "999", pageSize: "1", search: "fixture", sourceId: "S001" });
const routes = [
  { name: "dashboard", render: () => Dashboard(), adminOnly: false },
  { name: "activities", render: () => Activities({ searchParams: query }), adminOnly: false },
  { name: "candidates", render: () => Candidates({ searchParams: query }), adminOnly: false },
  {
    name: "candidate",
    render: () => Candidate({ params: Promise.resolve({ candidateId: "E019" }), searchParams: Promise.resolve({}) }),
    adminOnly: false,
  },
  { name: "sources", render: () => Sources({ searchParams: query }), adminOnly: true },
  { name: "source", render: () => Source({ params: Promise.resolve({ sourceId: "S001" }) }), adminOnly: true },
  { name: "runs", render: () => Runs({ searchParams: query }), adminOnly: true },
  {
    name: "run",
    render: () => Run({ params: Promise.resolve({ runId: "fixture-run-8421" }), searchParams: query }),
    adminOnly: true,
  },
];

function member(role: "admin" | "reviewer"): AdminAccessResult {
  return { status: "authenticated", session: { subject: role, displayName: role, role } };
}

beforeEach(() => {
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ADMIN_DEV_AUTH_MODE", "disabled");
  vi.stubGlobal("fetch", vi.fn());
  getAccess.mockReset().mockResolvedValue(member("admin"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe.each(["admin", "reviewer"] as const)("remote Admin pages for %s", (role) => {
  it.each(routes)(
    "$name never renders fixtures or interprets missing contracts as an empty page",
    async ({ render, adminOnly }) => {
      getAccess.mockResolvedValue(member(role));
      if (role === "reviewer" && adminOnly) {
        await expect(render()).rejects.toThrow("REDIRECT:/admin/forbidden");
      } else {
        const html = renderToStaticMarkup(await render());
        expect(html).toContain("NOT_AVAILABLE");
        expect(html).toContain('role="alert"');
        expect(html).toContain('href="/admin/discovery"');
        expect(html).not.toMatch(/<table|fixture-run|S001|E019|<form|admin-metric-card|admin-status-ring/);
      }
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(routes)("revocation blocks $name on the next request", async ({ render }) => {
    getAccess.mockResolvedValue(member(role));
    try {
      await render();
    } catch (error) {
      // Reviewer source/run requests are denied even before revocation.
      expect(String(error)).toContain("REDIRECT:/admin/forbidden");
    }
    getAccess.mockResolvedValue({ status: "unauthenticated", reason: "unauthorized" });
    await expect(render()).rejects.toThrow("REDIRECT:/admin-access?reason=unauthorized");
    expect(fetch).not.toHaveBeenCalled();
  });
});
