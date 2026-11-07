import type { ServerEnvironment } from "./env";

/**
 * Canonical public origin, only when the site may be indexed: APP_ENV=production, a Vercel
 * production deployment (or no Vercel), and an HTTPS origin without path, query or credentials.
 * STAGING, previews, development and any incomplete configuration are never indexable.
 */
export function indexableOrigin(environment: ServerEnvironment = process.env): string | null {
  if (environment.APP_ENV !== "production") return null;
  if (environment.VERCEL_ENV !== undefined && environment.VERCEL_ENV !== "production") return null;
  try {
    const url = new URL(environment.APP_ORIGIN ?? "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      url.port ||
      /^(localhost|127\.|\[::1\])/.test(url.hostname) ||
      /\.vercel\.app$/.test(url.hostname)
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Private surfaces that must never be crawled, whatever the environment. */
export const privatePaths = ["/admin", "/admin-access", "/auth", "/api"];
