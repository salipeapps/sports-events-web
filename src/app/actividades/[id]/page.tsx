import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicCatalogConfig } from "@/config/publicCatalog";
import { indexableOrigin } from "@/config/seo";
import { loadPublicOccurrenceOnce } from "@/data/publicCatalogProvider";
import {
  OccurrenceDetail,
  occurrenceStructuredData,
  serializeStructuredData,
} from "@/presentation/public/OccurrenceDetail";
import { PublicFooter, PublicHeader } from "@/presentation/public/PublicChrome";
import { categoryLabel, madridStart } from "@/presentation/public/occurrencePresentation";
import "../../catalog.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const result = await loadPublicOccurrenceOnce((await params).id);
  if (result.status !== "ready") return { title: "Actividad no disponible", robots: { index: false, follow: false } };
  const { occurrence } = result;
  const place = occurrence.locations.find((location) => location.role !== "destination")?.municipality;
  return {
    title: occurrence.title,
    description: [
      categoryLabel(occurrence.category),
      `${madridStart.format(new Date(occurrence.startInstant))} h`,
      place,
    ]
      .filter(Boolean)
      .join(" · "),
    // Canonical only on the authorized production origin (metadataBase is set by the root layout).
    ...(indexableOrigin() ? { alternates: { canonical: `/actividades/${occurrence.id}` } } : {}),
  };
}

export default async function OccurrencePage({ params }: Params) {
  const result = await loadPublicOccurrenceOnce((await params).id);
  // Unknown, withdrawn, suspended, cancelled and expired occurrences are indistinguishable: HTTP 404.
  if (result.status === "not_found") notFound();
  const demo = process.env.PUBLIC_CATALOG_MODE === "local-rpc" && getPublicCatalogConfig() !== null;
  return (
    <div className="public-catalog">
      <PublicHeader />
      <main className="public-detail-page">
        <nav aria-label="Ruta de navegación">
          <Link className="public-back" href="/#activities" prefetch={false}>
            <span aria-hidden="true">←</span> Volver a la agenda
          </Link>
        </nav>
        {demo && (
          <p className="public-demo" role="status">
            Datos de prueba locales · No son actividades reales.
          </p>
        )}
        {result.status === "ready" ? (
          <>
            <OccurrenceDetail occurrence={result.occurrence} />
            {!demo && (
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                  __html: serializeStructuredData(occurrenceStructuredData(result.occurrence)),
                }}
              />
            )}
          </>
        ) : (
          <div className="public-empty" role="status">
            <span aria-hidden="true">○</span>
            <h1>La ficha no está disponible ahora</h1>
            <p>No hemos podido consultar esta actividad. Vuelve a intentarlo más adelante.</p>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
