import type { DiscoveryCandidate } from "@/integrations/discovery/readApi";

export const sourceQueueViews = [
  { id: "all", label: "Todas" },
  { id: "pending", label: "Pendientes", reviewStatus: "PENDING_REVIEW" },
  { id: "supported", label: "Compatibles", classificationKind: "SUPPORTED_ADAPTER_CANDIDATE" },
  { id: "unsupported", label: "Sin adaptador", classificationKind: "UNSUPPORTED_REVIEWABLE" },
  { id: "ambiguous", label: "Ambiguas", classificationKind: "AMBIGUOUS_REVIEW_REQUIRED" },
  { id: "rejected", label: "Rechazadas", reviewStatus: "REJECTED" },
  { id: "approved", label: "Aprobadas", reviewStatus: "APPROVED" },
] as const;

export type SourceQueueView = (typeof sourceQueueViews)[number]["id"];

type QueueParams = Record<string, string | undefined>;

export function sourceQueueHref(view: SourceQueueView, params: QueueParams): string {
  const query = new URLSearchParams({ tab: "resultados" });
  // Keep contextual filters when switching queues, but invalidate the cursor and old state filters.
  for (const field of ["providerKey", "queryId", "executionId", "search"] as const) {
    if (params[field]) query.set(field, params[field]);
  }
  const selected = sourceQueueViews.find((item) => item.id === view);
  if (selected && "reviewStatus" in selected) query.set("reviewStatus", selected.reviewStatus);
  if (selected && "classificationKind" in selected) query.set("classificationKind", selected.classificationKind);
  return "/admin/discovery?" + query.toString();
}

export function activeSourceQueueView(params: QueueParams): SourceQueueView | null {
  const reviewStatus = params.reviewStatus || undefined;
  const classificationKind = params.classificationKind || undefined;
  const selected = sourceQueueViews.find(
    (view) =>
      ("reviewStatus" in view ? view.reviewStatus : undefined) === reviewStatus &&
      ("classificationKind" in view ? view.classificationKind : undefined) === classificationKind,
  );
  return selected?.id ?? null;
}

export function reviewStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING_REVIEW: "Pendiente de revisión",
    APPROVED: "Aprobada",
    REJECTED: "Rechazada",
  };
  return labels[status] ?? status;
}

export function reviewStatusTone(status: string): string {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "PENDING_REVIEW") return "warning";
  return "neutral";
}

export function classificationLabel(kind: string | null | undefined): string {
  if (!kind) return "Sin clasificación";
  const labels: Record<string, string> = {
    KNOWN_SOURCE: "Fuente conocida",
    SUPPORTED_ADAPTER_CANDIDATE: "Adaptador compatible",
    UNSUPPORTED_REVIEWABLE: "Requiere adaptador",
    AMBIGUOUS_REVIEW_REQUIRED: "Revisión técnica necesaria",
    UNSAFE_OR_INVALID: "No apta",
    NON_SOURCE_RESULT: "No es una fuente",
  };
  return labels[kind] ?? kind;
}

export function classificationTone(kind: string | null | undefined): string {
  if (kind === "SUPPORTED_ADAPTER_CANDIDATE") return "success";
  if (kind === "UNSUPPORTED_REVIEWABLE" || kind === "AMBIGUOUS_REVIEW_REQUIRED") return "warning";
  if (kind === "UNSAFE_OR_INVALID" || kind === "NON_SOURCE_RESULT") return "danger";
  return "neutral";
}

export function classificationReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "Sin motivo registrado";
  const labels: Record<string, string> = {
    NO_CAPABILITY: "No hay adaptador compatible",
    ADAPTER_NOT_REGISTERED: "El adaptador no está registrado",
    KNOWN_FAMILY_UNSUPPORTED_PATH: "Ruta no admitida por el adaptador",
    AMBIGUOUS_CAPABILITY: "Compatibilidad no confirmada",
    MODIFIED_URL: "La URL requiere comprobación",
    EXACT_SUPPORTED_URL: "URL compatible con el adaptador",
    EXACT_KNOWN_SOURCE: "Fuente identificada previamente",
    NON_SOURCE_ENDPOINT: "El resultado no corresponde a una fuente",
  };
  return labels[reason] ?? reason;
}

export function sourceCandidateGuidance(candidate: DiscoveryCandidate): string {
  if (candidate.reviewStatus === "REJECTED") return "Rechazada; se conserva el historial de la decisión.";
  if (candidate.linkedSourceId)
    return "Vinculada a una fuente B2; esto no implica captación ni publicación automática.";
  if (candidate.reviewStatus === "APPROVED")
    return "Aprobación registrada; todavía no consta una fuente B2 vinculada. No asumir promoción, captación ni publicación.";
  switch (candidate.classification?.kind) {
    case "SUPPORTED_ADAPTER_CANDIDATE":
      return "Compatibilidad técnica detectada. La aprobación requiere una revisión administrativa posterior.";
    case "UNSUPPORTED_REVIEWABLE":
      return "Conservar para estudiar un adaptador; todavía no puede pasar a captura B2.";
    case "AMBIGUOUS_REVIEW_REQUIRED":
      return "Comprobar manualmente la URL y su procedencia antes de tomar una decisión.";
    case "UNSAFE_OR_INVALID":
    case "NON_SOURCE_RESULT":
      return "No es apta para promoción; requiere evaluación o descarte.";
    default:
      return "Candidato a fuente pendiente de evaluación; no es un evento publicado.";
  }
}
