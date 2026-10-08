import Link from "next/link";

import type { DiscoveryExecution, DiscoveryResult, DiscoverySnapshot } from "@/domain/discovery";
import { formatCheckedAt } from "./adminPresentation";

export type DiscoveryTab = "consultas" | "proveedores" | "resultados";

const tabs: Array<{ id: DiscoveryTab; name: string }> = [
  { id: "consultas", name: "Consultas" },
  { id: "proveedores", name: "Proveedores" },
  { id: "resultados", name: "Resultados" },
];

const resultLabels: Record<DiscoveryResult["status"], string> = {
  new: "Nuevo",
  known: "Conocido",
  candidate: "Candidato de fuente",
  unsupported: "Sin adaptador",
  promoted: "Promovido a fuente",
  rejected: "Rechazado",
};

function DiscoveryHeader({ detail }: { detail?: boolean }) {
  return (
    <header className="admin-page-header">
      <h1>Descubrimiento</h1>
      <p>
        {detail
          ? "Trazabilidad de la búsqueda previa a la captación."
          : "Proveedores, consultas y resultados previos a la revisión de fuentes."}
      </p>
    </header>
  );
}

function DiscoveryWarning() {
  return (
    <p className="admin-discovery-note">
      Datos de demostración, no resultados de búsquedas reales. La ejecución y promoción requieren un backend conectado.
    </p>
  );
}

function EmptyDiscovery({ label }: { label: string }) {
  return (
    <section className="admin-empty-state">
      <strong>No hay {label} registrados</strong>
      <p>La presentación no genera entidades cuando el adaptador devuelve una colección vacía.</p>
    </section>
  );
}

function QueryProvider({ selected, snapshot }: { selected: string; snapshot: DiscoverySnapshot }) {
  const provider = snapshot.providers.find((item) => (selected === "DEFAULT" ? item.isDefault : item.id === selected));
  return (
    <>
      <strong>{selected === "DEFAULT" ? "DEFAULT" : "Override explícito"}</strong>
      <span> · {provider?.name ?? "No disponible"}</span>
    </>
  );
}

export function DiscoveryOverview({ snapshot, activeTab }: { snapshot: DiscoverySnapshot; activeTab: DiscoveryTab }) {
  return (
    <main className="admin-page admin-discovery-page">
      <DiscoveryHeader />
      <DiscoveryWarning />
      <nav className="admin-tabs" aria-label="Apartados de Descubrimiento">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            className={activeTab === tab.id ? "admin-tab admin-tab-active" : "admin-tab"}
            href={`/admin/discovery?tab=${tab.id}`}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            {tab.name}
          </Link>
        ))}
      </nav>

      {activeTab === "proveedores" ? (
        snapshot.providers.length === 0 ? (
          <EmptyDiscovery label="proveedores" />
        ) : (
          <section className="admin-table-card" aria-label="Proveedores de búsqueda">
            <div className="admin-table-scroll">
              <table className="admin-activities-table">
                <thead>
                  <tr>
                    <th>Proveedor</th>
                    <th>Estado</th>
                    <th>Credenciales</th>
                    <th>Predeterminado</th>
                    <th>Capacidades e incidencias</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.providers.map((provider) => (
                    <tr key={provider.id}>
                      <td className="admin-table-title">
                        <strong>{provider.name}</strong>
                      </td>
                      <td>
                        {provider.status === "active"
                          ? "Activo"
                          : provider.status === "degraded"
                            ? "Degradado"
                            : "Sin configurar"}
                      </td>
                      <td>{provider.credentialsAvailable ? "Configuradas" : "No configuradas"}</td>
                      <td>{provider.isDefault ? "DEFAULT" : "No"}</td>
                      <td>{provider.incident ?? provider.capabilities.join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      ) : null}

      {activeTab === "consultas" ? (
        snapshot.queries.length === 0 ? (
          <EmptyDiscovery label="consultas" />
        ) : (
          <section className="admin-table-card" aria-label="Consultas de descubrimiento">
            <div className="admin-table-scroll">
              <table className="admin-activities-table admin-discovery-table">
                <thead>
                  <tr>
                    <th>Consulta</th>
                    <th>Proveedor</th>
                    <th>Ámbito</th>
                    <th>Idioma</th>
                    <th>Frecuencia</th>
                    <th>Límite</th>
                    <th>Estado</th>
                    <th>Última ejecución</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.queries.map((query) => (
                    <tr key={query.id}>
                      <td>
                        <div className="admin-table-title">
                          <strong>{query.name}</strong>
                          <small>{query.expression}</small>
                        </div>
                      </td>
                      <td>
                        <QueryProvider selected={query.providerSelection} snapshot={snapshot} />
                      </td>
                      <td>
                        {query.territory} · {query.category}
                      </td>
                      <td>{query.language.toUpperCase()}</td>
                      <td>{query.frequency}</td>
                      <td>{query.maxResults} resultados</td>
                      <td>{query.status === "paused" ? "Pausada" : "Activa"}</td>
                      <td>
                        {query.lastExecutionId ? (
                          <Link href={`/admin/discovery/executions/${encodeURIComponent(query.lastExecutionId)}`}>
                            {query.lastExecutionId}
                          </Link>
                        ) : (
                          "Sin ejecuciones"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      ) : null}

      {activeTab === "resultados" ? (
        snapshot.results.length === 0 ? (
          <EmptyDiscovery label="resultados" />
        ) : (
          <section className="admin-table-card" aria-label="Resultados de búsqueda">
            <div className="admin-table-scroll">
              <table className="admin-activities-table">
                <thead>
                  <tr>
                    <th>Resultado / URL</th>
                    <th>Consulta</th>
                    <th>Proveedor</th>
                    <th>Reobservaciones</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.results.map((result) => (
                    <tr key={result.id}>
                      <td>
                        <div className="admin-table-title">
                          <Link href={`/admin/discovery/results/${encodeURIComponent(result.id)}`}>{result.title}</Link>
                          <small>{result.url}</small>
                        </div>
                      </td>
                      <td>{snapshot.queries.find((item) => item.id === result.queryId)?.name ?? result.queryId}</td>
                      <td>
                        {snapshot.providers.find((item) => item.id === result.providerId)?.name ?? result.providerId}
                      </td>
                      <td>{result.observationCount}</td>
                      <td>{resultLabels[result.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      ) : null}

      <p className="admin-muted-copy">
        <button
          className="admin-primary-button"
          type="button"
          disabled
          title="Ejecución manual no disponible sin backend"
        >
          Probar consulta
        </button>{" "}
        La ejecución manual aún no está disponible. No se crean fuentes ni eventos automáticamente.
      </p>
    </main>
  );
}

export function DiscoveryResultDetail({ snapshot, result }: { snapshot: DiscoverySnapshot; result: DiscoveryResult }) {
  const query = snapshot.queries.find((item) => item.id === result.queryId);
  const provider = snapshot.providers.find((item) => item.id === result.providerId);
  return (
    <main className="admin-page admin-discovery-page">
      <Link className="admin-back-link" href="/admin/discovery?tab=resultados">
        ← Volver a resultados
      </Link>
      <DiscoveryHeader detail />
      <section className="admin-review-card">
        <h2>{result.title}</h2>
        <dl className="admin-definition-list">
          <div>
            <dt>Resultado</dt>
            <dd>{result.id}</dd>
          </div>
          <div>
            <dt>URL observada</dt>
            <dd className="admin-discovery-url">{result.url}</dd>
          </div>
          <div>
            <dt>Consulta</dt>
            <dd>{query?.name ?? result.queryId}</dd>
          </div>
          <div>
            <dt>Proveedor</dt>
            <dd>{provider?.name ?? result.providerId}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{resultLabels[result.status]}</dd>
          </div>
          <div>
            <dt>Observaciones</dt>
            <dd>{result.observationCount}</dd>
          </div>
          <div>
            <dt>Última observación</dt>
            <dd>{formatCheckedAt(result.observedAt)}</dd>
          </div>
          <div>
            <dt>Ejecución de origen</dt>
            <dd>
              <Link href={`/admin/discovery/executions/${encodeURIComponent(result.executionId)}`}>
                {result.executionId}
              </Link>
            </dd>
          </div>
        </dl>
        <p className="admin-discovery-note">
          Un resultado de búsqueda no representa una actividad validada, un evento publicado ni una fuente aprobada.
        </p>
        {result.sourceId && result.status === "promoted" ? (
          <p>
            <Link href={`/admin/sources/${encodeURIComponent(result.sourceId)}`}>
              Ver fuente revisada: {result.sourceId} →
            </Link>
          </p>
        ) : (
          <button type="button" className="admin-secondary-button" disabled>
            Promover a fuente · requiere revisión y backend
          </button>
        )}
      </section>
    </main>
  );
}

export function DiscoveryExecutionDetail({
  snapshot,
  execution,
}: {
  snapshot: DiscoverySnapshot;
  execution: DiscoveryExecution;
}) {
  const query = snapshot.queries.find((item) => item.id === execution.queryId);
  const provider = snapshot.providers.find((item) => item.id === execution.providerId);
  const results = snapshot.results.filter((item) => item.executionId === execution.id);
  return (
    <main className="admin-page admin-discovery-page">
      <Link className="admin-back-link" href="/admin/discovery">
        ← Volver a consultas
      </Link>
      <DiscoveryHeader detail />
      <section className="admin-review-card">
        <h2>Ejecución {execution.id}</h2>
        <dl className="admin-definition-list">
          <div>
            <dt>Consulta</dt>
            <dd>{query?.name ?? execution.queryId}</dd>
          </div>
          <div>
            <dt>Proveedor</dt>
            <dd>{provider?.name ?? execution.providerId}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              {execution.state === "succeeded" ? "Completada" : execution.state === "failed" ? "Fallida" : "En cola"}
            </dd>
          </div>
          <div>
            <dt>Inicio</dt>
            <dd>{formatCheckedAt(execution.startedAt)}</dd>
          </div>
          <div>
            <dt>Observados</dt>
            <dd>{execution.observed}</dd>
          </div>
          <div>
            <dt>Nuevos</dt>
            <dd>{execution.newResults}</dd>
          </div>
          <div>
            <dt>Conocidos</dt>
            <dd>{execution.knownResults}</dd>
          </div>
          <div>
            <dt>Coste</dt>
            <dd>{execution.cost === null ? "Sin dato" : `${execution.cost} €`}</dd>
          </div>
          <div>
            <dt>Incidencia</dt>
            <dd>{execution.incident ?? "Sin incidencia observada"}</dd>
          </div>
        </dl>
      </section>
      <section className="admin-review-card admin-operation-related">
        <h2>Resultados de la ejecución</h2>
        {results.length === 0 ? (
          <p className="admin-muted-copy">No se observaron resultados nuevos.</p>
        ) : (
          <ul className="admin-operation-notes">
            {results.map((result) => (
              <li key={result.id}>
                <Link href={`/admin/discovery/results/${encodeURIComponent(result.id)}`}>{result.title}</Link>
                {" · "}
                {resultLabels[result.status]}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export function resolveDiscoveryTab(value: string | string[] | undefined): DiscoveryTab {
  const chosen = Array.isArray(value) ? value[0] : value;
  return tabs.some((tab) => tab.id === chosen) ? (chosen as DiscoveryTab) : "consultas";
}
