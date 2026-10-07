import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAdminAccess } from "@/integrations/auth/adminAuth";
import AdminLayout from "./layout";

vi.mock("@/integrations/auth/adminAuth", () => ({
  getAdminAccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string): never => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects visitors without an administrative session", async () => {
    vi.mocked(getAdminAccess).mockResolvedValue({
      status: "unauthenticated",
      reason: "missing_session",
    });

    await expect(AdminLayout({ children: <div>Private content</div> })).rejects.toThrow(
      "REDIRECT:/admin-access?reason=missing_session",
    );
  });

  it("renders the private shell for an authorized reviewer", async () => {
    vi.mocked(getAdminAccess).mockResolvedValue({
      status: "authenticated",
      session: {
        subject: "reviewer-test",
        displayName: "Review User",
        role: "reviewer",
      },
    });

    const html = renderToStaticMarkup(await AdminLayout({ children: <div>Private content</div> }));

    expect(html).toContain("Valencia");
    expect(html).toContain("Reviewer");
    expect(html).toContain("Private content");
    expect(html).toContain("Solo admin");
  });
});
