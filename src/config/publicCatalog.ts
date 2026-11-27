import { getAuthConfig, isLoopbackOrigin, type ServerEnvironment } from "./env";

export interface CatalogEnvironment extends ServerEnvironment {
  PUBLIC_CATALOG_MODE?: string;
  PUBLIC_CATALOG_CONTRACT_VERSION?: string;
}

/** Explicit public read mode; credentials and visitor sessions are never forwarded. */
export function getPublicCatalogConfig(environment: CatalogEnvironment = process.env) {
  if (
    environment.PUBLIC_CATALOG_CONTRACT_VERSION !== undefined &&
    !["1", "2", "3"].includes(environment.PUBLIC_CATALOG_CONTRACT_VERSION)
  )
    return null;
  // v2/v3 are opt-in contracts still pending their operator gates: never selectable in production.
  const version = environment.PUBLIC_CATALOG_CONTRACT_VERSION;
  if ((version === "2" || version === "3") && !["development", "staging"].includes(environment.APP_ENV ?? ""))
    return null;
  const auth = getAuthConfig(environment);
  const config =
    auth && (version === "2" || version === "3" ? { ...auth, contractVersion: Number(version) as 2 | 3 } : auth);
  if (environment.PUBLIC_CATALOG_MODE === "supabase") {
    return config &&
      ["development", "staging", "production"].includes(environment.APP_ENV ?? "") &&
      config.url.startsWith("https://")
      ? config
      : null;
  }
  if (
    environment.PUBLIC_CATALOG_MODE !== "local-rpc" ||
    environment.APP_ENV !== "development" ||
    environment.NODE_ENV !== "development" ||
    environment.VERCEL !== undefined ||
    environment.VERCEL_ENV !== undefined ||
    !isLoopbackOrigin(environment.APP_ORIGIN)
  )
    return null;
  return config && isLoopbackOrigin(config.url) ? config : null;
}
