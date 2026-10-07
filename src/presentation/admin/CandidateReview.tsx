import Link from "next/link";

import {
  activityCategories,
  type AdminCandidate,
  type EditorialAction,
  type EventDetails,
  type FieldValue,
  type Organizer,
  type PriceDetails,
  type SourceConfig,
} from "@/domain/admin";
import { publicationBlockReasons } from "@/domain/adminValidation";
import {
  categoryLabels,
  displayField,
  formatCheckedAt,
  formatLocalDateTime,
  statusLabels,
  statusTone,
} from "./adminPresentation";
import {
  candidateReviewVersion,
  editablePriceKind,
  formatEditablePrice,
} from "./candidateReviewForm";
import {
  approveCandidateAction,
  blockCandidateAction,
  rejectCandidateAction,
  reprocessCandidateAction,
  requeryCandidateAction,
  saveCandidateAction,
} from "@/app/admin/candidates/[candidateId]/actions";

interface CandidateReviewProps {
  candidate: AdminCandidate;
  organizers: Organizer[];
  source: SourceConfig | null;
  result?: string;
  error?: string;
}

const terminalStatuses = new Set(["published", "rejected", "cancelled", "archived"]);

const priceKindLabels: Record<PriceDetails["kind"], string> = {
  free: "Gratis",
  fixed: "Precio fijo",
  trial: "Prueba",
  payment_variant: "Variantes de pago",
  transport_included: "Transporte incluido",
  membership: "Membresía",
  annual_membership: "Membresía anual",
  annual_insurance: "Seguro anual",
  donation: "Donación",
};

const actionLabels: Record<EditorialAction, string> = {
  captured: "Candidatura creada",
  normalized: "Datos normalizados",
  review_requested: "Revisión solicitada",
  approved: "Aprobada",
  published: "Publicada",
  corrected: "Datos finales corregidos",
  rejected: "Rechazada",
  blocked: "Bloqueada",
  requery_requested: "Reconsulta solicitada",
  reprocess_requested: "Reproceso solicitado",
  cancelled: "Cancelada",
  archived: "Archivada",
};

const publicationReasonLabels: Record<string, string> = {
  editorial_status_blocked: "La candidatura está bloqueada editorialmente.",
  open_blocking_conflict: "Existe un conflicto bloqueante abierto.",
  blocking_rule: "Existe una regla determinista bloqueante.",
  pending_match: "Hay una posible coincidencia o duplicado pendiente.",
  pending_essential_change: "Hay un cambio esencial pendiente de resolver.",
  missing_title: "Falta un título confirmado.",
  missing_category: "Falta una categoría confirmada.",
  missing_startLocal: "Falta fecha y hora confirmadas.",
  missing_timezone: "Falta la zona horaria.",
  missing_location: "Falta una ubicación confirmada.",
  missing_organizerId: "Falta un organizador confirmado.",
  missing_registrationUrl: "Falta un enlace de registro confirmado.",
  missing_individualAccess: "No se ha confirmado el acceso individual.",
  individual_access_not_confirmed: "El acceso individual no está confirmado.",
};

function knownString(field: FieldValue<string>): string {
  return field.state === "known" ? field.value : "";
}

function organizerName(field: EventDetails["organizerId"], organizers: Organizer[]): string {
  if (field.state === "unknown") return displayField(field);
  return organizers.find((organizer) => organizer.id === field.value)?.name ?? field.value;
}

function formatPrice(price: PriceDetails): string {
  if (price.kind === "free") return "Gratis";
  if (price.options.length === 0) return price.note ?? "Sin importe observado";

  return price.options
    .map((option) => {
      const amount = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(option.amount);
      return `${amount} €${option.paymentMethod ? ` ${option.paymentMethod}` : ""}`;
    })
    .join(" / ");
}

function dateRange(details: EventDetails): string {
  if (details.startLocal.state === "unknown") return displayField(details.startLocal);
  const start = formatLocalDateTime(details.startLocal.value);

  if (details.endLocal.state === "unknown") return start;
  return `${start} — ${formatLocalDateTime(details.endLocal.value)}`;
}

function languages(details: EventDetails): string {
  return displayField(details.languages, (value) => value.join(" · "));
}

function confidenceLabel(candidate: AdminCandidate): string {
  if (candidate.aiEvaluation.state === "not_run") return "IA no ejecutada";
  if (candidate.aiEvaluation.state === "failed") return "IA fallida";
  if (candidate.aiEvaluation.modelReportedConfidence.state === "unknown") return "Confianza no indicada";

  return `${Math.round(candidate.aiEvaluation.modelReportedConfidence.value * 100)}% confianza IA`;
}

function aiDescription(candidate: AdminCandidate): string {
  if (candidate.aiEvaluation.state === "not_run") return candidate.aiEvaluation.reason;
  if (candidate.aiEvaluation.state === "failed") return candidate.aiEvaluation.reason;

  const category =
    candidate.aiEvaluation.proposedCategory.state === "known"
      ? categoryLabels[candidate.aiEvaluation.proposedCategory.value]
      : "sin categoría propuesta";

  return `Resultado ${candidate.aiEvaluation.suitability}; ${category}. La confianza es declarada por el modelo y no verifica hechos.`;
}

function unknownHint(field: FieldValue<unknown>): string | null {
  return field.state === "unknown" ? displayField(field) : null;
}

export function CandidateReview({ candidate, organizers, source, result, error }: CandidateReviewProps) {
  const blockReasons = publicationBlockReasons(candidate);
  const terminal = terminalStatuses.has(candidate.editorialStatus);
  const canApprove = !terminal && blockReasons.length === 0;
  const sourceName = source?.name ?? candidate.sourceId;
  const openConflicts = candidate.conflicts.filter((conflict) => conflict.status === "open");
  const reviewVersion = candidateReviewVersion(candidate);

  const extractedRows = [
    ["Título", displayField(candidate.extracted.title)],
    ["Descripción", displayField(candidate.extracted.description)],
    ["Fecha", dateRange(candidate.extracted)],
    ["Zona horaria", displayField(candidate.extracted.timezone)],
    ["Ubicación", displayField(candidate.extracted.location)],
    ["Organizador", organizerName(candidate.extracted.organizerId, organizers)],
    ["Precio", displayField(candidate.extracted.price, formatPrice)],
    ["Idioma", languages(candidate.extracted)],
    ["Nivel", displayField(candidate.extracted.level)],
    ["Registro", displayField(candidate.extracted.registrationUrl)],
    [
      "Acceso individual",
      displayField(candidate.extracted.individualAccess, (value) => (value ? "Sí" : "No")),
    ],
    ["Fuente", sourceName],
  ];

  return (
    <main className="admin-page admin-review-page">
      <Link className="admin-back-link" href="/admin/candidates">
        ← Volver a candidaturas
      </Link>

      {result ? <div className="admin-action-notice admin-action-success">{result}</div> : null}
      {error ? <div className="admin-action-notice admin-action-error">{error}</div> : null}

      <header className="admin-review-header">
        <div>
          <div className="admin-review-heading-row">
            <h1>Revisar candidatura</h1>
            <span className={`admin-status-badge admin-status-${statusTone(candidate.editorialStatus)}`}>
              {statusLabels[candidate.editorialStatus]}
            </span>
          </div>
          <p>
            Actividad detectada automáticamente desde {sourceName}. Revisa información, evidencia y conflictos antes de
            publicar.
          </p>
        </div>

        <button
          className="admin-primary-button admin-review-publish"
          type="submit"
          form="candidate-final-form"
          formAction={approveCandidateAction}
          disabled={!canApprove}
          title={canApprove ? "Aprobar y publicar" : "Resuelve los bloqueos antes de publicar"}
        >
          Aprobar y publicar
        </button>
      </header>

      <h2 className="admin-review-event-title">{displayField(candidate.final.title)}</h2>

      {blockReasons.length > 0 ? (
        <section className="admin-publication-guards" aria-label="Bloqueos de publicación">
          <strong>Antes de publicar</strong>
          <ul>
            {blockReasons.map((reason) => (
              <li key={reason}>{publicationReasonLabels[reason] ?? reason}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="admin-review-primary-grid">
        <article className="admin-review-card">
          <div className="admin-review-card-heading">
            <h2>Datos extraídos (IA)</h2>
            <span className="admin-review-confidence">{confidenceLabel(candidate)}</span>
          </div>
          <dl className="admin-review-data-list">
            {extractedRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="admin-review-ai-note">{aiDescription(candidate)}</p>
        </article>

        <article className="admin-review-card">
          <div className="admin-review-card-heading">
            <h2>Datos finales (publicación)</h2>
            <span className="admin-review-editable">Editable</span>
          </div>

          <form id="candidate-final-form" className="admin-review-final-form">
            <input type="hidden" name="candidateId" value={candidate.id} />
            <input type="hidden" name="candidateVersion" value={reviewVersion} />

            <label>
              <span>Título</span>
              <input name="title" defaultValue={knownString(candidate.final.title)} disabled={terminal} />
              {unknownHint(candidate.final.title) ? <small>{unknownHint(candidate.final.title)}</small> : null}
            </label>

            <label>
              <span>Categoría</span>
              <select
                name="category"
                defaultValue={candidate.final.category.state === "known" ? candidate.final.category.value : ""}
                disabled={terminal}
              >
                <option value="">Sin dato</option>
                {activityCategories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabels[category]}
                  </option>
                ))}
              </select>
              {unknownHint(candidate.final.category) ? <small>{unknownHint(candidate.final.category)}</small> : null}
            </label>

            <label>
              <span>Descripción</span>
              <textarea
                name="description"
                rows={3}
                defaultValue={knownString(candidate.final.description)}
                disabled={terminal}
              />
              {unknownHint(candidate.final.description) ? (
                <small>{unknownHint(candidate.final.description)}</small>
              ) : null}
            </label>

            <label>
              <span>Fecha</span>
              <input
                type="datetime-local"
                name="startLocal"
                defaultValue={knownString(candidate.final.startLocal)}
                disabled={terminal}
              />
              {unknownHint(candidate.final.startLocal) ? (
                <small>{unknownHint(candidate.final.startLocal)}</small>
              ) : null}
            </label>

            <label>
              <span>Zona horaria</span>
              <select
                name="timezone"
                defaultValue={candidate.final.timezone.state === "known" ? candidate.final.timezone.value : ""}
                disabled={terminal}
              >
                <option value="">Sin dato</option>
                <option value="Europe/Madrid">Europe/Madrid</option>
              </select>
              {unknownHint(candidate.final.timezone) ? <small>{unknownHint(candidate.final.timezone)}</small> : null}
            </label>

            <label>
              <span>Ubicación</span>
              <input name="location" defaultValue={knownString(candidate.final.location)} disabled={terminal} />
              {unknownHint(candidate.final.location) ? <small>{unknownHint(candidate.final.location)}</small> : null}
            </label>

            <label>
              <span>Organizador</span>
              <select
                name="organizerId"
                defaultValue={candidate.final.organizerId.state === "known" ? candidate.final.organizerId.value : ""}
                disabled={terminal}
              >
                <option value="">Sin dato</option>
                {organizers.map((organizer) => (
                  <option key={organizer.id} value={organizer.id}>
                    {organizer.name}
                  </option>
                ))}
              </select>
              {unknownHint(candidate.final.organizerId) ? (
                <small>{unknownHint(candidate.final.organizerId)}</small>
              ) : null}
            </label>

            <label>
              <span>Tipo precio</span>
              <select name="priceKind" defaultValue={editablePriceKind(candidate.final.price)} disabled={terminal}>
                <option value="">Sin dato</option>
                {Object.entries(priceKindLabels).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Precio</span>
              <input
                name="price"
                defaultValue={formatEditablePrice(candidate.final.price)}
                placeholder='Ej. "8 € / 9 € Bizum" o "Gratis"'
                disabled={terminal}
              />
              {unknownHint(candidate.final.price) ? <small>{unknownHint(candidate.final.price)}</small> : null}
            </label>

            <label>
              <span>Nivel</span>
              <input name="level" defaultValue={knownString(candidate.final.level)} disabled={terminal} />
              {unknownHint(candidate.final.level) ? <small>{unknownHint(candidate.final.level)}</small> : null}
            </label>

            <label>
              <span>Idioma</span>
              <input
                name="languages"
                defaultValue={
                  candidate.final.languages.state === "known" ? candidate.final.languages.value.join(", ") : ""
                }
                placeholder="ES, EN"
                disabled={terminal}
              />
              {unknownHint(candidate.final.languages) ? <small>{unknownHint(candidate.final.languages)}</small> : null}
            </label>

            <label>
              <span>Registro</span>
              <input
                type="url"
                name="registrationUrl"
                defaultValue={knownString(candidate.final.registrationUrl)}
                placeholder="https://…"
                disabled={terminal}
              />
              {unknownHint(candidate.final.registrationUrl) ? (
                <small>{unknownHint(candidate.final.registrationUrl)}</small>
              ) : null}
            </label>

            <label>
              <span>Acceso individual</span>
              <select
                name="individualAccess"
                defaultValue={
                  candidate.final.individualAccess.state === "known"
                    ? String(candidate.final.individualAccess.value)
                    : ""
                }
                disabled={terminal}
              >
                <option value="">Sin dato</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
              {unknownHint(candidate.final.individualAccess) ? (
                <small>{unknownHint(candidate.final.individualAccess)}</small>
              ) : null}
            </label>

            {!terminal ? (
              <button
                className="admin-secondary-button admin-review-save"
                type="submit"
                formAction={saveCandidateAction}
              >
                Guardar cambios
              </button>
            ) : null}
          </form>
        </article>

        <article className="admin-review-card">
          <div className="admin-review-card-heading">
            <h2>Evidencias y fuente</h2>
          </div>
          <p className="admin-review-card-subtitle">Contenido original y datos de procedencia.</p>

          <div className="admin-evidence-list">
            {candidate.evidence.map((evidence) => (
              <section className="admin-evidence-item" key={evidence.id}>
                <strong>{sourceName}</strong>
                <p>{displayField(evidence.excerpt)}</p>
                <dl>
                  <div>
                    <dt>Capturada</dt>
                    <dd>{formatCheckedAt(evidence.capturedAt)}</dd>
                  </div>
                  <div>
                    <dt>Tipo</dt>
                    <dd>
                      {evidence.method} · {evidence.sourceRole}
                    </dd>
                  </div>
                  <div>
                    <dt>ID</dt>
                    <dd>{displayField(evidence.externalId)}</dd>
                  </div>
                </dl>
                <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">
                  Abrir fuente ↗
                </a>
              </section>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-review-secondary-grid">
        <article className="admin-review-card">
          <h2>Reglas e IA</h2>
          <ul className="admin-review-rule-list">
            {candidate.rules.map((rule) => (
              <li className={`admin-rule-${rule.outcome}`} key={rule.id}>
                <span aria-hidden="true">{rule.outcome === "pass" ? "✓" : rule.outcome === "warning" ? "△" : "!"}</span>
                <div>
                  <strong>{rule.code}</strong>
                  <small>{rule.reason}</small>
                </div>
              </li>
            ))}
          </ul>
          <div className="admin-ai-evaluation">
            <strong>Evaluación IA</strong>
            <p>{aiDescription(candidate)}</p>
          </div>
        </article>

        <article className="admin-review-card">
          <div className="admin-review-card-heading">
            <h2>Conflictos detectados</h2>
            <span className={openConflicts.length > 0 ? "admin-conflict-count" : "admin-review-editable"}>
              {openConflicts.length} abierto{openConflicts.length === 1 ? "" : "s"}
            </span>
          </div>

          {candidate.conflicts.length > 0 ? (
            <ul className="admin-review-conflicts">
              {candidate.conflicts.map((conflict) => (
                <li key={conflict.id}>
                  <div>
                    <strong>
                      {conflict.type} {conflict.blocking ? "· bloqueante" : ""}
                    </strong>
                    <span>{conflict.status === "open" ? "Abierto" : "Resuelto"}</span>
                  </div>
                  <p>{conflict.summary}</p>
                  {conflict.evidenceIds.length > 0 ? (
                    <small>Evidencias: {conflict.evidenceIds.join(", ")}</small>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-muted-copy">No hay conflictos registrados.</p>
          )}
        </article>

        <article className="admin-review-card">
          <h2>Historial</h2>
          <ol className="admin-review-history">
            {candidate.history.map((entry) => (
              <li key={entry.id}>
                <span>{formatCheckedAt(entry.at)}</span>
                <div>
                  <strong>{actionLabels[entry.action]}</strong>
                  <small>
                    {entry.actor.displayName}
                    {entry.reason.state === "known" ? ` · ${entry.reason.value}` : ""}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        </article>
      </section>

      {!terminal ? (
        <section className="admin-review-actions-card">
          <div>
            <h2>Decisiones editoriales</h2>
            <p>Rechazar y bloquear exigen un motivo y quedan registrados en el historial.</p>
          </div>

          <div className="admin-review-decision-grid">
            <details>
              <summary>Rechazar</summary>
              <form action={rejectCandidateAction}>
                <input type="hidden" name="candidateId" value={candidate.id} />
                <input type="hidden" name="candidateVersion" value={reviewVersion} />
                <label>
                  <span>Motivo del rechazo</span>
                  <textarea name="decisionReason" required rows={3} />
                </label>
                <button className="admin-danger-button" type="submit">
                  Confirmar rechazo
                </button>
              </form>
            </details>

            <details>
              <summary>Bloquear</summary>
              <form action={blockCandidateAction}>
                <input type="hidden" name="candidateId" value={candidate.id} />
                <input type="hidden" name="candidateVersion" value={reviewVersion} />
                <label>
                  <span>Motivo del bloqueo</span>
                  <textarea name="decisionReason" required rows={3} />
                </label>
                <button className="admin-warning-button" type="submit">
                  Confirmar bloqueo
                </button>
              </form>
            </details>

            <div className="admin-engine-actions">
              <form action={requeryCandidateAction}>
                <input type="hidden" name="candidateId" value={candidate.id} />
                <input type="hidden" name="candidateVersion" value={reviewVersion} />
                <button className="admin-secondary-button" type="submit">
                  Solicitar reconsulta
                </button>
              </form>
              <form action={reprocessCandidateAction}>
                <input type="hidden" name="candidateId" value={candidate.id} />
                <input type="hidden" name="candidateVersion" value={reviewVersion} />
                <button className="admin-secondary-button" type="submit">
                  Solicitar reproceso
                </button>
              </form>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
