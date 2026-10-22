import { PublicHome } from "@/presentation/public/PublicHome";
import { getPublicCatalogConfig } from "@/config/publicCatalog";
import { loadPublicCatalog } from "@/data/publicCatalogProvider";
import { selectCatalog, type CatalogSearchParams } from "@/presentation/public/catalogQuery";
import "./catalog.css";

export default async function HomePage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const selection = selectCatalog(await searchParams);
  const result = await loadPublicCatalog(selection?.query ?? null);
  return <PublicHome result={result} selection={selection} demo={getPublicCatalogConfig() !== null} />;
}
