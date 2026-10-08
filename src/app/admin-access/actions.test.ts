import { beforeEach, describe, expect, it, vi } from "vitest";
import { loginAction, recoverPasswordAction, setPasswordAction, logoutAction } from "./actions";
import { createAuthClient } from "@/integrations/auth/supabaseServer";
import { getAuthConfig } from "@/config/env";
vi.mock("@/integrations/auth/supabaseServer", () => ({ createAuthClient: vi.fn() }));
vi.mock("@/integrations/auth/supabaseAccess", () => ({
  SupabaseAdminSessionProvider: class {
    async getAccess() {
      return { status: "authenticated" };
    }
  },
}));
vi.mock("@/config/env", () => ({ getAuthConfig: vi.fn() }));
const { remove } = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [{ name: "sb-project-auth-token.0" }, { name: "unrelated" }], delete: remove }),
}));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new Error(`REDIRECT:${target}`);
  },
}));
const empty = { message: "" };
function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  return data;
}
describe("Auth server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthConfig).mockReturnValue({
      url: "https://project.supabase.co",
      key: "sb_publishable_fixture",
      origin: "https://admin.example.test",
    });
  });
  it("validates credentials before accessing the provider", async () => {
    expect((await loginAction(empty, form({ email: "bad", password: "" }))).message).toContain("válidos");
    expect(createAuthClient).not.toHaveBeenCalled();
  });
  it("fails closed when configuration is missing or credentials are incorrect", async () => {
    vi.mocked(createAuthClient).mockResolvedValue(null);
    expect((await loginAction(empty, form({ email: "user@example.test", password: "bad" }))).message).toContain(
      "No se ha podido",
    );
    vi.mocked(createAuthClient).mockResolvedValue({
      auth: { signInWithPassword: async () => ({ error: { message: "Sensitive provider detail" } }) },
    } as never);
    expect(await loginAction(empty, form({ email: "user@example.test", password: "bad" }))).toEqual({
      message: "No se ha podido iniciar sesión con esas credenciales.",
    });
  });
  it("ignores hostile return destinations after a successful login", async () => {
    vi.mocked(createAuthClient).mockResolvedValue({
      auth: { signInWithPassword: async () => ({ error: null }) },
    } as never);
    await expect(
      loginAction(empty, form({ email: "user@example.test", password: "password", next: "https://evil.test" })),
    ).rejects.toThrow("REDIRECT:/admin");
  });
  it("recovery uses canonical callback and never enumerates accounts", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: new Error("User missing") });
    vi.mocked(createAuthClient).mockResolvedValue({ auth: { resetPasswordForEmail } } as never);
    expect(
      (await recoverPasswordAction(empty, form({ email: "user@example.test", next: "https://evil.test" }))).message,
    ).toContain("Si la cuenta");
    expect(resetPasswordForEmail).toHaveBeenCalledWith("user@example.test", {
      redirectTo: "https://admin.example.test/auth/confirm",
    });
  });
  it("password changes require matching validation and a verified user", async () => {
    expect((await setPasswordAction(empty, form({ password: "short", confirmation: "short" }))).message).toContain(
      "12 y 128",
    );
    const updateUser = vi.fn();
    vi.mocked(createAuthClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: new Error("Expired") }), updateUser },
    } as never);
    expect(
      (
        await setPasswordAction(
          empty,
          form({ password: "long-password-fixture", confirmation: "long-password-fixture" }),
        )
      ).message,
    ).toContain("caducado");
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("logout clears project cookies even when Auth cannot revoke remotely", async () => {
    vi.mocked(createAuthClient).mockResolvedValue({
      auth: {
        signOut: async () => {
          throw new Error("offline");
        },
      },
    } as never);
    await expect(logoutAction()).rejects.toThrow("REDIRECT:/admin-access?reason=missing_session");
    expect(remove).toHaveBeenCalledWith("sb-project-auth-token.0");
    expect(remove).not.toHaveBeenCalledWith("unrelated");
  });
});
