/** Public data only. This contract never references editorial candidates or evidence. */
export interface CatalogTranslations {
  es: string | null;
  en: string | null;
}

export interface PublicLocation {
  role: "activity" | "meeting_point" | "departure" | "destination";
  municipality: string | null;
  neighborhood: string | null;
  pointName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PublicPrice {
  type: "free" | "fixed" | "donation" | "trial" | "early_bird" | "from" | "membership" | "subscription" | "unknown";
  scope:
    "per_session" | "first_session_only" | "per_month" | "per_year" | "membership" | "transport" | "other" | "unknown";
  amount: number | null;
  currency: string | null;
  conditions: string | null;
  validFrom: string | null;
  validTo: string | null;
  transportCost: "included" | "excluded" | "not_applicable" | "unknown";
}

export interface PublicOccurrence {
  registration?: import("./registration").PublicRegistration;
  sourceUrl?: string;
  id: string;
  title: string;
  organizerName: string | null;
  startInstant: string;
  endInstant: string | null;
  status?: "upcoming" | "in_progress";
  registrationUrl: string | null;
  activityLanguage: string | null;
  category: string | null;
  level: CatalogTranslations | null;
  titleTranslations?: CatalogTranslations;
  requirements?: CatalogTranslations;
  lastVerifiedAt?: string;
  verifiedUntil?: string;
  locations: PublicLocation[];
  prices: PublicPrice[];
  updatedAt: string;
}

export interface CatalogQuery {
  desde: string;
  hasta: string;
  cursor: string | null;
  limit: number;
  /**
   * Optional server-side filters; omitted keys mean "no filter" (RPC defaults null). Values of one
   * dimension combine with OR, dimensions with AND. Contracts v1/v2 accept at most one value of
   * `categorias`/`municipios`/`idiomas` plus `precioComparable`; anything else needs v3 and is
   * rejected, never silently dropped, on older contracts.
   */
  q?: string;
  categorias?: string[];
  municipios?: string[];
  barrios?: string[];
  idiomas?: string[];
  niveles?: string[];
  gratis?: true;
  precioMax?: number;
  precioComparable?: boolean;
}

export const catalogCategories = ["yoga", "running", "hiking", "cycling", "fitness", "swimming", "dance", "other"];
export const catalogLanguages = ["es", "en", "ca", "other"];
/** Engine V035 bounds for `catalog_occurrences_v3`. */
export const catalogFilterLimits = {
  categorias: catalogCategories.length,
  idiomas: catalogLanguages.length,
  municipios: 10,
  barrios: 10,
  niveles: 10,
  valueLength: 100,
  qLength: 100,
  qTerms: 6,
  precioMax: 10_000,
} as const;

export const unsafeCatalogText = /[\u0000-\u001f\u007f<>]/;

/** Mirrors Engine V035: 2–100 characters, 1–6 whitespace-separated terms of at least 2 characters. */
export function isCatalogSearchText(value: unknown): value is string {
  if (typeof value !== "string" || value.length > catalogFilterLimits.qLength || unsafeCatalogText.test(value))
    return false;
  const terms = value.trim().split(/\s+/).filter(Boolean);
  return (
    terms.length >= 1 && terms.length <= catalogFilterLimits.qTerms && terms.every((term) => [...term].length >= 2)
  );
}

export function isCatalogMaxPrice(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= catalogFilterLimits.precioMax &&
    Math.abs(Math.round(value * 100) - value * 100) < 1e-6
  );
}

export interface CatalogPage {
  items: PublicOccurrence[];
  nextCursor: string | null;
}

export type CatalogResult = ({ status: "ready" } & CatalogPage) | { status: "disabled" | "unavailable" | "invalid" };

/**
 * Public detail of one projected occurrence. A missing, withdrawn, suspended, cancelled or expired
 * occurrence is indistinguishable by design: the projection only ever contains publishable rows.
 */
export type OccurrenceResult =
  | { status: "ready"; occurrence: PublicOccurrence & { status: "upcoming" | "in_progress" } }
  | { status: "not_found" | "disabled" | "unavailable" };

export interface PublicCatalogRepository {
  list(query: CatalogQuery): Promise<CatalogPage>;
  get(id: string): Promise<PublicOccurrence & { status: "upcoming" | "in_progress" }>;
}

/** Date.parse alone normalizes impossible dates such as February 30. */
export function isCatalogInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match;
  const monthDays = new Date(Date.UTC(2000 + (+year % 400), +month, 0)).getUTCDate();
  return (
    +month >= 1 &&
    +month <= 12 &&
    +day >= 1 &&
    +day <= monthDays &&
    +hour < 24 &&
    +minute < 60 &&
    +second < 60 &&
    Number.isFinite(Date.parse(value))
  );
}
