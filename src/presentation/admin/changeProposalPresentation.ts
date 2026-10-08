import type { ActivityCategory, ChangeField, EventDetails, FieldValue, Organizer, PriceDetails } from "@/domain/admin";
import { categoryLabels, displayField, formatLocalDateTime } from "./adminPresentation";
import { formatObservedPrice } from "./candidateReviewForm";

export const changeFieldLabels: Record<keyof EventDetails, string> = {
  title: "Título",
  description: "Descripción",
  category: "Categoría",
  startLocal: "Fecha y hora de inicio",
  endLocal: "Fecha y hora de fin",
  timezone: "Zona horaria",
  location: "Ubicación",
  departureCity: "Ciudad de salida",
  destination: "Destino",
  organizerId: "Organizador",
  price: "Precio",
  languages: "Idiomas",
  level: "Nivel",
  registrationUrl: "Registro",
  individualAccess: "Acceso individual",
};

export function formatChangeFieldValue(change: ChangeField, side: "before" | "after", organizers: Organizer[]): string {
  const field: FieldValue<unknown> = change[side];
  return displayField(field, (value) => {
    if (change.field === "price") return formatObservedPrice(value as PriceDetails);
    if (change.field === "category") return categoryLabels[value as ActivityCategory] ?? String(value);
    if (change.field === "organizerId") {
      const id = String(value);
      return organizers.find((organizer) => organizer.id === id)?.name ?? id;
    }
    if ((change.field === "startLocal" || change.field === "endLocal") && typeof value === "string") {
      return formatLocalDateTime(value);
    }
    if (typeof value === "boolean") return value ? "Sí" : "No";
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}
