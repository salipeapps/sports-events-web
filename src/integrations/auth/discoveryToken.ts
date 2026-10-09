import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminRole } from "@/domain/adminAccess";
import { getAuthConfig } from "@/config/env";
import { createAuthClient } from "./supabaseServer";

export type DiscoveryTokenResult =
  | { status: "authorized"; accessToken: string; subject: string; role: AdminRole }
  | { status: "denied"; code: "UNAUTHENTICATED" | "FORBIDDEN" };

// Call only from server code. Never return this result through a Server Action,
// serialize it into React props, log it or cache it across requests.
export async function getDiscoveryAccessToken(): Promise<DiscoveryTokenResult> {
  try {
    const config = getAuthConfig();
    if (!config) return { status: "denied", code: "UNAUTHENTICATED" };
    const client = await createAuthClient();
    if (!client) return { status: "denied", code: "UNAUTHENTICATED" };
    return await verifyDiscoveryAccessToken(client, `${config.url}/auth/v1`);
  } catch {
    return { status: "denied", code: "UNAUTHENTICATED" };
  }
}

export async function verifyDiscoveryAccessToken(
  client: SupabaseClient,
  issuer: string,
): Promise<DiscoveryTokenResult> {
  const unauthenticated = { status: "denied", code: "UNAUTHENTICATED" } as const;
  const forbidden = { status: "denied", code: "FORBIDDEN" } as const;
  try {
    // Verify current identity before reading authorization or accessing session data.
    const user = await client.auth.getUser();
    if (user.error || !user.data.user || user.data.user.is_anonymous) return unauthenticated;
    const membership = await client
      .from("admin_memberships")
      .select("role,is_active")
      .eq("user_id", user.data.user.id)
      .maybeSingle();
    const role = membership.data?.role;
    if (membership.error || membership.data?.is_active !== true || (role !== "admin" && role !== "reviewer"))
      return forbidden;

    // getSession is only a token transport, never an identity/permission source.
    const session = await client.auth.getSession();
    const token = session.data.session?.access_token;
    if (session.error || !token) return unauthenticated;
    // Verify this exact bearer, including signatures, using the configured Auth client.
    const verified = await client.auth.getClaims(token);
    if (verified.error || !verified.data) return unauthenticated;
    const { claims, header } = verified.data;
    const now = Math.floor(Date.now() / 1000);
    const audience = claims.aud;
    if (
      !["RS256", "ES256"].includes(header.alg) ||
      claims.iss !== issuer ||
      !(audience === "authenticated" || (Array.isArray(audience) && audience.includes("authenticated"))) ||
      claims.sub !== user.data.user.id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(claims.sub) ||
      claims.role !== "authenticated" ||
      claims.is_anonymous !== false ||
      !Number.isFinite(claims.exp) ||
      !Number.isFinite(claims.iat) ||
      claims.exp <= now ||
      claims.iat > now ||
      claims.exp <= claims.iat ||
      (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now))
    )
      return unauthenticated;
    if (claims.app_metadata?.discovery_role !== role) return forbidden;
    // Reverify the exact bearer online as well (the session may have refreshed).
    const bearerUser = await client.auth.getUser(token);
    if (bearerUser.error || bearerUser.data.user?.id !== claims.sub || bearerUser.data.user.is_anonymous)
      return unauthenticated;
    return { status: "authorized", accessToken: token, subject: claims.sub, role };
  } catch {
    return unauthenticated;
  }
}
