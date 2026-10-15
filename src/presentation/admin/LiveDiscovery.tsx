import Link from "next/link";
import { DiscoveryReviewActions } from "./DiscoveryReviewActions";
import { reviewAvailability, reviewReasonLabel, type DiscoveryReviewAccess } from "./discoveryReview";

import {
  activeSourceQueueView,
  classificationLabel,
  classificationReasonLabel,
  classificationTone,
  reviewStatusLabel,
  reviewStatusTone,
  sourceCandidateGuidance,
  sourceQueueHref,
  sourceQueueViews,
} from "./sourceReviewQueue";

import type {
  DiscoveryCandidate,
  DiscoveryCandidateDetail,
  DiscoveryExecution,
  DiscoveryObservation,
  DiscoveryPage,
  DiscoveryProvider,
  DiscoveryQuery,
  DiscoveryReview,
  ReadErrorCode,
} from "@/integrations/discovery/readApi";

export type LiveDiscoveryTab = "consultas" | "proveedores" | "resultados";

const tabs: LiveDiscoveryTab[] = ["consultas", "proveedores", "resultados"];

function show(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "Sin dato" : String(value);
}

function date(value: string | null | undefined) {
  if (!value) return "Sin dato";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Sin dato" : parsed.toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
}

function External({ url }: { url: string }) {
  let safe: string | null = null;
  try {
    const candidate = new URL(url);
    if (candidate.protocol === "https:" || candidate.protocol === "http:") safe = candidate.href;
  } catch {
    // Unknown URL remains plain text, never executable HTML.
  }
  return safe ? (
    <a href={safe} rel="noopener noreferrer" target="_blank">
      {url}
    </a>
  ) : (
    <span>{url}</span>
  );
}

function Header({ reviewAccess }: { reviewAccess?: DiscoveryReviewAccess }) {
  return (
    <header className="admin-page-header">
      <h1>Descubrimiento</h1>
      <p>Fuentes candidatas y observaciones; no son actividades publicadas.</p>
      <p className="admin-discovery-note">
        Datos reales de STAGING ·{" "}
        {reviewAccess?.rejectionEnabled || reviewAccess?.promotionEnabled
          ? "decisiones auditadas según permisos"
          : "lectura privada · sin acciones de escritura"}
      </p>
    </header>
  );
}

export function LiveDiscoveryFailure({ code }: { code: ReadErrorCode }) {
  const descriptions: Record<ReadErrorCode, string> = {
    UNAUTHENTICATED: "La sesión no está verificada para consultar el motor.",
    FORBIDDEN: "La cuenta no tiene permisos vigentes de lectura.",
    NOT_FOUND: "El elemento solicitado no existe.",
    INVALID_REQUEST: "El identificador o filtro es incorrecto.",
    READ_CONFLICT: "La lectura no puede completarse ahora.",
    READ_UNAVAILABLE: "El motor no está disponible.",
    NOT_CONFIGURED: "La conexión STAGING aún no está configurada o autorizada.",
    INCOMPATIBLE_CONTRACT: "La respuesta recibida no cumple el contrato v1.",
  };
  return (
    <main className="admin-page admin-discovery-page">
      <Header />
      <section className="admin-empty-state" role="alert">
        <strong>{descriptions[code]}</strong>
        <p>Referencia {code}. No se muestra información simulada.</p>
        <Link href="/admin/discovery">Volver a Descubrimiento</Link>
      </section>
    </main>
  );
}

export function liveHref(tab: LiveDiscoveryTab, params: Record<string, string | undefined>, next?: string | null) {
  const url = new URLSearchParams({ tab });
  Object.entries(params).forEach(([key, value]) => {
    if (value && key !== "tab" && key !== "cursor") url.set(key, value);
  });
  if (next) url.set("cursor", next);
  return "/admin/discovery?" + url.toString();
}

export function candidatePageHref(
  candidateId: string,
  section: "observations" | "reviews",
  cursor: string,
  siblingCursor?: string,
): string {
  const params = new URLSearchParams();
  const cursorKey = section === "observations" ? "observationsCursor" : "reviewsCursor";
  const siblingKey = section === "observations" ? "reviewsCursor" : "observationsCursor";
  params.set(cursorKey, cursor);
  if (siblingCursor) params.set(siblingKey, siblingCursor);
  return "/admin/discovery/results/" + encodeURIComponent(candidateId) + "?" + params.toString();
}

function QueueNavigation({ params }: { params: Record<string, string | undefined> }) {
  const selected = activeSourceQueueView(params);
  return (
    <nav className="admin-discovery-queue-nav" aria-label="Filtrar cola de revisión">
      {sourceQueueViews.map((view) => (
        <Link
          key={view.id}
          href={sourceQueueHref(view.id, params)}
          className={"admin-discovery-queue-link" + (selected === view.id ? " admin-discovery-queue-link-active" : "")}
          aria-current={selected === view.id ? "page" : undefined}
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );
}

function Filters({ params }: { params: Record<string, string | undefined> }) {
  return (
    <form action="/admin/discovery" method="get" className="admin-discovery-filter-form">
      <input type="hidden" name="tab" value="resultados" />
      <label>
        Estado de revisión
        <select name="reviewStatus" defaultValue={params.reviewStatus ?? ""}>
          <option value="">Todos</option>
          <option value="PENDING_REVIEW">Pendientes</option>
          <option value="APPROVED">Aprobadas</option>
          <option value="REJECTED">Rechazadas</option>
        </select>
      </label>
      <label>
        Compatibilidad
        <select name="classificationKind" defaultValue={params.classificationKind ?? ""}>
          <option value="">Todas</option>
          <option value="SUPPORTED_ADAPTER_CANDIDATE">Compatible</option>
          <option value="UNSUPPORTED_REVIEWABLE">Requiere adaptador</option>
          <option value="AMBIGUOUS_REVIEW_REQUIRED">Ambigua</option>
          <option value="KNOWN_SOURCE">Fuente conocida</option>
          <option value="UNSAFE_OR_INVALID">No apta</option>
          <option value="NON_SOURCE_RESULT">No es fuente</option>
        </select>
      </label>
      <label>
        Proveedor
        <input name="providerKey" defaultValue={params.providerKey ?? ""} placeholder="serpapi" />
      </label>
      <label>
        Consulta UUID
        <input name="queryId" defaultValue={params.queryId ?? ""} />
      </label>
      <label>
        Ejecución UUID
        <input name="executionId" defaultValue={params.executionId ?? ""} />
      </label>
      <label>
        Buscar por URL o título
        <input name="search" maxLength={200} defaultValue={params.search ?? ""} />
      </label>
      <div className="admin-discovery-filter-actions">
        <button type="submit" className="admin-secondary-button">
          Aplicar filtros
        </button>
        <Link href="/admin/discovery?tab=resultados">Limpiar</Link>
      </div>
    </form>
  );
}
export function readQueryParams(input: Record<string, string | string[] | undefined>) {
  const keys = [
    "tab",
    "cursor",
    "reviewStatus",
    "classificationKind",
    "providerKey",
    "queryId",
    "executionId",
    "search",
  ] as const;
  return Object.fromEntries(
    keys.map((key) => [key, typeof input[key] === "string" ? input[key] : undefined]),
  ) as Record<string, string | undefined>;
}

export function LiveDiscoveryOverview({
  tab,
  data,
  params,
  reviewAccess,
}: {
  tab: LiveDiscoveryTab;
  data: DiscoveryPage<DiscoveryCandidate> | DiscoveryPage<DiscoveryQuery> | DiscoveryPage<DiscoveryProvider>;
  params: Record<string, string | undefined>;
  reviewAccess?: DiscoveryReviewAccess;
}) {
  return (
    <main className="admin-page admin-discovery-page">
      <Header reviewAccess={reviewAccess} />
      <nav className="admin-tabs" aria-label="Apartados de Descubrimiento">
        {tabs.map((item) => (
          <Link
            key={item}
            href={liveHref(item, {})}
            className={tab === item ? "admin-tab admin-tab-active" : "admin-tab"}
            aria-current={tab === item ? "page" : undefined}
          >
            {item === "resultados" ? "Resultados" : item === "consultas" ? "Consultas" : "Proveedores"}
          </Link>
        ))}
      </nav>
      {tab === "resultados" ? (
        <section className="admin-discovery-review-queue" aria-label="Cola de revisión de fuentes">
          <h2>Candidatos a fuentes</h2>
          <p className="admin-muted-copy">
            Filtros sobre el motor privado. Los resultados son fuentes por evaluar, no eventos ni publicaciones.
          </p>
          <QueueNavigation params={params} />
          <details
            className="admin-discovery-advanced"
            open={Boolean(
              params.providerKey ||
              params.queryId ||
              params.executionId ||
              params.search ||
              activeSourceQueueView(params) === null,
            )}
          >
            <summary>Filtros avanzados</summary>
            <Filters params={params} />
          </details>
        </section>
      ) : null}
      {data.items.length === 0 ? (
        <section className="admin-empty-state">
          <strong>
            {tab === "resultados" ? "No hay fuentes que coincidan con los filtros" : "No hay datos en esta página"}
          </strong>
          <p>Prueba otro filtro o vuelve a la primera página. No se muestran resultados simulados.</p>
        </section>
      ) : (
        <section className="admin-table-card">
          <div className="admin-table-scroll">
            <table className="admin-activities-table">
              {tab === "resultados" ? (
                <>
                  <thead>
                    <tr>
                      <th>Fuente candidata</th>
                      <th>Revisión</th>
                      <th>Compatibilidad</th>
                      <th>Procedencia</th>
                      <th>Última observación</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.items as DiscoveryCandidate[]).map((candidate) => (
                      <tr key={candidate.id}>
                        <td className="admin-table-title">
                          <Link href={"/admin/discovery/results/" + encodeURIComponent(candidate.id)}>
                            {candidate.latestObservation?.title || candidate.canonicalUrl}
                          </Link>
                          <small>{candidate.canonicalUrl}</small>
                          {candidate.latestObservation?.snippet ? (
                            <small className="admin-discovery-snippet">{candidate.latestObservation.snippet}</small>
                          ) : null}
                        </td>
                        <td>
                          <span
                            className={
                              "admin-discovery-status admin-discovery-status-" +
                              reviewStatusTone(candidate.reviewStatus)
                            }
                          >
                            {reviewStatusLabel(candidate.reviewStatus)}
                          </span>
                          {candidate.linkedSourceId ? (
                            <small className="admin-discovery-cell-detail">
                              Vinculada a B2 · {candidate.source?.status ?? "estado desconocido"} ·{" "}
                              {candidate.source?.enabled === false
                                ? "deshabilitada"
                                : candidate.source?.enabled === true
                                  ? "habilitada"
                                  : "habilitación desconocida"}
                            </small>
                          ) : candidate.reviewStatus === "APPROVED" ? (
                            <small className="admin-discovery-cell-detail">Sin fuente B2 vinculada</small>
                          ) : null}
                        </td>
                        <td>
                          <span
                            className={
                              "admin-discovery-status admin-discovery-status-" +
                              classificationTone(candidate.classification?.kind)
                            }
                          >
                            {classificationLabel(candidate.classification?.kind)}
                          </span>
                          {candidate.classification?.reason ? (
                            <small className="admin-discovery-cell-detail">
                              {classificationReasonLabel(candidate.classification.reason)}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          {show(candidate.latestObservation?.providerKey)}
                          <small className="admin-discovery-cell-detail">
                            {candidate.observationCount} observación(es)
                          </small>
                        </td>
                        <td>{date(candidate.lastObservedAt)}</td>
                        <td>
                          <Link
                            className="admin-discovery-inspect-link"
                            href={"/admin/discovery/results/" + encodeURIComponent(candidate.id)}
                          >
                            Inspeccionar →
                          </Link>
                          {reviewAvailability(candidate, reviewAccess).reject ? (
                            <small className="admin-discovery-cell-detail">
                              Rechazo con motivo disponible en el detalle
                            </small>
                          ) : null}
                          {reviewAvailability(candidate, reviewAccess).promote ? (
                            <small className="admin-discovery-cell-detail">Promoción B2 disponible en el detalle</small>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : tab === "consultas" ? (
                <>
                  <thead>
                    <tr>
                      <th>Consulta</th>
                      <th>Proveedor</th>
                      <th>Ámbito</th>
                      <th>Idioma</th>
                      <th>Programación</th>
                      <th>Última ejecución</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.items as DiscoveryQuery[]).map((q) => (
                      <tr key={q.id}>
                        <td className="admin-table-title">
                          <strong>{q.expression}</strong>
                          <small>{q.id}</small>
                        </td>
                        <td>{q.providerKey}</td>
                        <td>
                          {show(q.geographicScope)} · {show(q.activityContext)}
                        </td>
                        <td>{show(q.localeHint)}</td>
                        <td>{show(q.scheduleExpression)}</td>
                        <td>
                          {q.lastExecutionId ? (
                            <Link href={"/admin/discovery/executions/" + encodeURIComponent(q.lastExecutionId)}>
                              {q.lastExecutionId}
                            </Link>
                          ) : (
                            "Sin ejecuciones"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <thead>
                    <tr>
                      <th>Proveedor</th>
                      <th>Habilitación</th>
                      <th>Solicitudes / ejecución</th>
                      <th>Límite diario local</th>
                      <th>Límite mensual local</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.items as DiscoveryProvider[]).map((p) => (
                      <tr key={p.providerKey}>
                        <td className="admin-table-title">
                          <strong>{p.displayName}</strong>
                          <small>{p.providerKey}</small>
                        </td>
                        <td>{p.enabled ? "Habilitado (credenciales no verificadas)" : "Deshabilitado"}</td>
                        <td>{p.maxRequestsPerExecution}</td>
                        <td>{show(p.dailyRequestCap)}</td>
                        <td>{show(p.monthlyRequestCap)}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </div>
        </section>
      )}
      {tab === "resultados" ? (
        <p className="admin-discovery-page-count">
          Mostrando {data.items.length} candidato(s) en esta página; no es un contador global.
        </p>
      ) : null}
      <p className="admin-muted-copy">
        <Link href={liveHref(tab, params)}>Primera página</Link>
        {data.nextCursor ? (
          <>
            {" "}
            · <Link href={liveHref(tab, params, data.nextCursor)}>Siguiente página →</Link>
          </>
        ) : null}
      </p>
      <p className="admin-muted-copy">
        Las decisiones se confirman en el detalle según permisos y habilitación de escritura. Conservar como pendiente
        no registra una aprobación ni crea una fuente B2.
      </p>
    </main>
  );
}

export function LiveCandidateDetail({
  detail,
  observations,
  reviews,
  cursors,
  reviewAccess,
}: {
  detail: DiscoveryCandidateDetail;
  observations: DiscoveryPage<DiscoveryObservation>;
  reviews: DiscoveryPage<DiscoveryReview>;
  cursors: { observationsCursor?: string; reviewsCursor?: string };
  reviewAccess?: DiscoveryReviewAccess;
}) {
  const c = detail.candidate;
  const o = c.latestObservation;
  return (
    <main className="admin-page admin-discovery-page">
      <Link className="admin-back-link" href="/admin/discovery?tab=resultados">
        ← Volver a resultados
      </Link>
      <Header reviewAccess={reviewAccess} />
      <section className="admin-review-card">
        <p className="admin-discovery-detail-eyebrow">Inspección de fuente candidata</p>
        <h2>{show(o?.title) === "Sin dato" ? c.canonicalUrl : show(o?.title)}</h2>
        <div className="admin-discovery-detail-status">
          <span className={"admin-discovery-status admin-discovery-status-" + reviewStatusTone(c.reviewStatus)}>
            {reviewStatusLabel(c.reviewStatus)}
          </span>
          <span
            className={"admin-discovery-status admin-discovery-status-" + classificationTone(c.classification?.kind)}
          >
            {classificationLabel(c.classification?.kind)}
          </span>
        </div>
        <p className="admin-discovery-guidance">{sourceCandidateGuidance(c)}</p>
        <dl className="admin-definition-list">
          <div>
            <dt>Candidato UUID</dt>
            <dd>{c.id}</dd>
          </div>
          <div>
            <dt>URL canónica</dt>
            <dd>
              <External url={c.canonicalUrl} />
            </dd>
          </div>
          <div>
            <dt>URL observada</dt>
            <dd>{o ? <External url={o.originalUrl} /> : "Sin dato"}</dd>
          </div>
          <div>
            <dt>Descripción observada</dt>
            <dd>{show(o?.snippet)}</dd>
          </div>
          <div>
            <dt>Primera observación</dt>
            <dd>{date(c.firstObservedAt)}</dd>
          </div>
          <div>
            <dt>Revisión</dt>
            <dd>
              {reviewStatusLabel(c.reviewStatus)} ({c.reviewStatus})
            </dd>
          </div>
          <div>
            <dt>Clasificación</dt>
            <dd>
              {classificationLabel(c.classification?.kind)} ({show(c.classification?.kind)})
            </dd>
          </div>
          <div>
            <dt>Motivo</dt>
            <dd>{classificationReasonLabel(c.classification?.reason)}</dd>
          </div>
          <div>
            <dt>Familia de fuente</dt>
            <dd>{show(c.classification?.sourceFamily)}</dd>
          </div>
          <div>
            <dt>Adaptador propuesto</dt>
            <dd>{show(c.classification?.proposedAdapterKey)}</dd>
          </div>
          <div>
            <dt>Observaciones totales</dt>
            <dd>{c.observationCount}</dd>
          </div>
          <div>
            <dt>Última observación</dt>
            <dd>{date(c.lastObservedAt)}</dd>
          </div>
          <div>
            <dt>Consulta de origen</dt>
            <dd>{show(o?.queryId)}</dd>
          </div>
          <div>
            <dt>Ejecución</dt>
            <dd>
              {o ? (
                <Link href={"/admin/discovery/executions/" + encodeURIComponent(o.executionId)}>{o.executionId}</Link>
              ) : (
                "Sin dato"
              )}
            </dd>
          </div>
          <div>
            <dt>Fuente B2 vinculada</dt>
            <dd>{c.linkedSourceId ?? "Sin fuente vinculada"}</dd>
          </div>
          <div>
            <dt>Estado de la fuente B2 vinculada</dt>
            <dd>
              {c.source
                ? c.source.status +
                  " · " +
                  c.source.adapterKey +
                  " · " +
                  (c.source.enabled === false
                    ? "deshabilitada"
                    : c.source.enabled === true
                      ? "habilitada"
                      : "habilitación desconocida")
                : "Sin fuente vinculada"}
            </dd>
          </div>
          <div>
            <dt>Última decisión registrada</dt>
            <dd>
              {c.latestReview
                ? reviewStatusLabel(c.latestReview.decision) +
                  " · " +
                  reviewReasonLabel(c.latestReview.reasonCode) +
                  " · " +
                  date(c.latestReview.reviewedAt) +
                  " · actor " +
                  c.latestReview.reviewerRef
                : "Sin decisiones"}
            </dd>
          </div>
          <div>
            <dt>Promoción auditada</dt>
            <dd>{detail.promotion ? detail.promotion.sourceId : "No consta"}</dd>
          </div>
        </dl>
        <p className="admin-discovery-note">No es un evento, una reserva ni una publicación.</p>
      </section>
      <DiscoveryReviewActions candidate={c} access={reviewAccess} />
      <section className="admin-review-card admin-operation-related">
        <h2>Observaciones y procedencia</h2>
        <ul className="admin-operation-notes">
          {observations.items.map((item) => (
            <li key={item.id}>
              {date(item.observedAt)} · {item.providerKey} · {show(item.title)} · consulta {item.queryId} ·{" "}
              <Link href={"/admin/discovery/executions/" + encodeURIComponent(item.executionId)}>Ejecución</Link> ·{" "}
              <External url={item.originalUrl} />
            </li>
          ))}
        </ul>
        {observations.nextCursor ? (
          <Link href={candidatePageHref(c.id, "observations", observations.nextCursor, cursors.reviewsCursor)}>
            Siguiente página →
          </Link>
        ) : null}
      </section>
      <section className="admin-review-card admin-operation-related">
        <h2>Revisiones</h2>
        {reviews.items.length === 0 ? (
          "Sin revisiones"
        ) : (
          <ul className="admin-operation-notes">
            {reviews.items.map((r) => (
              <li key={r.id}>
                {reviewStatusLabel(r.decision)} · {reviewReasonLabel(r.reasonCode)} · {date(r.reviewedAt)} · actor{" "}
                {r.reviewerRef}
              </li>
            ))}
          </ul>
        )}
        {reviews.nextCursor ? (
          <Link href={candidatePageHref(c.id, "reviews", reviews.nextCursor, cursors.observationsCursor)}>
            Siguiente página →
          </Link>
        ) : null}
      </section>
    </main>
  );
}

export function LiveExecutionDetail({
  execution: e,
  observations,
}: {
  execution: DiscoveryExecution;
  observations: DiscoveryPage<DiscoveryObservation>;
}) {
  return (
    <main className="admin-page admin-discovery-page">
      <Link className="admin-back-link" href="/admin/discovery?tab=consultas">
        ← Volver a consultas
      </Link>
      <Header />
      <section className="admin-review-card">
        <h2>Ejecución {e.id}</h2>
        <dl className="admin-definition-list">
          <div>
            <dt>Consulta</dt>
            <dd>{e.queryId}</dd>
          </div>
          <div>
            <dt>Proveedor</dt>
            <dd>{e.providerKey}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{e.status}</dd>
          </div>
          <div>
            <dt>Envío al proveedor</dt>
            <dd>{show(e.submissionState)}</dd>
          </div>
          <div>
            <dt>Recuperación</dt>
            <dd>{show(e.recoveryState)}</dd>
          </div>
          <div>
            <dt>Inicio</dt>
            <dd>{date(e.startedAt)}</dd>
          </div>
          <div>
            <dt>Observados</dt>
            <dd>{e.observed}</dd>
          </div>
          <div>
            <dt>Candidatos nuevos</dt>
            <dd>{e.candidatesCreated}</dd>
          </div>
          <div>
            <dt>Fuentes conocidas</dt>
            <dd>{show(e.knownSources)}</dd>
          </div>
          <div>
            <dt>Coste</dt>
            <dd>{e.cost === null ? "Sin dato" : e.cost + " €"}</dd>
          </div>
          <div>
            <dt>Incidencia</dt>
            <dd>{show(e.failureCode)}</dd>
          </div>
        </dl>
      </section>
      <section className="admin-review-card admin-operation-related">
        <h2>Observaciones de esta ejecución</h2>
        <ul className="admin-operation-notes">
          {observations.items.map((o) => (
            <li key={o.id}>
              {show(o.title)} · {date(o.observedAt)} · {o.providerKey} ·{" "}
              {o.candidateId ? (
                <Link href={"/admin/discovery/results/" + encodeURIComponent(o.candidateId)}>
                  Candidato {o.candidateId}
                </Link>
              ) : (
                <span>Fuente conocida {o.knownSourceId}</span>
              )}{" "}
              · <External url={o.originalUrl} />
            </li>
          ))}
        </ul>
        {observations.nextCursor ? (
          <Link
            href={
              "/admin/discovery/executions/" +
              encodeURIComponent(e.id) +
              "?cursor=" +
              encodeURIComponent(observations.nextCursor)
            }
          >
            Siguiente página →
          </Link>
        ) : null}
      </section>
    </main>
  );
}
