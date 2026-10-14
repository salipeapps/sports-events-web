import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { getAdminRepository } from "@/data/adminRepositoryProvider";
import type { AdminAccessResult, AdminCapability } from "@/domain/adminAccess";
import SourcesPage from "./sources/page";
import SourceDetailPage from "./sources/[sourceId]/page";
import RunsPage from "./runs/page";
import RunDetailPage from "./runs/[runId]/page";
import ForbiddenPage from "./forbidden/page";

const { getAccess } = vi.hoisted(() => ({ getAccess: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/integrations/auth/supabaseServer", () => ({ createAuthClient: async () => ({}) }));
vi.mock("@/integrations/auth/supabaseAccess", () => ({
  SupabaseAdminSessionProvider: class {
    getAccess = getAccess;
  },
}));
vi.mock("@/config/env", () => ({ getServerConfig: () => ({ adminDevAuthMode: "disabled" }) }));
vi.mock("@/data/adminRepositoryProvider", () => ({ getAdminRepository: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new Error(`REDIRECT:${target}`);
  },
}));

const reviewer: AdminAccessResult = {
  status: "authenticated",
  session: { subject: "reviewer", displayName: "Test Reviewer", role: "reviewer" },
};
const routes = [
  { capability: "sources.manage", render: () => SourcesPage({ searchParams: Promise.resolve({}) }) },
  { capability: "sources.manage", render: () => SourceDetailPage({ params: Promise.resolve({ sourceId: "S001" }) }) },
  { capability: "runs.execute", render: () => RunsPage({ searchParams: Promise.resolve({}) }) },
  {
    capability: "runs.execute",
    render: () =>
      RunDetailPage({ params: Promise.resolve({ runId: "fixture-run-8421" }), searchParams: Promise.resolve({}) }),
  },
];

describe("server authorization before protected data access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAccess.mockResolvedValue(reviewer);
  });

  it.each(routes)("denies $capability without even constructing a repository", async ({ capability, render }) => {
    await expect(render()).rejects.toThrow(`REDIRECT:/admin/forbidden?capability=${capability}`);
    expect(getAdminRepository).not.toHaveBeenCalled();
  });

  it.each(["sources.manage", "runs.execute", "discovery.view"] as AdminCapability[])(
    "allows admin %s",
    async (capability) => {
      getAccess.mockResolvedValue({
        status: "authenticated",
        session: { subject: "admin", displayName: "Admin", role: "admin" },
      });
      expect((await requireAdminAccess(capability)).role).toBe("admin");
    },
  );

  it("retains reviewer discovery and editorial capabilities", async () => {
    for (const capability of ["discovery.view", "catalog.review", "catalog.publish"] as const) {
      expect((await requireAdminAccess(capability)).role).toBe("reviewer");
    }
  });

  it.each(["missing_session", "expired", "unauthorized"] as const)(
    "redirects %s sessions to login, including forbidden itself",
    async (reason) => {
      getAccess.mockResolvedValue({ status: "unauthenticated", reason });
      for (const { render } of routes)
        await expect(render()).rejects.toThrow(`REDIRECT:/admin-access?reason=${reason}`);
      await expect(ForbiddenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        `REDIRECT:/admin-access?reason=${reason}`,
      );
      expect(getAdminRepository).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "https://evil.test", ["sources.manage", "runs.execute"]])(
    "ignores unknown or repeated capability input %s",
    async (capability) => {
      const html = renderToStaticMarkup(
        await ForbiddenPage({ searchParams: Promise.resolve({ capability, next: "https://evil.test" }) }),
      );
      expect(html).toContain("Tu rol es Revisor");
      expect(html).toContain("Esta sección requiere permisos adicionales");
      expect(html).toContain('href="/admin/discovery"');
      expect(html).toContain('href="/admin"');
      expect(html).not.toContain("evil.test");
    },
  );
});
