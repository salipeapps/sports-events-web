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
