import { describe, expect, it, vi } from "vitest";
import { requeryCandidateAction, reprocessCandidateAction, approveCandidateAction } from "./actions";
import { getAdminAccess } from "@/integrations/auth/adminAuth";
import { getAdminRepository } from "@/data/adminRepositoryProvider";
vi.mock("@/integrations/auth/adminAuth", () => ({ getAdminAccess: vi.fn() }));
vi.mock("@/data/adminRepositoryProvider", () => ({ getAdminRepository: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new Error(`REDIRECT:${target}`);
  },
}));
describe("server action authorization before repository access", () => {
  it.each([requeryCandidateAction, reprocessCandidateAction])(
    "denies reviewer execution despite forged payload",
    async (action) => {
      vi.mocked(getAdminAccess).mockResolvedValue({
        status: "authenticated",
        session: { subject: "reviewer", displayName: "Reviewer", role: "reviewer" },
      });
      const form = new FormData();
      form.set("candidateId", "fixture");
      form.set("role", "admin");
      await expect(action(form)).rejects.toThrow('not allowed to perform "runs.execute"');
      expect(getAdminRepository).not.toHaveBeenCalled();
    },
  );
  it("denies direct editorial submission without verified identity", async () => {
    vi.mocked(getAdminAccess).mockResolvedValue({ status: "unauthenticated", reason: "missing_session" });
    const form = new FormData();
    form.set("candidateId", "fixture");
    await expect(approveCandidateAction(form)).rejects.toThrow("REDIRECT:/admin-access");
    expect(getAdminRepository).not.toHaveBeenCalled();
  });
});
