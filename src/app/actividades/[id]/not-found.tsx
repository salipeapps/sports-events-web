import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/presentation/public/PublicChrome";
import "../../catalog.css";

export const metadata = { title: "Actividad no disponible", robots: { index: false, follow: false } };

export default function OccurrenceNotFound() {
  return (
    <div className="public-catalog">
      <PublicHeader />
      <main className="public-detail-page">
        <div className="public-empty" role="status">
          <span aria-hidden="true">○</span>
          <h1>Esta actividad no está disponible</h1>
          <p>
            Puede que ya haya terminado, que el organizador la haya cancelado o retirado, o que el enlace no sea
            correcto. No mostramos actividades que no estén publicadas y vigentes.
          </p>
          <Link href="/#activities" prefetch={false}>
            Ver la agenda de actividades
          </Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
