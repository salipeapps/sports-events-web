"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { AdminRole } from "@/domain/adminAccess";
import type { EditorialInspection } from "@/domain/editorial";

type Action = "APPROVE" | "REJECT" | "PUBLISH" | "SUSPEND" | "CORRECT";
const errors: Record<string, string> = {
  NOT_CONFIGURED: "El circuito editorial todavía no está habilitado en este entorno.",
  INVALID_REQUEST: "La petición no es válida.",
  UNAUTHENTICATED: "La sesión ha caducado. Inicia sesión de nuevo.",
  FORBIDDEN: "No tienes permiso para realizar esta operación.",
  NOT_FOUND: "No se encuentra esta candidatura.",
  CONFLICT: "El candidato ha cambiado. Actualiza sus datos antes de decidir.",
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
  const [locationConfirmed, setLocationConfirmed] = useState(false);
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

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setCandidate(value);
          setOrganizerId(value.data.organizerId ?? "");
          setRegistrationUri(value.data.registrationUri ?? "");
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
  }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!candidate || busy || !reason.trim()) return;
    if (role !== "admin" && action !== "APPROVE" && action !== "REJECT") return;
    const payload: Record<string, unknown> = {
      action,
      expectedVersion: candidate.candidateVersion,
      expectedRevision: candidate.revision,
      reason: reason.trim(),
    };
    if (action === "APPROVE") {
      payload.verificationUrl = verificationUrl;
      payload.category = category;
    }
    if (action === "CORRECT") {
      if (!locationConfirmed || !organizerId || candidate.data.locations.length === 0) return;
      payload.correction = {
        ...candidate.data,
        organizerId,
        registrationUri,
        locations: candidate.data.locations.map((location) => ({ ...location, verified: true })),
      };
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
        throw new Error(errors[code] ?? "Error al enviar la decisión.");
      }
      // A successful receipt is mandatory; never infer success from a timeout or 2xx without a receipt.
      if (value.commandKey !== submittedKey || !Array.isArray(value.candidateIds))
        throw new Error(errors.INCOMPATIBLE_CONTRACT);
      pending.current = null;
      setResult("Decisión confirmada por Engine: " + String(value.status));
      const updated = await refresh();
      setCandidate(updated);
      setOrganizerId(updated.data.organizerId ?? "");
      setRegistrationUri(updated.data.registrationUri ?? "");
      setLocationConfirmed(false);
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
                      {[location.municipality, location.neighborhood, location.pointName, location.address]
                        .filter(Boolean)
                        .join(" · ") || "Por confirmar"}
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
                  Consultar inscripción
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
              onChange={(e) => setAction(e.target.value as Action)}
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
              {role === "admin" && <option value="CORRECT">Confirmar organizador, inscripción y ubicación</option>}
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
            {action === "CORRECT" && role === "admin" && (
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
                <label htmlFor="editorial-registration">Enlace de inscripción comprobado</label>
                <input
                  id="editorial-registration"
                  type="url"
                  value={registrationUri}
                  onChange={(event) => setRegistrationUri(event.target.value)}
                  disabled={busy}
                  required
                />
                <label>
                  <input
                    type="checkbox"
                    checked={locationConfirmed}
                    onChange={(event) => setLocationConfirmed(event.target.checked)}
                    disabled={busy || candidate.data.locations.length === 0}
                    required
                  />
                  He comprobado todas las ubicaciones mostradas en la convocatoria oficial.
                </label>
                <p>Guardar esta revisión retira cualquier publicación activa y exige una nueva aprobación.</p>
              </>
            )}
            {action === "APPROVE" && (
              <>
                <label htmlFor="editorial-url">URL oficial verificada (HTTPS, sin query)</label>
                <input
                  id="editorial-url"
                  type="url"
                  required
                  value={verificationUrl}
                  disabled={busy}
                  onChange={(e) => setVerificationUrl(e.target.value)}
                />
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
            {candidate.publicationStatus === "published" && ["APPROVE", "REJECT", "CORRECT"].includes(action) && (
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
