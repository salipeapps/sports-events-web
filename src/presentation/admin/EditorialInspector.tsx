"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { AdminRole } from "@/domain/adminAccess";

type Action = "APPROVE" | "REJECT" | "PUBLISH" | "SUSPEND";
interface Candidate {
  candidateId: string;
  candidateVersion: number;
  revision: number;
  status: string;
  title: string;
  conflictCount: number;
  moreConflicts: boolean;
}
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

export function EditorialInspector({ candidateId, role }: { candidateId: string; role: AdminRole }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action>("REJECT");
  const [reason, setReason] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [category, setCategory] = useState("yoga");
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
      return data as unknown as Candidate;
    },
    [candidateId],
  );

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setCandidate(value);
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
      setCandidate(await refresh());
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
          <form onSubmit={submit}>
            <label htmlFor="editorial-action">Decisión</label>
            <select
              id="editorial-action"
              value={action}
              disabled={busy}
              onChange={(e) => setAction(e.target.value as Action)}
            >
              <option value="REJECT">Rechazar candidato</option>
              <option value="APPROVE">Aprobar candidato</option>
              {role === "admin" && <option value="PUBLISH">Publicar actividad</option>}
              {role === "admin" && <option value="SUSPEND">Suspender publicación</option>}
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
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categories.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button type="submit" disabled={busy || !reason.trim()}>
              {busy ? "Validando decisión…" : "Confirmar decisión"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
