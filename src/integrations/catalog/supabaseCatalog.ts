import "server-only";

import { isCatalogInstant } from "@/domain/publicCatalog";

import type {
  CatalogPage,
  CatalogQuery,
  PublicCatalogRepository,
  PublicLocation,
  PublicOccurrence,
  PublicPrice,
  CatalogTranslations,
} from "@/domain/publicCatalog";

const maxBytes = 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cursorPattern = /^[A-Za-z0-9_-]{1,2048}$/;

export class CatalogReadError extends Error {
  constructor(public readonly code: "INVALID_REQUEST" | "READ_UNAVAILABLE" | "INCOMPATIBLE_CONTRACT") {
    super(code);
  }
}

function incompatible(): never {
  throw new CatalogReadError("INCOMPATIBLE_CONTRACT");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return incompatible();
  return value as Record<string, unknown>;
}

function text(value: unknown, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f<>]/.test(value))
    return incompatible();
  return value;
}

function nullableText(value: unknown, max = 500): string | null {
  return value === null ? null : text(value, max);
}

function instant(value: unknown): string {
  const result = text(value, 40);
  if (!isCatalogInstant(result)) return incompatible();
  return result;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) return incompatible();
  return value as T;
}

function array<T>(value: unknown, max: number, decode: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) return incompatible();
  return value.map(decode);
}

/** Never turn arbitrary provider URLs, credentials or tracking tokens into public links. */
function registrationUrl(value: unknown): string | null {
  if (value === null) return null;
  const candidate = text(value, 2048);
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return incompatible();
    for (const name of url.searchParams.keys()) {
      if (/token|secret|key|auth|email|session|signature|password/i.test(name)) return incompatible();
    }
    return url.href;
  } catch {
    return incompatible();
  }
}

function location(value: unknown): PublicLocation {
  const item = record(value);
  const latitude = item.latitude,
    longitude = item.longitude;
  if ((latitude === null) !== (longitude === null)) return incompatible();
  if (
    latitude !== null &&
    (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90)
  )
    return incompatible();
  if (
    longitude !== null &&
    (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)
  )
    return incompatible();
  return {
    role: enumValue(item.role, ["activity", "meeting_point", "departure", "destination"]),
    municipality: nullableText(item.municipality),
    neighborhood: nullableText(item.neighborhood),
    pointName: nullableText(item.pointName),
    address: nullableText(item.address),
    latitude: latitude as number | null,
    longitude: longitude as number | null,
  };
}

function translations(value: unknown): CatalogTranslations {
  const item = record(value);
  return { es: nullableText(item.es), en: nullableText(item.en) };
}

function priceDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !isCatalogInstant(`${value}T00:00:00Z`))
    return incompatible();
  return value;
}

function price(value: unknown): PublicPrice {
  const item = record(value);
  const type = enumValue(item.type, [
    "free",
    "fixed",
    "donation",
    "trial",
    "early_bird",
    "from",
    "membership",
    "subscription",
  ]);
  const scope = enumValue(item.scope, [
    "per_session",
    "first_session_only",
    "per_month",
    "per_year",
    "membership",
    "transport",
    "other",
  ]);
  const amount = item.amount;
  const currency = nullableText(item.currency, 3);
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) return incompatible();
  if (amount !== null && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) return incompatible();
  if ((amount === null) !== (currency === null)) return incompatible();
  if (type === "free" && amount !== null) return incompatible();
  if (type !== "free" && type !== "donation" && amount === null) return incompatible();
  const validFrom = priceDate(item.validFrom),
    validTo = priceDate(item.validTo);
  if (validFrom !== null && validTo !== null && validTo < validFrom) return incompatible();
  return {
    type,
    scope,
    amount: amount as number | null,
    currency,
    conditions: nullableText(item.conditions),
    validFrom,
    validTo,
    transportCost: enumValue(item.transportCost, ["included", "excluded", "not_applicable", "unknown"]),
  };
}

function occurrence(value: unknown): PublicOccurrence & {
  status: "upcoming" | "in_progress";
  lastVerifiedAt: string;
  verifiedUntil: string;
} {
  const item = record(value);
  // Only explicitly public fields are reconstructed; never spread provider objects into the page.
  if (item.contractVersion !== 1 || item.timeZone !== "Europe/Madrid" || !uuid.test(text(item.id)))
    return incompatible();
  const startInstant = instant(item.startInstant);
  const endInstant = item.endInstant === null ? null : instant(item.endInstant);
  const status = enumValue(item.status, ["upcoming", "in_progress"]);
  const lastVerifiedAt = instant(item.lastVerifiedAt);
  const verifiedUntil = instant(item.verifiedUntil);
  if (endInstant !== null && Date.parse(endInstant) <= Date.parse(startInstant)) return incompatible();
  if (Date.parse(verifiedUntil) <= Date.parse(lastVerifiedAt)) return incompatible();
  return {
    id: item.id as string,
    title: text(item.title),
    organizerName: nullableText(item.organizerName),
    startInstant,
    endInstant,
    status,
    registrationUrl: registrationUrl(item.registrationUrl),
    activityLanguage: nullableText(item.activityLanguage, 100),
    category: enumValue(item.category, [
      "yoga",
      "running",
      "hiking",
      "cycling",
      "fitness",
      "swimming",
      "dance",
      "other",
    ]),
    level: translations(item.level),
    titleTranslations: translations(item.titleTranslations),
    requirements: translations(item.requirements),
    lastVerifiedAt,
    verifiedUntil,
    locations: array(item.locations, 8, location),
    prices: array(item.prices, 8, price),
    updatedAt: instant(item.updatedAt),
  };
}

export function validateCatalogQuery(query: CatalogQuery) {
  const from = Date.parse(query.desde);
  const to = Date.parse(query.hasta);
  if (
    !isCatalogInstant(query.desde) ||
    !isCatalogInstant(query.hasta) ||
    to <= from ||
    to - from > 31 * 86_400_000 ||
    !Number.isInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > 100 ||
    (query.cursor !== null && !cursorPattern.test(query.cursor))
  )
    throw new CatalogReadError("INVALID_REQUEST");
}

export function decodeCatalogPage(value: unknown, query: CatalogQuery, now: Date): CatalogPage {
  const data = record(value);
  if (data.contractVersion !== 1) return incompatible();
  const items = array(data.items, query.limit, occurrence);
  const nextCursor = data.nextCursor === null ? null : text(data.nextCursor, 2048);
  if (nextCursor !== null && (!cursorPattern.test(nextCursor) || nextCursor === query.cursor || items.length === 0))
    return incompatible();
  const seen = new Set<string>();
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const previous = items[index - 1];
    if (
      seen.has(item.id) ||
      Date.parse(item.startInstant) < Date.parse(query.desde) ||
      Date.parse(item.startInstant) >= Date.parse(query.hasta)
    )
      return incompatible();
    if (
      previous &&
      (Date.parse(item.startInstant) < Date.parse(previous.startInstant) ||
        (Date.parse(item.startInstant) === Date.parse(previous.startInstant) && item.id <= previous.id))
    )
      return incompatible();
    seen.add(item.id);
  }
  // The public list promises upcoming starts. Past/ongoing events belong to a later detail experience.
  return {
    items: items.filter(
      (item) =>
        item.status === "upcoming" &&
        Date.parse(item.startInstant) >= now.getTime() &&
        Date.parse(item.lastVerifiedAt) <= now.getTime() &&
        Date.parse(item.verifiedUntil) > now.getTime(),
    ),
    nextCursor,
  };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > maxBytes || !response.body) {
    await response.body?.cancel();
    throw new CatalogReadError("READ_UNAVAILABLE");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new CatalogReadError("READ_UNAVAILABLE");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** H2 public RPC contract, verified directly in STAGING by Engine #139. */
export class SupabasePublicCatalogRepository implements PublicCatalogRepository {
  constructor(
    private readonly config: { url: string; key: string },
    private readonly request: typeof fetch = fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {
    const url = new URL(config.url);
    if (
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.key) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      !(
        (url.protocol === "https:" && /^[a-z0-9]+\.supabase\.co$/.test(url.hostname)) ||
        (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      )
    ) {
      throw new CatalogReadError("READ_UNAVAILABLE");
    }
  }

  async list(query: CatalogQuery): Promise<CatalogPage> {
    validateCatalogQuery(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.request(`${this.config.url}/rest/v1/rpc/catalog_occurrences_v1`, {
        method: "POST",
        headers: {
          apikey: this.config.key,
          "Content-Type": "application/json",
          "Accept-Profile": "api",
          "Content-Profile": "api",
        },
        body: JSON.stringify(query),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new CatalogReadError(response.status === 400 ? "INVALID_REQUEST" : "READ_UNAVAILABLE");
      }
      return decodeCatalogPage(await readBoundedJson(response), query, this.clock());
    } catch (error) {
      if (error instanceof CatalogReadError) throw error;
      throw new CatalogReadError("READ_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}
