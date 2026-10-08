import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseAdminSessionProvider } from "./supabaseAccess";
function provider(role: string | null, active = true, invalid = false) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: role ? { role, is_active: active } : null, error: null });
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: invalid ? null : { id: "verified", email: "review@example.test", user_metadata: { role: "admin" } },
        },
        error: invalid ? new Error("Invalid JWT") : null,
      }),
    },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
  };
  return { adapter: new SupabaseAdminSessionProvider(client as unknown as SupabaseClient), client, maybeSingle };
}
describe("verified Supabase membership authorization", () => {
  it.each(["admin", "reviewer"])("allows active %s from the database", async (role) => {
    expect(await provider(role).adapter.getAccess()).toMatchObject({
      status: "authenticated",
      session: { subject: "verified", role },
    });
  });
  it.each([
    [null, true],
    ["admin", false],
    ["owner", true],
  ])("denies missing, inactive or unknown membership (%s,%s)", async (role, active) => {
    expect(await provider(role as string | null, active as boolean).adapter.getAccess()).toEqual({
      status: "unauthenticated",
      reason: "unauthorized",
    });
  });
  it("denies expired/invalid identity before querying roles", async () => {
    const fixture = provider("admin", true, true);
    expect((await fixture.adapter.getAccess()).status).toBe("unauthenticated");
    expect(fixture.client.from).not.toHaveBeenCalled();
  });
  it("rechecks membership on every invocation and never uses editable metadata", async () => {
    const fixture = provider("reviewer");
    expect(await fixture.adapter.getAccess()).toMatchObject({ session: { role: "reviewer" } });
    fixture.maybeSingle.mockResolvedValue({ data: { role: "admin", is_active: false }, error: null });
    expect((await fixture.adapter.getAccess()).status).toBe("unauthenticated");
    expect(fixture.maybeSingle).toHaveBeenCalledTimes(2);
  });
  it("fails closed on network and RLS errors", async () => {
    const fixture = provider("admin");
    fixture.client.auth.getUser.mockRejectedValue(new Error("Network"));
    expect((await fixture.adapter.getAccess()).status).toBe("unauthenticated");
    const db = provider("admin");
    db.maybeSingle.mockResolvedValue({ data: null, error: new Error("RLS") });
    expect((await db.adapter.getAccess()).status).toBe("unauthenticated");
  });
});
