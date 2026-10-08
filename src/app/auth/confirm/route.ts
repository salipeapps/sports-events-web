import { NextResponse, type NextRequest } from "next/server";
import { createAuthClient } from "@/integrations/auth/supabaseServer";
import { getAuthConfig } from "@/config/env";

export async function GET(request: NextRequest) {
  const config = getAuthConfig();
  if (!config) return new NextResponse("Auth unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  let verified = false;
  try {
    const client = await createAuthClient();
    if (client && token_hash && (type === "invite" || type === "recovery"))
      verified = !(await client.auth.verifyOtp({ token_hash, type })).error;
    else if (client && code) verified = !(await client.auth.exchangeCodeForSession(code)).error;
  } catch {
    /* Invalid/expired tokens fail closed. */
  }
  const response = NextResponse.redirect(
    `${config.origin}${verified ? "/admin-access/password" : "/admin-access?reason=expired"}`,
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
