import "server-only";

import { getDiscoveryAccessToken } from "@/integrations/auth/discoveryToken";
import {
  DiscoveryReadError,
  getStagingSmokeDiscoveryRepository,
  isStagingSmokeEnabled,
} from "@/integrations/discovery/readApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Existing recovered Valencia execution; never accepts client-supplied IDs or URLs.
export const VALENCIA_SMOKE_EXECUTION_ID = "2c17a493-2f68-4e3e-a2bb-9d75bb7a4a06";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function output(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers });
}

function allowedOrigin(request: Request): boolean {
  try {
    const expected = new URL(process.env.APP_ORIGIN ?? "");
    if (expected.protocol !== "https:" || new URL(request.url).origin !== expected.origin) return false;
    if (request.headers.get("host") !== expected.host) return false;
    const referer = request.headers.get("origin");
    if (referer && referer !== expected.origin) return false;
    const site = request.headers.get("sec-fetch-site");
    return !site || site === "same-origin" || site === "none";
  } catch {
    return false;
  }
}

// This temporary endpoint is invoked from the actual approved Vercel deployment,
// which provides its own signed OIDC assertion in the function request. It never
// returns the Vercel assertion, Supabase bearer or Google Cloud Run ID token.
export async function GET(request: Request): Promise<Response> {
  if (!isStagingSmokeEnabled() || !allowedOrigin(request)) return output({ code: "NOT_FOUND" }, 404);

  const access = await getDiscoveryAccessToken();
  if (access.status === "denied") return output({ code: access.code }, access.code === "FORBIDDEN" ? 403 : 401);

  try {
    const repo = getStagingSmokeDiscoveryRepository();
    const [execution, observations, candidates] = await Promise.all([
      repo.execution(VALENCIA_SMOKE_EXECUTION_ID),
      repo.executionObservations(VALENCIA_SMOKE_EXECUTION_ID, { limit: 100 }),
      repo.candidates({ executionId: VALENCIA_SMOKE_EXECUTION_ID, limit: 100 }),
    ]);
    const counts: Record<string, number> = {};
    for (const candidate of candidates.items) {
      const classification = candidate.classification?.kind ?? "UNKNOWN";
      counts[classification] = (counts[classification] ?? 0) + 1;
    }
    const valid =
      execution.status === "SUCCEEDED" &&
      observations.nextCursor === null &&
      candidates.nextCursor === null &&
      observations.items.length === 10 &&
      candidates.items.length === 10 &&
      new Set(observations.items.map((item) => item.candidateId)).size === 10 &&
      observations.items.every((item) => item.candidateId !== null && item.knownSourceId === null) &&
      counts.UNSUPPORTED_REVIEWABLE === 9 &&
      counts.AMBIGUOUS_REVIEW_REQUIRED === 1;
    return output(
      {
        code: valid ? "SMOKE_OK" : "SMOKE_MISMATCH",
        role: access.role,
        executionStatus: execution.status,
        candidates: candidates.items.length,
        observations: observations.items.length,
        classificationCounts: counts,
        completePages: observations.nextCursor === null && candidates.nextCursor === null,
      },
      valid ? 200 : 409,
    );
  } catch (error) {
    const code = error instanceof DiscoveryReadError ? error.code : "READ_UNAVAILABLE";
    const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "NOT_CONFIGURED" ? 404 : 502;
    return output({ code }, status);
  }
}
