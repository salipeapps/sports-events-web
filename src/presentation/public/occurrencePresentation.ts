import type { PublicLocation, PublicOccurrence, PublicPrice } from "@/domain/publicCatalog";

/** Shared public wording. Unknown values stay "por confirmar"; nothing is inferred or invented. */
export const madridStart = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
export const madridShortDate = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "numeric",
  month: "short",
});
export const madridTime = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  hour: "2-digit",
  minute: "2-digit",
});
const madridLocalDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const categoryLabels: Record<string, string> = {
  yoga: "Yoga",
  running: "Running",
  hiking: "Senderismo",
  cycling: "Ciclismo",
  fitness: "Fitness",
  swimming: "Natación",
  dance: "Baile",
  other: "Otros deportes",
};

const scopes = {
  per_session: "por sesión",
  first_session_only: "primera sesión",
  per_month: "al mes",
  per_year: "al año",
  membership: "afiliación",
  transport: "transporte",
  other: "otra modalidad",
  unknown: "periodicidad por confirmar",
};

export const locationRoleLabels: Record<PublicLocation["role"], string> = {
  activity: "Lugar",
  meeting_point: "Punto de encuentro",
  departure: "Salida",
  destination: "Destino",
};

/** Display order: where the visitor must be first, then the excursion destination last. */
const roleOrder: PublicLocation["role"][] = ["activity", "meeting_point", "departure", "destination"];

export function orderedLocations(locations: PublicLocation[]): PublicLocation[] {
  return [...locations].sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));
}

export function locationText(location: PublicLocation): string {
  return (
    [location.pointName, location.address, location.neighborhood, location.municipality].filter(Boolean).join(" · ") ||
    "Lugar por confirmar"
  );
}

/**
 * A named area (park, neighbourhood, square) is not proof of the exact meeting point.
 * Only add a WhatsApp reminder when the published arrival locations have neither
 * an address nor coordinates. Do not infer or expose a private meeting location.
 */
export function needsWhatsAppMeetingPointConfirmation(
  occurrence: Pick<PublicOccurrence, "locations" | "registration">,
): boolean {
  if (occurrence.registration?.method !== "WHATSAPP") return false;
  const arrivalLocations = occurrence.locations.filter((location) => location.role !== "destination");
  return (
    arrivalLocations.length > 0 &&
    arrivalLocations.every((location) => !location.address && location.latitude === null && location.longitude === null)
  );
}

export const whatsAppMeetingPointReminder =
  "Confirma con el organizador por WhatsApp el punto de encuentro exacto antes de acudir.";

export function categoryLabel(category: string | null): string {
  return category ? (categoryLabels[category] ?? category) : "Categoría por confirmar";
}

export function languageLabel(language: string | null): string {
  return language
    ? ({ es: "Español", en: "Inglés", ca: "Valenciano", other: "Otro idioma" }[language] ?? language)
    : "Idioma por confirmar";
}

export function priceLabel(price: PublicPrice): string {
  if (price.type === "unknown") return "Precio por confirmar";
  if (price.type === "free") return `Gratis · ${scopes[price.scope]}`;
  if (price.type === "donation" && price.amount === null) return `Donación voluntaria · ${scopes[price.scope]}`;
  if (price.amount === null || price.currency === null) return "Precio por confirmar";
  const amount = new Intl.NumberFormat("es-ES", { style: "currency", currency: price.currency }).format(price.amount);
  const prefix = {
    from: "Desde ",
    donation: "Donación ",
    trial: "Prueba ",
    early_bird: "Anticipada ",
    membership: "Cuota ",
    subscription: "Suscripción ",
    fixed: "",
  }[price.type];
  return `${prefix}${amount} · ${scopes[price.scope]}`;
}

export function transportLabel(price: PublicPrice): string | null {
  return price.transportCost === "included"
    ? "Transporte incluido"
    : price.transportCost === "excluded"
      ? "Transporte no incluido"
      : null;
}

/** Only price options whose validity contains the activity's Madrid calendar date. */
export function currentPrices(occurrence: Pick<PublicOccurrence, "prices" | "startInstant">): PublicPrice[] {
  const localDate = madridLocalDate.format(new Date(occurrence.startInstant));
  return occurrence.prices.filter(
    (price) => (!price.validFrom || price.validFrom <= localDate) && (!price.validTo || price.validTo >= localDate),
  );
}

export function sameMadridDay(a: string, b: string): boolean {
  return madridLocalDate.format(new Date(a)) === madridLocalDate.format(new Date(b));
}

export function occurrenceHref(id: string): string {
  return `/actividades/${id}`;
}
