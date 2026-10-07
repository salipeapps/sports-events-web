import Link from "next/link";
import { notFound } from "next/navigation";

import { getAdminRepository } from "@/data/adminRepositoryProvider";
import {
  displayField,
  formatCheckedAt,
  formatLocalDateTime,
  statusLabels,
  statusTone,
} from "@/presentation/admin/adminPresentation";

export default async function CandidateSummaryPage({ params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const candidate = await getAdminRepository().getCandidate(candidateId);

  if (!candidate) notFound();

  const openConflicts = candidate.conflicts.filter((conflict) => conflict.status === "open");

  return (
    <main className="admin-page">
      <Link className="admin-back-link" href="/admin/candidates">
        ← Volver a candidatos
      </Link>

      <header className="admin-page-header admin-detail-header">
        <div>
          <h1>{displayField(candidate.final.title)}</h1>
          <p>Resumen operativo de la candidatura y sus bloqueos antes de la revisión editorial detallada.</p>
        </div>
        <span className={`admin-status-badge admin-status-${statusTone(candidate.editorialStatus)}`}>
          {statusLabels[candidate.editorialStatus]}
        </span>
      </header>

      <section className="admin-summary-grid">
        <article className="admin-dashboard-card">
          <h2>Datos básicos</h2>
          <dl className="admin-definition-list">
            <div>
              <dt>Fecha</dt>
              <dd>{displayField(candidate.final.startLocal, formatLocalDateTime)}</dd>
            </div>
            <div>
              <dt>Fuente</dt>
              <dd>{candidate.sourceId}</dd>
            </div>
            <div>
              <dt>Última comprobación</dt>
              <dd>{formatCheckedAt(candidate.lastCheckedAt)}</dd>
            </div>
          </dl>
        </article>

        <article className="admin-dashboard-card">
          <h2>Conflictos abiertos</h2>
          {openConflicts.length > 0 ? (
            <ul className="admin-conflict-list">
              {openConflicts.map((conflict) => (
                <li key={conflict.id}>
                  <strong>{conflict.blocking ? "Bloqueante" : "Revisar"}</strong>
                  <span>{conflict.summary}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-muted-copy">No hay conflictos abiertos registrados.</p>
          )}
        </article>
      </section>
    </main>
  );
}
