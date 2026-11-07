import "server-only";

import type { MetadataRoute } from "next";
import { getPublicCatalogConfig, type CatalogEnvironment } from "@/config/publicCatalog";
import { indexableOrigin } from "@/config/seo";
import type { PublicCatalogRepository } from "@/domain/publicCatalog";
import { SupabasePublicCatalogRepository } from "@/integrations/catalog/supabaseCatalog";

const maxPages = 5;
const windowDays = 31;

/**
 * Sitemap of what is actually publishable right now: the home plus each projected, current
 * occurrence starting within 31 days (same anonymous RPC as visitors, no-store). Filter
 * combinations, suspended/expired/unknown occurrences and private routes are never listed.
 * Outside an indexable production origin, or on any read failure beyond the home, nothing
 * speculative is emitted.
 */
export async function buildSitemap(
  environment: CatalogEnvironment = process.env,
  repository: PublicCatalogRepository | null = null,
  now = new Date(),
): Promise<MetadataRoute.Sitemap> {
  const origin = indexableOrigin(environment);
  if (!origin) return [];
  const entries: MetadataRoute.Sitemap = [{ url: `${origin}/`, changeFrequency: "daily" }];
  const config = repository ? null : getPublicCatalogConfig(environment);
  const source = repository ?? (config ? new SupabasePublicCatalogRepository(config) : null);
  if (!source) return entries;
  const query = {
    desde: now.toISOString(),
    hasta: new Date(now.getTime() + windowDays * 86_400_000).toISOString(),
    cursor: null as string | null,
    limit: 100,
  };
  const seen = new Set<string>();
  try {
    for (let page = 0; page < maxPages; page++) {
      const result = await source.list(query);
      for (const item of result.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        entries.push({ url: `${origin}/actividades/${item.id}`, lastModified: item.updatedAt });
      }
      if (!result.nextCursor) break;
      query.cursor = result.nextCursor;
    }
  } catch {
    // A partial catalogue is acceptable; an invented or stale one is not. Keep what was read.
  }
  return entries;
}
