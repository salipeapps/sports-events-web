import { getAuthConfig, isLoopbackOrigin, type ServerEnvironment } from "./env";

export interface CatalogEnvironment extends ServerEnvironment {
  PUBLIC_CATALOG_MODE?: string;
}

/** Remote activation awaits Engine #122 SQL, nested DTOs and independent security review. */
export function getPublicCatalogConfig(environment: CatalogEnvironment = process.env) {
  if (
    environment.PUBLIC_CATALOG_MODE !== "local-rpc" ||
    environment.APP_ENV !== "development" ||
    environment.NODE_ENV !== "development" ||
    environment.VERCEL !== undefined ||
    environment.VERCEL_ENV !== undefined ||
    !isLoopbackOrigin(environment.APP_ORIGIN)
  )
    return null;
  const config = getAuthConfig(environment);
  return config && isLoopbackOrigin(config.url) ? config : null;
}
