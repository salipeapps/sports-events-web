import "server-only";

import { getPublicCatalogConfig } from "@/config/publicCatalog";
import type { CatalogQuery, CatalogResult } from "@/domain/publicCatalog";
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
