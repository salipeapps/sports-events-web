import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessResult } from "@/domain/adminAccess";
import type { AdminSessionProvider } from "./adminAuth";

export class SupabaseAdminSessionProvider implements AdminSessionProvider {
  constructor(private readonly client: SupabaseClient) {}
  async getAccess(): Promise<AdminAccessResult> {
    try {
      const { data, error } = await this.client.auth.getUser();
      if (error || !data.user || data.user.is_anonymous)
        return { status: "unauthenticated", reason: "missing_session" };
      const membership = await this.client
        .from("admin_memberships")
        .select("role,is_active")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (
        membership.error ||
        membership.data?.is_active !== true ||
        !["admin", "reviewer"].includes(membership.data.role)
      )
        return { status: "unauthenticated", reason: "unauthorized" };
      return {
        status: "authenticated",
        session: { subject: data.user.id, displayName: data.user.email ?? "Admin", role: membership.data.role },
      };
    } catch {
      return { status: "unauthenticated", reason: "unauthorized" };
    }
  }
}
