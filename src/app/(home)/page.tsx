import type { Metadata } from "next";
import { PublicHome } from "@/presentation/public/PublicHome";
import { getPublicCatalogConfig } from "@/config/publicCatalog";
import { loadPublicCatalog } from "@/data/publicCatalogProvider";
import { selectCatalog, type CatalogSearchParams } from "@/presentation/public/catalogQuery";
import "../catalog.css";

type Props = { searchParams: Promise<CatalogSearchParams> };

/** Filter, period, month and cursor combinations are shareable but never indexable (#53). */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  return Object.keys(params).length ? { robots: { index: false, follow: true } } : {};
}

export default async function HomePage({ searchParams }: Props) {
  const selection = selectCatalog(await searchParams);
  const result = await loadPublicCatalog(selection?.query ?? null);
  return (
    <PublicHome
      result={result}
      selection={selection}
      demo={process.env.PUBLIC_CATALOG_MODE === "local-rpc" && getPublicCatalogConfig() !== null}
    />
  );
}
