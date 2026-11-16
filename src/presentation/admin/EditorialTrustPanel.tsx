"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  composeTrustReason,
  isEvidenceUrl,
  isOfficialChannelOrigin,
  isOrganizerOfficialUrl,
  isTrustReason,
  isValidAlias,
  isValidOrganizerName,
  normalizeAlias,
  normalizeOrganizerName,
  organizerPath,
  type OrganizerReceipt,
  trustPath,
  trustMethod,
  type TrustOperation,
  type TrustReceipt,
} from "@/domain/editorialTrust";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const errors: Record<string, string> = {
  NOT_CONFIGURED: "Los comandos de confianza editorial no están habilitados en este entorno.",
  INVALID_REQUEST: "El Engine o el servidor han rechazado la petición por no ser válida. No se ha registrado nada.",
  UNAUTHENTICATED: "La sesión ha caducado. Inicia sesión de nuevo y reintenta con la misma clave.",
  FORBIDDEN: "Solo un administrador activo puede ejecutar este comando. No se ha registrado nada.",
  NOT_FOUND:
    "No existe ese organizador o esa fuente (o la fuente no tiene política revisada). No se ha registrado nada.",
  CONFLICT: "Conflicto: el valor ya pertenece a otro organizador. No se ha registrado nada.",
  RATE_LIMITED: "El Engine está ocupado. Reintenta en unos segundos con la misma clave.",
  WRITE_UNAVAILABLE:
    "Resultado incierto: el Engine no ha confirmado la operación (sin respuesta o error temporal). Puede haberse registrado o no.",
  INCOMPATIBLE_CONTRACT:
    "Resultado incierto: el Engine ha devuelto una respuesta que no se puede verificar. Puede haberse registrado o no.",
};
/** 409 reasons of an organizer registration: nothing was written, and this screen never acknowledges matches. */
const conflictMessages: Record<string, string> = {
  ORGANIZER_EXISTS:
    "Ya existe un organizador con un nombre equivalente. No se ha registrado nada: no crees otro; revisa si basta con usarlo.",
  ORGANIZER_AMBIGUOUS:
    "Hay organizadores con un nombre parecido. No se ha registrado nada. Esta pantalla no permite declararlos distintos: detén el alta y revisa la ficha.",
};
/** Codes after which the same intention may be retried with the same Idempotency-Key. */
const retryable = new Set(["UNAUTHENTICATED", "RATE_LIMITED", "WRITE_UNAVAILABLE", "INCOMPATIBLE_CONTRACT"]);
const uncertain = new Set(["WRITE_UNAVAILABLE", "INCOMPATIBLE_CONTRACT"]);

const statusLabels: Record<string, string> = {
  ADDED: "ADDED: el Engine ha registrado el valor nuevo.",
  EXISTS: "EXISTS: el valor ya existía; el Engine no ha escrito nada.",
  DECLARED: "DECLARED: el Engine ha registrado la declaración de autoridad de ubicación.",
  WITHDRAWN: "WITHDRAWN: el Engine ha registrado la retirada de la autoridad de ubicación.",
  UNCHANGED: "UNCHANGED: la fuente ya estaba en ese estado; el Engine no ha escrito nada.",
  CREATED: "CREATED: el Engine ha creado el organizador y su canal oficial.",
};
type CommandId = TrustOperation | "organizer";
type AnyReceipt = TrustReceipt | OrganizerReceipt;

interface Prepared {
  path: string;
  method: "POST" | "PUT";
  body: Record<string, unknown>;
  summary: [string, string][];
}
interface Pending {
  fingerprint: string;
  key: string;
}
interface Outcome {
  kind: "receipt" | "error";
  receipt?: AnyReceipt;
  message?: string;
  code?: string;
  key?: string;
  conflicts?: { id: string; canonicalName: string }[];
}

/** One trust command: edit → review exactly what will be sent → explicit confirmation → Engine receipt. */
function useTrustCommand(operation: CommandId) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // The key belongs to the intention: kept across uncertain retries of the identical payload only.
  const pending = useRef<Pending | null>(null);

  function review(next: Prepared) {
    setPrepared(next);
    setConfirmed(false);
    setOutcome(null);
  }
  function edit() {
    setPrepared(null);
    setConfirmed(false);
  }

  async function send(onReceipt: () => void) {
    if (!prepared || !confirmed || busy) return;
    const fingerprint = prepared.method + " " + prepared.path + " " + JSON.stringify(prepared.body);
    if (!pending.current || pending.current.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    const key = pending.current.key;
    setBusy(true);
    setOutcome(null);
    try {
      const response = await fetch("/api/internal/editorial" + prepared.path, {
        method: prepared.method,
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(prepared.body),
      });
      let value: Record<string, unknown> = {};
      try {
        value = (await response.json()) as Record<string, unknown>;
      } catch {
        value = { code: "INCOMPATIBLE_CONTRACT" };
      }
      if (!response.ok) {
        const code = typeof value.code === "string" && value.code in errors ? value.code : "INCOMPATIBLE_CONTRACT";
        if (!retryable.has(code)) {
          // A definite answer ends this intention: another send needs a fresh, explicit confirmation.
          pending.current = null;
          setConfirmed(false);
        }
        const reason = typeof value.reason === "string" ? value.reason : "";
        setOutcome({
          kind: "error",
          code,
          message: (code === "CONFLICT" && conflictMessages[reason]) || errors[code],
          key: retryable.has(code) ? key : undefined,
          conflicts: Array.isArray(value.organizers)
            ? (value.organizers as { id: string; canonicalName: string }[])
            : undefined,
        });
        return;
      }
      // Success only with a receipt for THIS key and THIS command; anything else stays uncertain.
      if (value.commandKey !== key || typeof value.status !== "string" || !(value.status in statusLabels)) {
        setOutcome({ kind: "error", code: "INCOMPATIBLE_CONTRACT", message: errors.INCOMPATIBLE_CONTRACT, key });
        return;
      }
      pending.current = null;
      setOutcome({ kind: "receipt", receipt: value as unknown as AnyReceipt });
      setPrepared(null);
      setConfirmed(false);
      onReceipt();
    } catch {
      setOutcome({ kind: "error", code: "WRITE_UNAVAILABLE", message: errors.WRITE_UNAVAILABLE, key });
    } finally {
      setBusy(false);
    }
  }

  return { operation, prepared, confirmed, setConfirmed, busy, outcome, review, edit, send, setOutcome };
}

type Command = ReturnType<typeof useTrustCommand>;

function ReviewAndSend({ command, onReceipt, label }: { command: Command; onReceipt: () => void; label: string }) {
  const { prepared, confirmed, setConfirmed, busy, outcome, edit, send, operation } = command;
  const confirmId = operation + "-confirm";
  return (
    <>
      {prepared ? (
        <div aria-label={"Revisión: " + label} role="group">
          <h3>Revisa exactamente lo que se enviará</h3>
          <dl>
            <dt>Operación</dt>
            <dd>
              {prepared.method} /api/editorial/v1{prepared.path}
            </dd>
            {prepared.summary.map(([term, value]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p>
            No hay simulación: enviar ejecuta una escritura real en el Engine. Esta pantalla no concede la autorización
            operativa necesaria para hacerlo; asegúrate de tenerla antes de confirmar.
          </p>
          <p>
            <input
              id={confirmId}
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <label htmlFor={confirmId}>
              He revisado la evidencia y confirmo que quiero enviar este comando al Engine.
            </label>
          </p>
          <button type="button" disabled={!confirmed || busy} onClick={() => void send(onReceipt)}>
            {busy ? "Enviando\u2026" : outcome?.key ? "Reintentar con la misma clave" : "Enviar al Engine"}
          </button>{" "}
          <button type="button" disabled={busy} onClick={edit}>
            Volver a editar
          </button>
        </div>
      ) : null}
      {outcome?.kind === "error" ? (
        <div role="alert">
          <p>{outcome.message}</p>
          {outcome.code && uncertain.has(outcome.code) ? (
            <p>
              No lo des por registrado ni por fallido. Reintenta con la misma clave (el Engine devuelve el mismo recibo
              si ya lo registró) o comprueba el recibo por esa clave antes de cualquier otra acción.
            </p>
          ) : null}
          {outcome.conflicts && outcome.conflicts.length > 0 ? (
            <ul aria-label="Organizadores que ya lo usan">
              {outcome.conflicts.map((organizer) => (
                <li key={organizer.id}>
                  {organizer.canonicalName} ({organizer.id})
                </li>
              ))}
            </ul>
          ) : null}
          {outcome.key ? (
            <p>
              Clave de idempotencia de esta intención: <code>{outcome.key}</code>. Si cambias cualquier dato se tratará
              como una intención nueva con otra clave; antes, comprueba el recibo de esta.
            </p>
          ) : null}
        </div>
      ) : null}
      {outcome?.kind === "receipt" && outcome.receipt ? <Receipt receipt={outcome.receipt} /> : null}
    </>
  );
}

function Receipt({ receipt }: { receipt: AnyReceipt }) {
  const rows: [string, ReactNode][] = [
    ["Estado", statusLabels[receipt.status] ?? receipt.status],
    ["Acción", receipt.action],
    ["Clave del comando", <code key="k">{receipt.commandKey}</code>],
    ["Registrado en", receipt.recordedAt],
  ];
  if ("officialChannelId" in receipt) {
    rows.push(
      ["Organizador creado", receipt.organizerId],
      ["Nombre canónico", receipt.canonicalName],
      ["Canal oficial", receipt.officialUrl],
      ["ID del canal", receipt.officialChannelId],
      ["Verificado en", receipt.verifiedAt],
    );
    return <ReceiptView rows={rows} />;
  }
  if (receipt.organizerId) rows.push(["Organizador", receipt.organizerId]);
  if (receipt.alias) rows.push(["Alias", receipt.alias]);
  if (receipt.officialUrl) rows.push(["Canal oficial", receipt.officialUrl]);
  if (receipt.channelId) rows.push(["ID del canal", receipt.channelId]);
  if (receipt.sourceId) rows.push(["Fuente", receipt.sourceId]);
  if (receipt.authoritative !== null) rows.push(["Autoridad de ubicación", receipt.authoritative ? "Sí" : "No"]);
  return <ReceiptView rows={rows} />;
}

function ReceiptView({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <section role="status" aria-label="Recibo del Engine">
      <h3>Recibo del Engine</h3>
      <dl>
        {rows.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Shared fields: required reason and HTTPS evidence, typed by the admin (never prefilled). */
function ReasonFields({
  idPrefix,
  reason,
  setReason,
  evidence,
  setEvidence,
  disabled,
}: {
  idPrefix: string;
  reason: string;
  setReason: (value: string) => void;
  evidence: string;
  setEvidence: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <p>
        <label htmlFor={idPrefix + "-reason"}>Motivo editorial (obligatorio)</label>
        <textarea
          id={idPrefix + "-reason"}
          required
          maxLength={900}
          value={reason}
          disabled={disabled}
          onChange={(event) => setReason(event.target.value)}
        />
      </p>
      <p>
        <label htmlFor={idPrefix + "-evidence"}>URL de evidencia oficial revisada (HTTPS, obligatoria)</label>
        <input
          id={idPrefix + "-evidence"}
          type="url"
          inputMode="url"
          required
          maxLength={500}
          value={evidence}
          disabled={disabled}
          onChange={(event) => setEvidence(event.target.value)}
        />
      </p>
    </>
  );
}

function prepareReason(reason: string, evidence: string): { reason: string; error?: string } {
  const trimmed = reason.trim();
  if (!isTrustReason(trimmed)) return { reason: "", error: "Escribe un motivo sin caracteres de control." };
  if (!isEvidenceUrl(evidence))
    return {
      reason: "",
      error: "La evidencia debe ser una URL HTTPS pública y canónica, sin credenciales, puerto, query ni fragmento.",
    };
  const composed = composeTrustReason(trimmed, evidence);
  if (!composed) return { reason: "", error: "El motivo junto con la evidencia supera los 1000 caracteres." };
  return { reason: trimmed };
}

function useEditorialFields() {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState("");
  return {
    target,
    setTarget,
    reason,
    setReason,
    evidence,
    setEvidence,
    error,
    setError,
    reset() {
      setTarget("");
      setReason("");
      setEvidence("");
      setError("");
    },
  };
}

function OrganizerForm() {
  const command = useTrustCommand("organizer");
  const fields = useEditorialFields();
  const [name, setName] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const locked = command.prepared !== null || command.busy;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    fields.setError("");
    const normalized = normalizeOrganizerName(name);
    if (!isValidOrganizerName(normalized))
      return fields.setError(
        "El nombre debe tener entre 2 y 200 caracteres, alguna letra y ningún carácter invisible.",
      );
    if (!isOrganizerOfficialUrl(officialUrl))
      return fields.setError(
        "La web oficial debe ser solo un origen HTTPS en minúsculas (https://host o https://host/), sin ruta, query, fragmento ni puerto.",
      );
    const { reason, error } = prepareReason(fields.reason, fields.evidence);
    if (error) return fields.setError(error);
    command.review({
      path: organizerPath,
      method: "POST",
      body: { canonicalName: normalized, officialUrl, reason, evidenceUrl: fields.evidence },
      summary: [
        ["Organizador nuevo (nombre canónico)", normalized],
        ["Canal oficial (host exacto)", officialUrl],
        ["Organizadores parecidos reconocidos", "Ninguno: si el Engine encuentra alguno, no escribe nada"],
        ["Motivo registrado", composeTrustReason(reason, fields.evidence)!],
      ],
    });
  }

  return (
    <section aria-labelledby="organizer-title">
      <h2 id="organizer-title">Alta de un organizador nuevo</h2>
      <p>
        Crea <strong>un</strong> organizador y, a la vez, su canal oficial. Úsalo solo si el organizador no existe con
        ningún nombre equivalente. Si existe, el Engine responde con conflicto y no escribe nada; si hay organizadores
        parecidos, también se detiene. La captura confiará en todo el host del canal. No se puede borrar después.
      </p>
      <form onSubmit={submit} aria-label="Alta de organizador">
        <p>
          <label htmlFor="organizer-name">Nombre canónico</label>
          <input
            id="organizer-name"
            required
            maxLength={200}
            value={name}
            disabled={locked}
            onChange={(event) => setName(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="organizer-url">Origen HTTPS de la web oficial</label>
          <input
            id="organizer-url"
            type="url"
            inputMode="url"
            required
            maxLength={500}
            value={officialUrl}
            disabled={locked}
            onChange={(event) => setOfficialUrl(event.target.value)}
          />
        </p>
        <ReasonFields idPrefix="organizer" disabled={locked} {...fields} />
        {fields.error ? <p role="alert">{fields.error}</p> : null}
        {!command.prepared ? <button type="submit">Revisar alta antes de enviar</button> : null}
      </form>
      <ReviewAndSend
        command={command}
        label="alta de organizador"
        onReceipt={() => {
          fields.reset();
          setName("");
          setOfficialUrl("");
        }}
      />
    </section>
  );
}

function AliasForm() {
  const command = useTrustCommand("alias");
  const fields = useEditorialFields();
  const [alias, setAlias] = useState("");
  const locked = command.prepared !== null || command.busy;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    fields.setError("");
    const target = fields.target.trim();
    if (!uuid.test(target)) return fields.setError("El ID del organizador debe ser un UUID en minúsculas.");
    const normalized = normalizeAlias(alias);
    if (!isValidAlias(normalized))
      return fields.setError("El alias debe tener entre 2 y 200 caracteres, alguna letra y ningún carácter invisible.");
    const { reason, error } = prepareReason(fields.reason, fields.evidence);
    if (error) return fields.setError(error);
    command.review({
      path: trustPath("alias", target),
      method: trustMethod("alias"),
      body: { alias: normalized, reason, evidenceUrl: fields.evidence },
      summary: [
        ["Organizador existente", target],
        ["Alias revisado", normalized],
        ["Motivo registrado", composeTrustReason(reason, fields.evidence)!],
      ],
    });
  }

  return (
    <section aria-labelledby="alias-title">
      <h2 id="alias-title">Alias revisado de un organizador existente</h2>
      <p>
        Añade un nombre alternativo a un organizador que ya existe. No renombra, no fusiona y no se puede borrar
        después. Si el alias ya es de otro organizador, el Engine responde con conflicto y no escribe nada.
      </p>
      <form onSubmit={submit} aria-label="Alias de organizador">
        <p>
          <label htmlFor="alias-organizer">ID del organizador (UUID)</label>
          <input
            id="alias-organizer"
            required
            maxLength={36}
            value={fields.target}
            disabled={locked}
            onChange={(event) => fields.setTarget(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="alias-value">Alias</label>
          <input
            id="alias-value"
            required
            maxLength={200}
            value={alias}
            disabled={locked}
            onChange={(event) => setAlias(event.target.value)}
          />
        </p>
        <ReasonFields idPrefix="alias" disabled={locked} {...fields} />
        {fields.error ? <p role="alert">{fields.error}</p> : null}
        {!command.prepared ? <button type="submit">Revisar alias antes de enviar</button> : null}
      </form>
      <ReviewAndSend
        command={command}
        label="alias"
        onReceipt={() => {
          fields.reset();
          setAlias("");
        }}
      />
    </section>
  );
}

function ChannelForm() {
  const command = useTrustCommand("channel");
  const fields = useEditorialFields();
  const [officialUrl, setOfficialUrl] = useState("");
  const locked = command.prepared !== null || command.busy;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    fields.setError("");
    const target = fields.target.trim();
    if (!uuid.test(target)) return fields.setError("El ID del organizador debe ser un UUID en minúsculas.");
    if (!isOfficialChannelOrigin(officialUrl))
      return fields.setError(
        "El canal debe ser solo un origen HTTPS en minúsculas (https://host o https://host/), sin ruta, query, fragmento ni puerto.",
      );
    const { reason, error } = prepareReason(fields.reason, fields.evidence);
    if (error) return fields.setError(error);
    command.review({
      path: trustPath("channel", target),
      method: trustMethod("channel"),
      body: { officialUrl, reason, evidenceUrl: fields.evidence },
      summary: [
        ["Organizador existente", target],
        ["Canal oficial (host exacto)", officialUrl],
        ["Motivo registrado", composeTrustReason(reason, fields.evidence)!],
      ],
    });
  }

  return (
    <section aria-labelledby="channel-title">
      <h2 id="channel-title">Canal oficial de un organizador existente</h2>
      <p>
        La captura confiará en <strong>todo el host</strong> del canal: un enlace de inscripción en ese host contará
        como publicado por el organizador. Solo se admite el host exacto (un subdominio es otro host distinto). No
        registres agregadores, pasarelas de inscripción ni plataformas de terceros. No se puede borrar después.
      </p>
      <form onSubmit={submit} aria-label="Canal oficial de organizador">
        <p>
          <label htmlFor="channel-organizer">ID del organizador (UUID)</label>
          <input
            id="channel-organizer"
            required
            maxLength={36}
            value={fields.target}
            disabled={locked}
            onChange={(event) => fields.setTarget(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="channel-url">Origen HTTPS del canal oficial</label>
          <input
            id="channel-url"
            type="url"
            inputMode="url"
            required
            maxLength={500}
            value={officialUrl}
            disabled={locked}
            onChange={(event) => setOfficialUrl(event.target.value)}
          />
        </p>
        <ReasonFields idPrefix="channel" disabled={locked} {...fields} />
        {fields.error ? <p role="alert">{fields.error}</p> : null}
        {!command.prepared ? <button type="submit">Revisar canal antes de enviar</button> : null}
      </form>
      <ReviewAndSend
        command={command}
        label="canal"
        onReceipt={() => {
          fields.reset();
          setOfficialUrl("");
        }}
      />
    </section>
  );
}

function LocationAuthorityForm() {
  const command = useTrustCommand("locationAuthority");
  const fields = useEditorialFields();
  // No default: the admin must choose declare or withdraw explicitly.
  const [choice, setChoice] = useState<"" | "declare" | "withdraw">("");
  const locked = command.prepared !== null || command.busy;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    fields.setError("");
    const target = fields.target.trim();
    if (!uuid.test(target)) return fields.setError("El ID de la fuente debe ser un UUID en minúsculas.");
    if (!choice) return fields.setError("Elige expresamente si declaras o retiras la autoridad.");
    const { reason, error } = prepareReason(fields.reason, fields.evidence);
    if (error) return fields.setError(error);
    const authoritative = choice === "declare";
    command.review({
      path: trustPath("locationAuthority", target),
      method: trustMethod("locationAuthority"),
      body: { authoritative, reason, evidenceUrl: fields.evidence },
      summary: [
        ["Fuente", target],
        ["Cambio", authoritative ? "Declarar autoridad de ubicación" : "Retirar autoridad de ubicación"],
        ["Motivo registrado", composeTrustReason(reason, fields.evidence)!],
      ],
    });
  }

  return (
    <section aria-labelledby="authority-title">
      <h2 id="authority-title">Autoridad de ubicación de una fuente</h2>
      <p>
        Declara o retira, para <strong>una sola fuente</strong>, que sus datos de ubicación son fiables. Solo afecta a
        capturas futuras; no verifica ubicaciones ausentes ni se extiende a otras fuentes. Retirar la autoridad devuelve
        la fuente al estado conservador.
      </p>
      <form onSubmit={submit} aria-label="Autoridad de ubicación">
        <p>
          <label htmlFor="authority-source">ID de la fuente (UUID)</label>
          <input
            id="authority-source"
            required
            maxLength={36}
            value={fields.target}
            disabled={locked}
            onChange={(event) => fields.setTarget(event.target.value)}
          />
        </p>
        <fieldset disabled={locked}>
          <legend>Cambio</legend>
          <p>
            <input
              id="authority-declare"
              type="radio"
              name="authority"
              checked={choice === "declare"}
              onChange={() => setChoice("declare")}
            />
            <label htmlFor="authority-declare">Declarar autoridad de ubicación</label>
          </p>
          <p>
            <input
              id="authority-withdraw"
              type="radio"
              name="authority"
              checked={choice === "withdraw"}
              onChange={() => setChoice("withdraw")}
            />
            <label htmlFor="authority-withdraw">Retirar autoridad de ubicación</label>
          </p>
        </fieldset>
        <ReasonFields idPrefix="authority" disabled={locked} {...fields} />
        {fields.error ? <p role="alert">{fields.error}</p> : null}
        {!command.prepared ? <button type="submit">Revisar cambio antes de enviar</button> : null}
      </form>
      <ReviewAndSend
        command={command}
        label="autoridad de ubicación"
        onReceipt={() => {
          fields.reset();
          setChoice("");
        }}
      />
    </section>
  );
}

export function EditorialTrustPanel() {
  return (
    <section>
      <h1>Confianza editorial (V022 y V026)</h1>
      <p>
        <Link href="/admin/editorial">Volver a la revisión editorial</Link>
      </p>
      <p>
        Cuatro comandos independientes, solo para administradores. Cada envío es una única escritura real que decide el
        Engine; esta pantalla no autoriza ejecutarlos ni registra nada hasta recibir su recibo. Un resultado incierto se
        reintenta con la misma clave, nunca se da por hecho.
      </p>
      <OrganizerForm />
      <AliasForm />
      <ChannelForm />
      <LocationAuthorityForm />
    </section>
  );
}
