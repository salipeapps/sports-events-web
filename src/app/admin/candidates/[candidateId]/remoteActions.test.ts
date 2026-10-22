import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getAdminAccess } from "@/integrations/auth/adminAuth";
import * as actions from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/auth/adminAuth", () => ({ getAdminAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

beforeEach(() => {
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ADMIN_DEV_AUTH_MODE", "disabled");
  vi.stubGlobal("fetch", vi.fn());
  vi.mocked(getAdminAccess).mockResolvedValue({
    status: "authenticated",
    session: { subject: "admin", displayName: "Admin", role: "admin" },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each(Object.entries(actions))(
  "direct remote submission to %s cannot mutate fixtures or report success",
  async (_name, action) => {
    const form = new FormData();
    form.set("candidateId", "candidate-valid-E019");
    form.set("candidateVersion", "forged");
    form.set("blockerKind", "conflict");
    form.set("blockerId", "blocker");
    await expect(action(form)).rejects.toThrow(/REDIRECT:.*\?error=(NOT_AVAILABLE|WRITE_UNAVAILABLE)/);
    expect(getAdminAccess).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  },
);
