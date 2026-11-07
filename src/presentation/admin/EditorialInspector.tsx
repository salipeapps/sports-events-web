"use client";

import { isRegistrationDestination, isSafeRegistrationUrl, type RegistrationMethod } from "@/domain/registration";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { AdminRole } from "@/domain/adminAccess";
import type { EditorialInspection } from "@/domain/editorial";
import {
  buildCorrection,
  canSubmitAction,
  commandAction,
  describeLocation,
  isCorrectionAction,
  type CorrectionChange,
  type EditorialAction,
} from "./editorialCorrection";

type Action = EditorialAction;
const errors: Record<string, string> = {
  NOT_CONFIGURED: "El circuito editorial todavía no está habilitado en este entorno.",
  INVALID_REQUEST: "La petición no es válida.",
  UNAUTHENTICATED: "La sesión ha caducado. Inicia sesión de nuevo.",
  FORBIDDEN: "No tienes permiso para realizar esta operación.",
  NOT_FOUND: "No se encuentra esta candidatura.",
  CONFLICT: "El candidato ha cambiado. Actualiza sus datos antes de decidir.",
  CONFLICT_REFRESHED: "El candidato ha cambiado. Se han recargado sus datos: revísalos y confirma de nuevo.",
  // Engine answers 409 for every unmet approval precondition, not only for a concurrent change.
  APPROVE_CONFLICT_REFRESHED:
    "El Engine no ha aceptado la aprobación: el candidato ha cambiado o todavía no cumple las condiciones para publicarse (inscripción autorizada por el organizador, alguna ubicación verificada, horario futuro y sin conflictos ni avisos pendientes). Se han recargado sus datos: revísalos antes de confirmar de nuevo.",
  APPROVE_WITHOUT_REGISTRATION:
    "Este candidato no tiene una inscripción con evidencia del organizador. Corrige la inscripción antes de aprobar.",
  UNPRESERVABLE:
    "Este candidato conserva un enlace de inscripción que no se puede reenviar con exactitud. Solicita la corrección al operador.",
  RATE_LIMITED: "Demasiadas solicitudes. Inténtalo más tarde.",
  WRITE_UNAVAILABLE: "No se ha podido confirmar la operación. Puedes reintentar con la misma clave.",
  INCOMPATIBLE_CONTRACT: "El servicio editorial ha devuelto una respuesta incompatible.",
};
const categories = ["yoga", "running", "hiking", "cycling", "fitness", "swimming", "dance", "other"];
const categoryLabels: Record<string, string> = {
  yoga: "Yoga",
  running: "Running",
  hiking: "Senderismo",
  cycling: "Ciclismo",
  fitness: "Fitness",
  swimming: "Natación",
  dance: "Baile",
  other: "Otra",
};
const priceLabels: Record<string, string> = {
  FREE: "Gratis",
  FIXED: "Precio fijo",
  DONATION: "Donación",
  TRIAL: "Prueba",
  EARLY_BIRD: "Inscripción anticipada",
  FROM: "Desde",
  MEMBERSHIP: "Cuota de socio",
  SUBSCRIPTION: "Suscripción",
};
const scopeLabels: Record<string, string> = {
  PER_SESSION: "por sesión",
  FIRST_SESSION_ONLY: "primera sesión",
  PER_MONTH: "al mes",
  PER_YEAR: "al año",
  MEMBERSHIP: "membresía",
  TRANSPORT: "transporte",
  OTHER: "consulta las condiciones",
};

export function EditorialInspector({ candidateId, role }: { candidateId: string; role: AdminRole }) {
  const [candidate, setCandidate] = useState<EditorialInspection | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action>("REJECT");
  const [reason, setReason] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [category, setCategory] = useState("");
  const [organizerId, setOrganizerId] = useState("");
  const [registrationUri, setRegistrationUri] = useState("");
  const [registrationMethod, setRegistrationMethod] = useState<RegistrationMethod | "">("");
  const [destination, setDestination] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [organizerPublished, setOrganizerPublished] = useState(false);
  const [registrationVerified, setRegistrationVerified] = useState(false);
  // Indexes of the locations the admin has explicitly checked against the official source.
  const [verifiedLocations, setVerifiedLocations] = useState<number[]>([]);
  // Do not change the idempotency key for an uncertain outcome and unchanged payload.
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch("/api/internal/editorial/candidates/" + candidateId, {
        cache: "no-store",
        signal,
        credentials: "same-origin",
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) throw new Error(errors[String(data.code)] ?? "No se ha podido inspeccionar el candidato.");
      return data as unknown as EditorialInspection;
    },
    [candidateId],
  );

  // Resynchronises every form field with a fresh read so no stale intent survives a new version.
  const syncForm = useCallback((value: EditorialInspection) => {
    setCandidate(value);
    setOrganizerId(value.data.organizerId ?? "");
    setRegistrationUri(value.correctionBase?.registrationUri ?? value.data.registrationUri ?? "");
    setRegistrationMethod(value.data.registration?.method ?? "");
    setDestination(value.data.registration?.destination ?? "");
    setEvidenceUrl(value.data.registration?.evidenceUrl ?? "");
    setOrganizerPublished(value.data.registration?.organizerPublished ?? false);
    setVerificationUrl(value.data.registration?.evidenceUrl ?? "");
    setRegistrationVerified(false);
    setVerifiedLocations([]);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          syncForm(value);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Lectura no disponible.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh, syncForm]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!candidate || busy || !reason.trim()) return;
    if (!canSubmitAction(role, action)) return;
    const payload: Record<string, unknown> = {
      action: commandAction(action),
      expectedVersion: candidate.candidateVersion,
      expectedRevision: candidate.revision,
      reason: reason.trim(),
    };
    if (action === "APPROVE") {
      if (candidate.registrationSupported) {
        const registration = candidate.data.registration;
        if (!registration) {
          setError(errors.APPROVE_WITHOUT_REGISTRATION);
          return;
        }
        if (!registrationVerified || !registration.organizerPublished) return;
        payload.registrationVerified = true;
        // Engine only accepts the exact audited evidence URI; any other value is rejected as a conflict.
        payload.verificationUrl = registration.evidenceUrl;
      } else {
        payload.verificationUrl = verificationUrl;
      }
      payload.category = category;
    }
    if (isCorrectionAction(action)) {
      if (!candidate.correctionBase) {
        setError(errors.UNPRESERVABLE);
        return;
      }
      let change: CorrectionChange;
      if (action === "CORRECT_ORGANIZER") {
        if (!organizerId) return;
        if (organizerId === candidate.correctionBase.organizerId) {
          setError("El organizador seleccionado ya está asociado a este candidato.");
          return;
        }
        change = { kind: "ORGANIZER", organizerId };
      } else if (action === "CORRECT_REGISTRATION") {
        if (candidate.registrationSupported) {
          if (!isRegistrationDestination(registrationMethod, destination) || !isSafeRegistrationUrl(evidenceUrl)) {
            setError("Revisa el canal, destino y URL de evidencia pública.");
            return;
          }
          change = {
            kind: "REGISTRATION",
            registration: { method: registrationMethod, destination, evidenceUrl, organizerPublished },
          };
        } else {
          if (!registrationUri) return;
          change = { kind: "REGISTRATION_URI", registrationUri };
        }
      } else {
        if (verifiedLocations.length === 0) {
          setError("Marca expresamente cada ubicación que hayas comprobado.");
          return;
        }
        change = { kind: "LOCATIONS", verifiedIndexes: verifiedLocations };
      }
      // Start from the exact Engine snapshot, never from the display-normalised data.
      const correction = buildCorrection(candidate.correctionBase, change);
      if (!correction) {
        setError("No hay cambios confirmados que guardar.");
        return;
      }
      payload.correction = correction;
    }
    const fingerprint = JSON.stringify(payload);
    if (!pending.current || pending.current.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    const submittedKey = pending.current.key;
    setBusy(true);
    setError("");
    setResult("");
    try {
      const response = await fetch("/api/internal/editorial/candidates/" + candidateId + "/commands", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Idempotency-Key": submittedKey },
        body: fingerprint,
      });
      const value = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const code = String(value.code ?? "");
        if (["INVALID_REQUEST", "FORBIDDEN", "NOT_FOUND", "CONFLICT"].includes(code)) pending.current = null;
        if (code === "CONFLICT") {
          // Reload version, revision and data before allowing another intent; a retry would only conflict again.
          const fresh = await refresh().catch(() => null);
          if (fresh) {
            syncForm(fresh);
            throw new Error(
              payload.action === "APPROVE" ? errors.APPROVE_CONFLICT_REFRESHED : errors.CONFLICT_REFRESHED,
            );
          }
        }
        throw new Error(errors[code] ?? "Error al enviar la decisión.");
      }
      // A successful receipt is mandatory; never infer success from a timeout or 2xx without a receipt.
      if (value.commandKey !== submittedKey || !Array.isArray(value.candidateIds))
        throw new Error(errors.INCOMPATIBLE_CONTRACT);
      pending.current = null;
      setResult("Decisión confirmada por Engine: " + String(value.status));
      syncForm(await refresh());
      setReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : errors.WRITE_UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>Inspección editorial B1</h1>
      <p>
        <Link href="/admin/editorial">Buscar otro candidato</Link>
      </p>
      <p>Las decisiones se ejecutan exclusivamente por el servidor Java. No se muestran datos de prueba como reales.</p>
      {loading ? <p role="status">Consultando candidatura…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {result ? <p role="status">{result}</p> : null}
      {candidate && (
        <>
          <dl>
            <dt>Actividad</dt>
            <dd>{candidate.title}</dd>
            <dt>Estado</dt>
            <dd>{candidate.status}</dd>
            <dt>Publicación</dt>
            <dd>{candidate.publicationStatus ?? "Sin publicar"}</dd>
            <dt>Organizador</dt>
            <dd>{candidate.organizerName ?? "Por confirmar"}</dd>
            <dt>Fecha y hora (Europe/Madrid)</dt>
            <dd>{candidate.data.schedule?.localStart ?? candidate.data.calendarDates?.startDate ?? "Por confirmar"}</dd>
            <dt>Finalización</dt>
            <dd>{candidate.data.schedule?.localEnd ?? candidate.data.calendarDates?.endDate ?? "Por confirmar"}</dd>
            <dt>Ubicación</dt>
            <dd>
              {candidate.data.locations.length === 0
                ? "Por confirmar"
                : candidate.data.locations.map((location, index) => (
                    <p key={index}>
                      {describeLocation(location)}
                      {location.latitude !== null && ` (${location.latitude}, ${location.longitude})`}
                      {location.verified ? " · Verificada" : " · Pendiente de verificar"}
                    </p>
                  ))}
            </dd>
            <dt>Precio y condiciones</dt>
            <dd>
              {candidate.data.priceOptions.length === 0
                ? "Por confirmar; consulta las condiciones en la fuente oficial."
                : candidate.data.priceOptions.map((price, index) => (
                    <p key={index}>
                      {price.type === "FREE"
                        ? "Gratis"
                        : price.money
                          ? `${price.money.amount} ${price.money.currency}`
                          : "Importe por confirmar"}
                      {` · ${priceLabels[price.type]} · ${scopeLabels[price.scope]}`}
                      {price.conditions && ` · ${price.conditions}`}
                    </p>
                  ))}
            </dd>
            <dt>Inscripción</dt>
            <dd>
              {candidate.data.registrationUri ? (
                <a href={candidate.data.registrationUri} target="_blank" rel="noopener noreferrer">
                  Consultar información de inscripción
                </a>
              ) : (
                "Por confirmar"
              )}
            </dd>
            <dt>Fuente y evidencia</dt>
            <dd>
              {candidate.source.name} · Observada: {candidate.source.observedAt}
              {candidate.source.url && (
                <p>
                  <a href={candidate.source.url} target="_blank" rel="noopener noreferrer">
                    Revisar convocatoria oficial
                  </a>
                </p>
              )}
            </dd>
            <dt>Versión</dt>
            <dd>{candidate.candidateVersion}</dd>
            <dt>Revisión</dt>
            <dd>{candidate.revision}</dd>
            <dt>Conflictos</dt>
            <dd>
              {candidate.conflictCount}
              {candidate.moreConflicts ? " (hay más)" : ""}
            </dd>
          </dl>
          {candidate.conflicts.length > 0 && (
            <ul aria-label="Evidencias en conflicto">
              {candidate.conflicts.map((conflict) => (
                <li key={conflict.id}>
                  {conflict.fieldPath} · {conflict.observedAt}
                  {conflict.sourceUrl && (
                    <>
                      {" "}
                      ·{" "}
                      <a href={conflict.sourceUrl} target="_blank" rel="noopener noreferrer">
                        Contrastar fuente
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {role === "reviewer" && candidate.publicationStatus === "published" && (
            <p>Solo un administrador puede cambiar una publicación activa.</p>
          )}
          <form onSubmit={submit}>
            <label htmlFor="editorial-action">Decisión</label>
            <select
              id="editorial-action"
              value={action}
              disabled={busy}
              onChange={(e) => {
                setAction(e.target.value as Action);
                setError("");
              }}
            >
              <option value="REJECT" disabled={role === "reviewer" && candidate.publicationStatus === "published"}>
                Rechazar candidato
              </option>
              <option
                value="APPROVE"
                disabled={
                  candidate.conflictCount > 0 ||
                  candidate.moreConflicts ||
                  (role === "reviewer" && candidate.publicationStatus === "published")
                }
              >
                Aprobar candidato
              </option>
              {role === "admin" && <option value="CORRECT_ORGANIZER">Asociar o cambiar organizador</option>}
              {role === "admin" && <option value="CORRECT_REGISTRATION">Actualizar inscripción</option>}
              {role === "admin" && (
                <option
                  value="VERIFY_LOCATION"
                  disabled={candidate.data.locations.every((location) => location.verified)}
                >
                  Verificar ubicación
                </option>
              )}
              {role === "admin" && (
                <option
                  value="PUBLISH"
                  disabled={candidate.status !== "accepted" || candidate.publicationStatus === "published"}
                >
                  Publicar actividad
                </option>
              )}
              {role === "admin" && (
                <option value="SUSPEND" disabled={candidate.publicationStatus !== "published"}>
                  Suspender publicación
                </option>
              )}
            </select>
            <label htmlFor="editorial-reason">Motivo obligatorio</label>
            <textarea
              id="editorial-reason"
              maxLength={1000}
              required
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
            {action === "CORRECT_ORGANIZER" && role === "admin" && (
              <>
                <label htmlFor="editorial-organizer">Organizador comprobado</label>
                <select
                  id="editorial-organizer"
                  value={organizerId}
                  onChange={(event) => setOrganizerId(event.target.value)}
                  disabled={busy}
                  required
                >
                  <option value="">Selecciona el organizador</option>
                  {candidate.data.organizerId &&
                    !candidate.organizers.some((entry) => entry.id === candidate.data.organizerId) && (
                      <option value={candidate.data.organizerId}>
                        {candidate.organizerName ?? "Organizador actual"}
                      </option>
                    )}
                  {candidate.organizers.map((organizer) => (
                    <option key={organizer.id} value={organizer.id}>
                      {organizer.name}
                    </option>
                  ))}
                </select>
                {candidate.moreOrganizers && (
                  <p>La lista es parcial. Si no aparece el organizador, solicita su selección al operador.</p>
                )}
                <p>Solo se modificará el organizador; inscripción, horario, precios y ubicaciones se conservan.</p>
              </>
            )}
            {action === "CORRECT_REGISTRATION" && role === "admin" && (
              <>
                {candidate.registrationSupported ? (
                  <>
                    <label htmlFor="editorial-registration-method">Canal de inscripción</label>
                    <select
                      id="editorial-registration-method"
                      value={registrationMethod}
                      required
                      disabled={busy}
                      onChange={(e) => {
                        setRegistrationMethod(e.target.value as RegistrationMethod);
                        setDestination("");
                        setOrganizerPublished(false);
                      }}
                    >
                      <option value="">Selecciona el canal publicado</option>
                      <option value="WEB">Web</option>
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="PHONE">Teléfono</option>
                      <option value="EMAIL">Correo electrónico</option>
                    </select>
                    <label htmlFor="editorial-registration-destination">Destino de inscripción publicado</label>
                    <input
                      id="editorial-registration-destination"
                      required
                      disabled={busy}
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      type={registrationMethod === "WEB" ? "url" : registrationMethod === "EMAIL" ? "email" : "tel"}
                      pattern={["WHATSAPP", "PHONE"].includes(registrationMethod) ? "[+][1-9][0-9]{6,14}" : undefined}
                    />
                    <small>
                      WhatsApp y teléfono: formato internacional E.164. No se generarán enlaces de WhatsApp.
                    </small>
                    <label htmlFor="editorial-registration-evidence">URL de la evidencia de inscripción</label>
                    <input
                      id="editorial-registration-evidence"
                      type="url"
                      required
                      disabled={busy}
                      value={evidenceUrl}
                      onChange={(e) => setEvidenceUrl(e.target.value)}
                    />
                    <label>
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={organizerPublished}
                        onChange={(e) => setOrganizerPublished(e.target.checked)}
                      />
                      El organizador publica este canal y destino para inscripción y autoriza su uso público.
                    </label>
                  </>
                ) : (
                  <>
                    <label htmlFor="editorial-registration">Enlace de inscripción comprobado</label>
                    <input
                      id="editorial-registration"
                      type="url"
                      value={registrationUri}
                      onChange={(event) => setRegistrationUri(event.target.value)}
                      disabled={busy}
                      required
                    />
                  </>
                )}
                <p>Solo se modificará la inscripción; organizador, horario, precios y ubicaciones se conservan.</p>
              </>
            )}
            {action === "VERIFY_LOCATION" && role === "admin" && (
              <fieldset disabled={busy}>
                <legend>Ubicaciones comprobadas en la convocatoria oficial</legend>
                {candidate.data.locations.map((location, index) => (
                  <label key={index}>
                    <input
                      type="checkbox"
                      checked={location.verified || verifiedLocations.includes(index)}
                      disabled={location.verified}
                      onChange={(event) =>
                        setVerifiedLocations((current) =>
                          event.target.checked
                            ? [...current.filter((entry) => entry !== index), index].sort((x, y) => x - y)
                            : current.filter((entry) => entry !== index),
                        )
                      }
                    />
                    He comprobado esta ubicación: {describeLocation(location)}
                    {location.verified ? " (ya verificada)" : ""}
                  </label>
                ))}
                <p>Solo se marcarán como verificadas las ubicaciones seleccionadas; el resto no cambia.</p>
              </fieldset>
            )}
            {isCorrectionAction(action) && role === "admin" && !candidate.correctionBase && (
              <p>{errors.UNPRESERVABLE}</p>
            )}
            {isCorrectionAction(action) && role === "admin" && (
              <p>Guardar esta revisión retira cualquier publicación activa y exige una nueva aprobación.</p>
            )}
            {candidate.registrationSupported && candidate.data.registration && (
              <p>
                Inscripción: {candidate.data.registration.method} · {candidate.data.registration.destination}.{" "}
                <a href={candidate.data.registration.evidenceUrl} target="_blank" rel="noopener noreferrer">
                  Ver evidencia del organizador
                </a>
              </p>
            )}
            {action === "APPROVE" && (
              <>
                {candidate.registrationSupported && (
                  <label>
                    <input
                      type="checkbox"
                      required
                      checked={registrationVerified}
                      disabled={busy || !candidate.data.registration?.organizerPublished}
                      onChange={(e) => setRegistrationVerified(e.target.checked)}
                    />
                    He verificado ahora el canal, destino y autorización de publicación del organizador.
                  </label>
                )}
                <label htmlFor="editorial-url">URL oficial verificada (HTTPS, sin query)</label>
                {candidate.registrationSupported ? (
                  <>
                    <input
                      id="editorial-url"
                      type="url"
                      readOnly
                      value={candidate.data.registration?.evidenceUrl ?? ""}
                      disabled={busy}
                      aria-describedby="editorial-url-hint"
                    />
                    <small id="editorial-url-hint">
                      {candidate.data.registration
                        ? "Es la evidencia de inscripción registrada y es la única que acepta el Engine. Para cambiarla, usa «Actualizar inscripción»."
                        : errors.APPROVE_WITHOUT_REGISTRATION}
                    </small>
                  </>
                ) : (
                  <input
                    id="editorial-url"
                    type="url"
                    required
                    value={verificationUrl}
                    disabled={busy}
                    onChange={(e) => setVerificationUrl(e.target.value)}
                  />
                )}
                <label htmlFor="editorial-category">Categoría</label>
                <select
                  id="editorial-category"
                  value={category}
                  disabled={busy}
                  required
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Selecciona la categoría comprobada</option>
                  {categories.map((entry) => (
                    <option key={entry} value={entry}>
                      {categoryLabels[entry]}
                    </option>
                  ))}
                </select>
              </>
            )}
            {candidate.publicationStatus === "published" &&
              (action === "APPROVE" || action === "REJECT" || isCorrectionAction(action)) && (
                <p>Esta decisión retirará la actividad del catálogo y exigirá una nueva publicación.</p>
              )}
            <button
              type="submit"
              disabled={busy || !reason.trim() || (role === "reviewer" && candidate.publicationStatus === "published")}
            >
              {busy ? "Validando decisión…" : "Confirmar decisión"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
