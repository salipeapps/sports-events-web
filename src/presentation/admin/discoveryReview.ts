import type { DiscoveryCandidate } from "@/integrations/discovery/readApi";
import type { CommandOperation, PromotionCommand, RejectionCommand } from "@/integrations/discovery/commandApi";

export interface DiscoveryReviewAccess {
  subject: string;
  canReject: boolean;
  canPromote: boolean;
  rejectionEnabled: boolean;
  promotionEnabled: boolean;
}

export const rejectionLabels = {
  UNSUITABLE_SOURCE: "Fuente inadecuada",
  OUT_OF_SCOPE: "Fuera de alcance",
  DUPLICATE_SOURCE: "Fuente duplicada",
  INVALID_SOURCE: "Fuente inválida",
} satisfies Record<RejectionCommand["reasonCode"], string>;

export function reviewReasonLabel(code: string) {
  return Object.hasOwn(rejectionLabels, code) ? rejectionLabels[code as keyof typeof rejectionLabels] : code;
}

export function sourceNameError(value: string): string | null {
  const name = value.trim();
  if (!name) return "El nombre de la fuente no puede estar vacío ni contener solo espacios.";
  if (/[\p{Cc}\p{Cf}]/u.test(name))
    return "El nombre de la fuente no puede contener caracteres de control ni caracteres invisibles de formato.";
  if (name.length > 120) return "El nombre de la fuente no puede superar 120 caracteres.";
  return null;
}

export function reviewAvailability(candidate: DiscoveryCandidate, access?: DiscoveryReviewAccess) {
  const pending = candidate.reviewStatus === "PENDING_REVIEW" && !candidate.linkedSourceId;
  return {
    reject: Boolean(pending && access?.canReject && access.rejectionEnabled),
    promote: Boolean(
      pending &&
      access?.canPromote &&
      access.promotionEnabled &&
      candidate.classification?.kind === "SUPPORTED_ADAPTER_CANDIDATE" &&
      candidate.classification.proposedAdapterKey,
    ),
  };
}

export interface ReviewIntent {
  version: 1;
  key: string;
  candidateId: string;
  subject: string;
  operation: CommandOperation;
  body: RejectionCommand | PromotionCommand;
}

export function intentStorageKey(subject: string, candidateId: string) {
  return `discovery-review-v1:${subject}:${candidateId}`;
}

// Stored data is only a retry draft. The BFF revalidates its DTO and the current actor.
export function restoreReviewIntent(raw: string | null, subject: string, candidateId: string): ReviewIntent | null {
  if (!raw || raw.length > 8192) return null;
  try {
    const value = JSON.parse(raw) as ReviewIntent;
    if (
      value.version !== 1 ||
      value.subject !== subject ||
      value.candidateId !== candidateId ||
      typeof value.key !== "string" ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value.key) ||
      !value.body ||
      typeof value.body !== "object"
    )
      return null;
    if (value.operation === "rejection") {
      const body = value.body as RejectionCommand;
      if (Object.keys(body).length !== 1 || !Object.hasOwn(rejectionLabels, body.reasonCode)) return null;
    } else if (value.operation === "promotion") {
      const body = value.body as PromotionCommand;
      if (
        body.expectedReviewStatus !== "PENDING_REVIEW" ||
        !Number.isSafeInteger(body.expectedClassificationVersion) ||
        !Number.isInteger(body.requestBudget) ||
        ![body.sourceName, body.sourceKind, body.canonicalSourceUrl, body.adapterKey, body.allowedDomain].every(
          (field) => typeof field === "string",
        )
      )
        return null;
    } else return null;
    return value;
  } catch {
    return null;
  }
}

export function promotionDraft(
  candidate: DiscoveryCandidate,
  sourceName: string,
  sourceKind: PromotionCommand["sourceKind"],
  requestBudget: number,
): PromotionCommand {
  const url = new URL(candidate.canonicalUrl);
  return {
    expectedReviewStatus: "PENDING_REVIEW",
    expectedClassificationVersion: candidate.classification!.ruleVersion,
    sourceName: sourceName.trim(),
    sourceKind,
    canonicalSourceUrl: url.href,
    adapterKey: candidate.classification!.proposedAdapterKey!,
    allowedDomain: url.hostname,
    requestBudget,
  };
}

export const commandErrorMessages: Record<string, string> = {
  INVALID_REQUEST: "Revisa los datos de la decisión.",
  UNAUTHENTICATED: "No se ha podido verificar la sesión. Consulta el estado antes de continuar.",
  FORBIDDEN: "Tu cuenta ya no tiene permiso para esta operación o la escritura está deshabilitada.",
  NOT_FOUND: "El candidato ya no está disponible.",
  NOT_CONFIGURED:
    "La escritura no está habilitada en este entorno. Se conserva la decisión para comprobar su resultado cuando vuelva a estar disponible.",
  REJECTION_CONFLICT: "Otra decisión o cambio impide este rechazo. Se ha solicitado el estado actualizado.",
  PROMOTION_CONFLICT: "Otra decisión o cambio impide esta promoción. Se ha solicitado el estado actualizado.",
  INVALID_REJECTION_REASON: "El motivo de rechazo no está admitido. Selecciona otro motivo.",
  CLASSIFICATION_NOT_SUPPORTED: "El motor no confirma un adaptador compatible. Conserva el candidato como pendiente.",
  ADAPTER_NOT_REGISTERED: "El adaptador ya no está disponible. Revisa el estado actualizado.",
  INVALID_ALLOWED_DOMAINS: "El dominio no es válido para esta fuente.",
  INVALID_REQUEST_BUDGET: "El presupuesto debe ser un entero entre 1 y 8.",
  RATE_LIMITED: "Se han realizado demasiados intentos. Espera un minuto antes de reintentar.",
  WRITE_UNAVAILABLE: "No se puede confirmar el resultado. Consulta el estado o reintenta la misma decisión.",
  INCOMPATIBLE_CONTRACT: "No se puede confirmar la respuesta. Consulta el estado o reintenta la misma decisión.",
};
