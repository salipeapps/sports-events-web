import type {
  ActivityCategory,
  EditorialStatus,
  FieldValue,
  UnknownReason,
} from "@/domain/admin";

export const categoryLabels: Record<ActivityCategory, string> = {
  pilates: "Pilates",
  yoga: "Yoga",
  fitness: "Fitness",
  dance_fitness: "Dance fitness",
  beach_sports: "Deportes de playa",
  cycling: "Ciclismo",
  team_sports: "Deportes de equipo",
  hiking: "Senderismo",
  water_sports: "Deportes acuáticos",
  padel: "Pádel",
  running: "Running",
  barre: "Barre",
  cross_training: "Cross training",
  multi_sport: "Multideporte",
};

export const statusLabels: Record<EditorialStatus, string> = {
  candidate: "Candidata",
  review: "Revisión",
  blocked: "Bloqueada",
  published: "Publicada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  archived: "Archivada",
};

export type StatusTone = "success" | "info" | "warning" | "danger" | "neutral";

export function statusTone(status: EditorialStatus): StatusTone {
  switch (status) {
    case "published":
      return "success";
    case "candidate":
      return "info";
    case "review":
      return "warning";
    case "blocked":
    case "rejected":
    case "cancelled":
      return "danger";
    case "archived":
      return "neutral";
  }
}

const unknownLabels: Record<UnknownReason, string> = {
  not_observed: "Sin dato",
  not_provided: "No informado",
  not_verified: "No verificado",
  conflict: "En conflicto",
  not_applicable: "No aplica",
};

export function displayField<T>(field: FieldValue<T>, format: (value: T) => string = String): string {
  return field.state === "known" ? format(field.value) : unknownLabels[field.reason];
}

export function formatLocalDateTime(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return value;

  const [, year, month, day, hour = "00", minute = "00"] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));

  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(date);
}
