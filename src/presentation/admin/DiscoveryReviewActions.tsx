"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DiscoveryCandidate } from "@/integrations/discovery/readApi";
import type { CommandOperation, PromotionCommand, RejectionCommand } from "@/integrations/discovery/commandApi";
import {
  commandErrorMessages,
  intentStorageKey,
  promotionDraft,
  rejectionLabels,
  restoreReviewIntent,
  reviewAvailability,
  sourceNameError,
  type DiscoveryReviewAccess,
  type ReviewIntent,
} from "./discoveryReview";

export function DiscoveryReviewActions({
  candidate,
  access,
}: {
  candidate: DiscoveryCandidate;
  access?: DiscoveryReviewAccess;
}) {
  const writable =
    access && ((access.canReject && access.rejectionEnabled) || (access.canPromote && access.promotionEnabled));
  return (
    <section className="admin-review-card admin-discovery-decisions" aria-label="Decisiones sobre la fuente">
      <h2>Decisión editorial</h2>
      {candidate.reviewStatus === "PENDING_REVIEW" && !candidate.linkedSourceId ? (
        <p>
          <strong>Conservar como pendiente / requiere adaptador.</strong> No requiere enviar una decisión: mantiene el
          estado actual, sin aprobar ni crear una fuente B2.
        </p>
      ) : null}
      {!access?.canPromote ? <p>La promoción B2 requiere el rol de administrador.</p> : null}
      {candidate.classification?.kind !== "SUPPORTED_ADAPTER_CANDIDATE" ? (
        <p>Sin compatibilidad técnica acreditada: este candidato no puede promoverse.</p>
      ) : null}
      {!access?.rejectionEnabled ? <p>Rechazo bloqueado: escritura no habilitada en este entorno.</p> : null}
      {!access?.promotionEnabled ? <p>Promoción bloqueada: escritura no habilitada en este entorno.</p> : null}
      {writable ? (
        <EnabledReviewActions key={`${access.subject}:${candidate.id}`} candidate={candidate} access={access} />
      ) : (
        <p>Modo de solo lectura. Puedes inspeccionar la fuente y su historial.</p>
      )}
    </section>
  );
}

const storageEvent = "discovery-review-intent";
function subscribe(listener: () => void) {
  window.addEventListener(storageEvent, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(storageEvent, listener);
    window.removeEventListener("storage", listener);
  };
}

function EnabledReviewActions({ candidate, access }: { candidate: DiscoveryCandidate; access: DiscoveryReviewAccess }) {
  const router = useRouter();
  const storageKey = intentStorageKey(access.subject, candidate.id);
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(storageKey) ?? "";
      } catch {
        return "unavailable";
      }
    },
    () => null,
  );
  const stored = restoreReviewIntent(raw, access.subject, candidate.id);
  const storageBlocked = raw === null || (Boolean(raw) && !stored);
  const [operation, setOperation] = useState<CommandOperation | null>(null);
  const [reason, setReason] = useState<RejectionCommand["reasonCode"] | "">("");
  const [sourceName, setSourceName] = useState("");
  const [sourceKind, setSourceKind] = useState<PromotionCommand["sourceKind"]>("BOOKING_PLATFORM");
  const [requestBudget, setRequestBudget] = useState(1);
  const [confirmation, setConfirmation] = useState<ReviewIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const [conflict, setConflict] = useState(false);
  const sending = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const focusAfterClose = useRef<"trigger" | "status">("trigger");
  const status = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const availability = reviewAvailability(candidate, access);
  const replayAllowed =
    stored &&
    (stored.operation === "rejection"
      ? access.canReject && access.rejectionEnabled
      : access.canPromote && access.promotionEnabled);

  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else {
      dialog.current?.close();
      if (focusAfterClose.current === "status") status.current?.focus();
      else trigger.current?.focus();
    }
  }, [confirmation]);

  useEffect(() => {
    form.current?.querySelector<HTMLElement>("select, input")?.focus();
  }, [operation]);

  function closeConfirmation() {
    if (sending.current) return;
    focusAfterClose.current = "trigger";
    setConfirmation(null);
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !operation ||
      stored ||
      storageBlocked ||
      sending.current ||
      complete ||
      conflict ||
      !(operation === "rejection" ? availability.reject : availability.promote)
    )
      return;
    const invalidName = operation === "promotion" ? sourceNameError(sourceName) : null;
    if (invalidName) {
      setMessage(invalidName);
      form.current?.querySelector<HTMLInputElement>("input")?.focus();
      return;
    }
    try {
      const body =
        operation === "rejection"
          ? { reasonCode: reason as RejectionCommand["reasonCode"] }
          : promotionDraft(candidate, sourceName, sourceKind, requestBudget);
      trigger.current = document.activeElement as HTMLElement;
      setConfirmation({
        version: 1,
        key: crypto.randomUUID(),
        candidateId: candidate.id,
        subject: access.subject,
        operation,
        body,
      });
    } catch {
      setMessage("No se puede preparar la decisión. Revisa la URL y el estado actualizado.");
    }
  }

  async function submit() {
    if (!confirmation || sending.current) return;
    const intent = confirmation;
    if (
      !(intent.operation === "rejection"
        ? access.canReject && access.rejectionEnabled
        : access.canPromote && access.promotionEnabled)
    )
      return;
    if (!stored && !(intent.operation === "rejection" ? availability.reject : availability.promote)) {
      closeConfirmation();
      setMessage("El estado del candidato ha cambiado. Consulta el estado actualizado antes de decidir.");
      router.refresh();
      return;
    }
    // Persist before dispatch. A refresh/timeout must never create a replacement key.
    try {
      const current = sessionStorage.getItem(storageKey);
      if (current && current !== JSON.stringify(intent)) throw new Error("existing intent");
      sessionStorage.setItem(storageKey, JSON.stringify(intent));
    } catch {
      setMessage("No se puede conservar el envío para un reintento seguro. No se ha enviado la decisión.");
      closeConfirmation();
      return;
    }
    sending.current = true;
    setBusy(true);
    setMessage("Enviando decisión…");
    window.dispatchEvent(new Event(storageEvent));
    try {
      const response = await fetch(
        `/api/internal/discovery/candidates/${encodeURIComponent(candidate.id)}/${intent.operation}`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          headers: { "Content-Type": "application/json", "Idempotency-Key": intent.key },
          body: JSON.stringify(intent.body),
          signal: AbortSignal.timeout(40000),
        },
      );
      const body = await response.json();
      const requestId = response.headers.get("x-request-id");
      const reference = requestId && /^[0-9a-f-]{36}$/.test(requestId) ? ` Referencia: ${requestId}.` : "";
      if (
        response.status === 200 &&
        body.candidateId === candidate.id &&
        typeof body.reviewId === "string" &&
        (intent.operation === "rejection"
          ? body.reviewStatus === "REJECTED" && body.reasonCode === (intent.body as RejectionCommand).reasonCode
          : typeof body.sourceId === "string")
      ) {
        setComplete(true);
        sessionStorage.removeItem(storageKey);
        setMessage(
          (intent.operation === "rejection"
            ? "Rechazo registrado. Se ha solicitado el estado y el historial actualizados."
            : "Promoción B2 registrada: fuente UNTRUSTED, deshabilitada y solo manual. Se ha solicitado el estado actualizado.") +
            reference,
        );
        router.refresh();
      } else {
        const code =
          typeof body.code === "string" && Object.hasOwn(commandErrorMessages, body.code)
            ? body.code
            : "WRITE_UNAVAILABLE";
        setMessage(commandErrorMessages[code] + reference);
        if (response.status === 409) {
          setConflict(true);
          sessionStorage.removeItem(storageKey);
          router.refresh();
        } else if ([400, 401, 403, 404, 422].includes(response.status)) {
          sessionStorage.removeItem(storageKey);
          if (response.status === 401 || response.status === 403) setConflict(true);
          router.refresh();
        }
      }
    } catch {
      setMessage(commandErrorMessages.WRITE_UNAVAILABLE);
    } finally {
      sending.current = false;
      setBusy(false);
      focusAfterClose.current = "status";
      setConfirmation(null);
      window.dispatchEvent(new Event(storageEvent));
    }
  }

  const locked = Boolean(stored) || storageBlocked || busy || complete || conflict;
  return (
    <>
      <p ref={status} tabIndex={-1} role="status" aria-live="polite">
        {message}
      </p>
      {storageBlocked && raw !== null ? (
        <p role="alert">No se puede recuperar un envío seguro. La escritura está bloqueada en esta pestaña.</p>
      ) : null}
      {stored && !complete ? (
        <div className="admin-discovery-pending" aria-label="Decisión sin confirmar">
          <p>
            Hay una decisión cuyo resultado debe comprobarse. El reintento conservará la misma clave y los mismos datos,
            aunque el estado haya cambiado.
          </p>
          <IntentSummary intent={stored} />
          <button
            type="button"
            className="admin-secondary-button"
            disabled={busy || !replayAllowed}
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setConfirmation(stored);
            }}
          >
            Reintentar misma decisión
          </button>
        </div>
      ) : null}
      {!complete && !conflict ? (
        <div className="admin-discovery-decision-buttons">
          {availability.reject ? (
            <button
              type="button"
              className="admin-danger-button"
              disabled={locked}
              onClick={(event) => {
                actionTrigger.current = event.currentTarget;
                setOperation("rejection");
                setMessage("");
              }}
            >
              Rechazar con motivo
            </button>
          ) : null}
          {availability.promote ? (
            <button
              type="button"
              className="admin-primary-button"
              disabled={locked}
              onClick={(event) => {
                actionTrigger.current = event.currentTarget;
                setOperation("promotion");
                setMessage("");
              }}
            >
              Aprobar y promover a B2
            </button>
          ) : null}
        </div>
      ) : null}
      {operation && !locked && (operation === "rejection" ? availability.reject : availability.promote) ? (
        <form ref={form} className="admin-discovery-decision-form" onSubmit={prepare}>
          {operation === "rejection" ? (
            <label>
              Motivo obligatorio
              <select required value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}>
                <option value="">Selecciona un motivo</option>
                {Object.entries(rejectionLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <p>
                El motor revalidará el adaptador, el dominio y la versión de clasificación antes de crear o reutilizar
                una fuente B2.
              </p>
              <label>
                Nombre de la fuente
                <input
                  required
                  maxLength={120}
                  value={sourceName}
                  onChange={(event) => setSourceName(event.target.value)}
                />
              </label>
              <label>
                Tipo de fuente
                <select value={sourceKind} onChange={(event) => setSourceKind(event.target.value as typeof sourceKind)}>
                  {Object.entries({
                    ORGANIZER: "Organizador",
                    AGGREGATOR: "Agregador",
                    MUNICIPAL: "Municipal",
                    BOOKING_PLATFORM: "Plataforma de reservas",
                    SEARCH_RESULT: "Resultado de búsqueda",
                    SOCIAL_NETWORK: "Red social",
                    OTHER: "Otro",
                  }).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Presupuesto de solicitudes
                <input
                  type="number"
                  min={1}
                  max={8}
                  step={1}
                  required
                  value={requestBudget}
                  onChange={(event) => setRequestBudget(Number(event.target.value))}
                />
              </label>
              <p>
                Fuente UNTRUSTED, deshabilitada, solo manual y sin programación. Esta decisión no inicia captura ni
                publicación.
              </p>
            </>
          )}
          <button className="admin-secondary-button" type="submit">
            Revisar decisión
          </button>
          <button
            className="admin-secondary-button"
            type="button"
            onClick={() => {
              setOperation(null);
              actionTrigger.current?.focus();
            }}
          >
            Cancelar edición
          </button>
        </form>
      ) : null}
      <button className="admin-secondary-button" type="button" disabled={busy} onClick={() => router.refresh()}>
        Consultar estado actualizado
      </button>
      {conflict ? (
        <p>
          Revisa el estado y el historial.{" "}
          <a href={`/admin/discovery/results/${encodeURIComponent(candidate.id)}`}>Abrir de nuevo el candidato</a> para
          valorar otra decisión.
        </p>
      ) : null}
      <dialog
        ref={dialog}
        className="admin-discovery-confirmation"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCancel={(event) => {
          event.preventDefault();
          closeConfirmation();
        }}
      >
        <h2 id={`${id}-title`}>Confirmar {confirmation?.operation === "rejection" ? "rechazo" : "promoción B2"}</h2>
        <p id={`${id}-description`}>
          Esta decisión quedará auditada con tu identidad verificada. Revisa los datos antes de confirmar.
        </p>
        {confirmation ? <IntentSummary intent={confirmation} /> : null}
        <p role="status">{busy ? "Enviando decisión…" : ""}</p>
        <div className="admin-discovery-decision-buttons">
          <button type="button" className="admin-secondary-button" disabled={busy} onClick={closeConfirmation}>
            Volver sin enviar
          </button>
          <button type="button" className="admin-danger-button" disabled={busy} onClick={submit}>
            Confirmar {confirmation?.operation === "rejection" ? "rechazo" : "promoción B2"}
          </button>
        </div>
      </dialog>
    </>
  );
}

function IntentSummary({ intent }: { intent: ReviewIntent }) {
  const body = intent.body;
  return (
    <dl className="admin-definition-list">
      <div>
        <dt>Candidato</dt>
        <dd>{intent.candidateId}</dd>
      </div>
      {"reasonCode" in body ? (
        <div>
          <dt>Motivo</dt>
          <dd>{rejectionLabels[body.reasonCode]}</dd>
        </div>
      ) : (
        <>
          <div>
            <dt>Nombre y tipo</dt>
            <dd>
              {body.sourceName} · {body.sourceKind}
            </dd>
          </div>
          <div>
            <dt>URL canónica</dt>
            <dd>{body.canonicalSourceUrl}</dd>
          </div>
          <div>
            <dt>Adaptador y dominio</dt>
            <dd>
              {body.adapterKey} · {body.allowedDomain}
            </dd>
          </div>
          <div>
            <dt>Versión y presupuesto</dt>
            <dd>
              {body.expectedClassificationVersion} · {body.requestBudget}
            </dd>
          </div>
          <div>
            <dt>Fuente B2</dt>
            <dd>UNTRUSTED · deshabilitada · solo manual · sin programación</dd>
          </div>
        </>
      )}
    </dl>
  );
}
