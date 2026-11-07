import "server-only";

import { cache } from "react";

import { getPublicCatalogConfig } from "@/config/publicCatalog";
import type { CatalogQuery, CatalogResult, OccurrenceResult } from "@/domain/publicCatalog";
import { CatalogReadError, SupabasePublicCatalogRepository } from "@/integrations/catalog/supabaseCatalog";

export async function loadPublicCatalog(query: CatalogQuery | null): Promise<CatalogResult> {
  if (!query) return { status: "invalid" };
  const config = getPublicCatalogConfig();
  if (!config) return { status: "disabled" };
  try {
    return { status: "ready", ...(await new SupabasePublicCatalogRepository(config).list(query)) };
  } catch (error) {
    return {
      status: error instanceof CatalogReadError && error.code === "INVALID_REQUEST" ? "invalid" : "unavailable",
    };
  }
}

/** Fail-closed public detail. A disabled or incomplete configuration never reaches a backend. */
export async function loadPublicOccurrence(id: string): Promise<OccurrenceResult> {
  const config = getPublicCatalogConfig();
  if (!config) return { status: "disabled" };
  try {
    return { status: "ready", occurrence: await new SupabasePublicCatalogRepository(config).get(id) };
  } catch (error) {
    return {
      status:
        error instanceof CatalogReadError && (error.code === "NOT_FOUND" || error.code === "INVALID_REQUEST")
          ? "not_found"
          : "unavailable",
    };
  }
}

/** Request-scoped memo so metadata and page share one RPC call; never a cross-request cache. */
export const loadPublicOccurrenceOnce = cache(loadPublicOccurrence);
