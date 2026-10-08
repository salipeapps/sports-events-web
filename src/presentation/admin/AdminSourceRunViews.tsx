import Link from "next/link";

import type { ActivityListItem, EngineRun, SourceConfig } from "@/domain/admin";
import { displayField, formatCheckedAt } from "./adminPresentation";
import {
  effectiveSourceState,
  filterRuns,
  filterSources,
  formatDuration,
  formatMoney,
  formatRunDate,
  runStateLabels,
  runStateTone,
  sourceBudgetLabel,
  sourcePolicyLabels,
  sourceStateLabels,
  sourceStateTone,
  type RunQuery,
  type SourceQuery,
} from "./sourceRunPresentation";

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`admin-status-badge admin-status-${tone}`}>{label}</span>;
}

function PageHeading({ title, description, count }: { title: string; description: string; count: number }) {
  return (
    <header className="admin-page-header admin-catalog-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <span className="admin-operation-counter">{count} registros</span>
    </header>
  );
}

function EmptyTable({ message }: { message: string }) {
  return (
    <section className="admin-empty-state" role="status">
      <strong>No hay resultados</strong>
      <p>{message}</p>
    </section>
  );
}

function SourceStatus({ source }: { source: SourceConfig }) {
  const status = effectiveSourceState(source);
  return <StatusBadge label={sourceStateLabels[status]} tone={sourceStateTone(status)} />;
}

function RunStatus({ run }: { run: EngineRun }) {
  return <StatusBadge label={runStateLabels[run.status]} tone={runStateTone(run.status)} />;
}

function SourceLink({ id, sources }: { id: string; sources: SourceConfig[] }) {
  const source = sources.find((item) => item.id === id);
  return source ? (
    <Link href={`/admin/sources/${encodeURIComponent(source.id)}`}>{source.name}</Link>
  ) : (
    <span>{id} · sin ficha disponible</span>
  );
}

export function AdminSourcesCatalog({
  sources,
  runs,
  query,
}: {
  sources: SourceConfig[];
  runs: EngineRun[];
  query: SourceQuery;
}) {
  const rows = filterSources(sources, query);
  const latestRuns = new Map<string, EngineRun>();
  for (const run of filterRuns(runs, sources, {})) {
    if (run.sourceId.state === "known" && !latestRuns.has(run.sourceId.value)) {
      latestRuns.set(run.sourceId.value, run);
    }
  }
  return (
    <main className="admin-page admin-operations-page">
      <PageHeading
        title="Fuentes"
        description="Fuentes revisadas y configuradas para captación. El descubrimiento previo se gestiona por separado."
        count={sources.length}
      />
      <div className="admin-operations-action-bar">
        <p className="admin-muted-copy">Configuración en modo lectura · estados operativos de ejemplo (Admin v0).</p>
        <button className="admin-primary-button" type="button" disabled title="Alta de fuentes aún no disponible">
          + Añadir fuente
        </button>
      </div>
      <form className="admin-operations-filters" method="get" action="/admin/sources">
        <label className="admin-filter-field">
          <span>Estado</span>
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">Todos los estados</option>
            {(["active", "paused", "blocked", "budget_exhausted", "proposed"] as const).map((state) => (
              <option key={state} value={state}>
                {sourceStateLabels[state]}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-search-field">
          <span className="sr-only">Buscar fuente</span>
          <input name="q" type="search" defaultValue={query.q ?? ""} placeholder="Buscar fuente o cobertura..." />
        </label>
        <button className="admin-filter-submit" type="submit">Filtrar</button>
      </form>
      <p className="admin-results-count">Mostrando {rows.length} de {sources.length} fuentes</p>
      {rows.length === 0 ? (
        <EmptyTable message="No se encontraron fuentes con estos filtros. Prueba otra búsqueda." />
      ) : (
        <section className="admin-table-card">
          <div className="admin-table-scroll">
            <table className="admin-activities-table admin-operations-table">
              <thead>
                <tr>
                  <th>Fuente</th>
                  <th>Tipo</th>
                  <th>Cobertura</th>
                  <th>Frecuencia</th>
                  <th>Estado</th>
                  <th>Política</th>
                  <th>Última ejecución</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((source) => (
                  <tr key={source.id}>
                    <td>
                      <div className="admin-table-title">
                        <Link href={`/admin/sources/${encodeURIComponent(source.id)}`}>{source.name}</Link>
                        <small>{source.id}</small>
                      </div>
                    </td>
                    <td>{source.type}</td>
                    <td>{source.coverage.join(" · ") || "Sin dato"}</td>
                    <td>{displayField(source.frequency)}</td>
                    <td>
                      <SourceStatus source={source} />
                      {latestRuns.get(source.id)?.status === "failed" ||
                      latestRuns.get(source.id)?.status === "partial" ? (
                        <div className="admin-operation-incident">
                          <Link href={`/admin/runs/${encodeURIComponent(latestRuns.get(source.id)!.id)}`}>
                            Incidencia: {runStateLabels[latestRuns.get(source.id)!.status]}
                          </Link>
                        </div>
                      ) : null}
                    </td>
                    <td>{sourcePolicyLabels[source.publicationPolicy]}</td>
                    <td>{formatRunDate(source.lastRunAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

export function AdminRunsCatalog({
  runs,
  sources,
  query,
}: {
  runs: EngineRun[];
  sources: SourceConfig[];
  query: RunQuery;
}) {
  const operations = runs.filter((run) => run.kind !== "discovery");
  const rows = filterRuns(operations, sources, query);
  return (
    <main className="admin-page admin-operations-page">
      <PageHeading
        title="Ejecuciones"
        description="Historial de captación y procesamiento del motor; sin confundirlo con búsquedas de nuevas fuentes."
        count={operations.length}
      />
      <form className="admin-operations-filters" method="get" action="/admin/runs">
        <label className="admin-filter-field">
          <span>Estado</span>
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">Todos los estados</option>
            {(["queued", "running", "succeeded", "partial", "failed"] as const).map((state) => (
              <option key={state} value={state}>{runStateLabels[state]}</option>
            ))}
          </select>
        </label>
        <label className="admin-filter-field">
          <span>Fuente</span>
          <select name="source" defaultValue={query.source ?? ""}>
            <option value="">Todas las fuentes</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>{source.name}</option>
            ))}
          </select>
        </label>
        <label className="admin-search-field">
          <span className="sr-only">Buscar ejecución</span>
          <input name="q" type="search" defaultValue={query.q ?? ""} placeholder="Buscar ID o fuente..." />
        </label>
        <button className="admin-filter-submit" type="submit">Filtrar</button>
      </form>
      <p className="admin-results-count">Mostrando {rows.length} de {operations.length} ejecuciones</p>
      {rows.length === 0 ? (
        <EmptyTable message="No se encontraron ejecuciones con estos filtros." />
      ) : (
        <section className="admin-table-card">
          <div className="admin-table-scroll">
            <table className="admin-activities-table admin-operations-table admin-runs-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fuente</th>
                  <th>Inicio</th>
                  <th>Duración</th>
                  <th>Nuevos</th>
                  <th>Actualizados</th>
                  <th>Descartados</th>
                  <th>Revisión</th>
                  <th>Coste / consumo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <div className="admin-table-title">
                        <Link href={`/admin/runs/${encodeURIComponent(run.id)}`}>{run.id}</Link>
                      </div>
                    </td>
                    <td>
                      {run.sourceId.state === "known" ? (
                        <SourceLink id={run.sourceId.value} sources={sources} />
                      ) : (
                        displayField(run.sourceId)
                      )}
                    </td>
                    <td>{formatCheckedAt(run.startedAt)}</td>
                    <td>{formatDuration(run.durationSeconds)}</td>
                    <td>{run.counters.created}</td>
                    <td>{run.counters.updated}</td>
                    <td>{run.counters.discarded}</td>
                    <td>{run.counters.review}</td>
                    <td>{formatMoney(run.cost)}</td>
                    <td><RunStatus run={run} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function DetailSection({ title, values }: { title: string; values: [string, string][] }) {
  return (
    <section className="admin-review-card">
      <h2>{title}</h2>
      <dl className="admin-definition-list">
        {values.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function NoteList({ title, notes }: { title: string; notes: string[] }) {
  return (
    <section className="admin-review-card">
      <h2>{title}</h2>
      {notes.length === 0 ? (
        <p className="admin-muted-copy">Sin incidencias registradas.</p>
      ) : (
        <ul className="admin-operation-notes">{notes.map((note) => <li key={note}>{note}</li>)}</ul>
      )}
    </section>
  );
}

export function AdminSourceDetail({ source, runs }: { source: SourceConfig; runs: EngineRun[] }) {
  const sourceRuns = filterRuns(runs, [source], { source: source.id });
  const origin = source.discoveryOrigin;
  const reviewedDiscoveryUrl =
    origin?.reviewUrl?.startsWith("/admin/discovery/") ? origin.reviewUrl : null;
  return (
    <main className="admin-page admin-operations-page">
      <Link className="admin-back-link" href="/admin/sources">← Volver a fuentes</Link>
      <header className="admin-detail-header">
        <div><h1>{source.name}</h1><p>{source.type} · {source.id} · Prioridad {source.priority}</p></div>
        <SourceStatus source={source} />
      </header>
      <div className="admin-summary-grid">
        <DetailSection
          title="Configuración y política"
          values={[
            ["Cobertura", source.coverage.join(" · ") || "Sin dato"],
            ["Frecuencia", displayField(source.frequency)],
            ["Política", sourcePolicyLabels[source.publicationPolicy]],
            ["Publicación automática", source.autoPublishMode === "simulation" ? "Solo simulación" : source.autoPublishMode === "enabled" ? "Activada" : "Desactivada"],
            ["Captación", source.accessMethod],
            ["Última ejecución", formatRunDate(source.lastRunAt)],
            ["Presupuesto", sourceBudgetLabel(source)],
          ]}
        />
        <DetailSection
          title="Capacidades y acceso"
          values={[
            ["Campos obtenidos", source.observedFields.join(" · ") || "Sin dato"],
            ["Capacidades", source.capabilities.join(" · ") || "Sin dato"],
            ["URLs permitidas", source.allowedUrls.join(" · ") || "Sin dato"],
            ["Limitaciones", source.limitations.join(" · ") || "Sin dato"],
          ]}
        />
      </div>
      <div className="admin-summary-grid">
        <NoteList title="Incidencias y notas" notes={source.notes} />
        <section className="admin-review-card">
          <h2>Procedencia del descubrimiento</h2>
          {origin ? (
            <div>
              <p>Candidato: {origin.candidateId}</p>
              {origin.queryId ? <p>Consulta: {origin.queryId}</p> : null}
              {origin.executionId ? <p>Ejecución: {origin.executionId}</p> : null}
              {reviewedDiscoveryUrl ? <Link href={reviewedDiscoveryUrl}>Ver revisión de origen →</Link> : null}
            </div>
          ) : (
            <p className="admin-muted-copy">No consta una relación de descubrimiento en este registro.</p>
          )}
        </section>
      </div>
      <section className="admin-review-card admin-operation-related">
        <h2>Ejecuciones relacionadas</h2>
        {sourceRuns.length === 0 ? (
          <p className="admin-muted-copy">No hay ejecuciones asociadas a esta fuente.</p>
        ) : (
          <ul className="admin-operation-notes">
            {sourceRuns.map((run) => (
              <li key={run.id}>
                <Link href={`/admin/runs/${encodeURIComponent(run.id)}`}>{run.id}</Link>
                {" · "}{formatCheckedAt(run.startedAt)}{" · "}{runStateLabels[run.status]}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export function AdminRunDetail({
  run,
  sources,
  candidates,
}: {
  run: EngineRun;
  sources: SourceConfig[];
  candidates: ActivityListItem[];
}) {
  const source = run.sourceId.state === "known" ? sources.find((item) => item.id === run.sourceId.value) : null;
  return (
    <main className="admin-page admin-operations-page">
      <Link className="admin-back-link" href="/admin/runs">← Volver a ejecuciones</Link>
      <header className="admin-detail-header">
        <div><h1>{run.id}</h1><p>Tipo: {run.kind} · {formatCheckedAt(run.startedAt)}</p></div>
        <RunStatus run={run} />
      </header>
      <div className="admin-summary-grid">
        <DetailSection
          title="Ejecución y resultados"
          values={[
            ["Fuente", source?.name ?? displayField(run.sourceId)],
            ["Consulta", displayField(run.query)],
            ["Inicio", formatCheckedAt(run.startedAt)],
            ["Fin", formatRunDate(run.finishedAt)],
            ["Duración", formatDuration(run.durationSeconds)],
            ["Detectados", String(run.counters.discovered)],
            ["Nuevos", String(run.counters.created)],
            ["Actualizados", String(run.counters.updated)],
            ["Descartados", String(run.counters.discarded)],
            ["Revisión", String(run.counters.review)],
          ]}
        />
        <DetailSection
          title="Consumo e incidencias"
          values={[
            ["Coste / consumo", formatMoney(run.cost)],
            ["Incidencia", displayField(run.incident)],
            ["Reintentos", String(run.retryCount)],
            ["Estado", runStateLabels[run.status]],
          ]}
        />
      </div>
      {source ? (
        <p className="admin-operation-related">
          <Link href={`/admin/sources/${encodeURIComponent(source.id)}`}>Ver configuración de {source.name} →</Link>
        </p>
      ) : null}
      <section className="admin-review-card admin-operation-related">
        <h2>Candidatos originados por esta ejecución</h2>
        {candidates.length === 0 ? (
          <p className="admin-muted-copy">Sin candidatos pendientes vinculados a esta ejecución.</p>
        ) : (
          <ul className="admin-operation-notes">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <Link href={`/admin/candidates/${encodeURIComponent(candidate.id)}`}>
                  {displayField(candidate.title)}
                </Link>
                {" · "}{candidate.id}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
