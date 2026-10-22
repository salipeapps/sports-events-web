import "server-only";

import { isCatalogInstant } from "@/domain/publicCatalog";

import type {
  CatalogPage,
  CatalogQuery,
  PublicCatalogRepository,
  PublicLocation,
  PublicOccurrence,
  PublicPrice,
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

function text(value: unknown, max = 250): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f<>]/.test(value))
    return incompatible();
  return value;
}

function nullableText(value: unknown, max = 250): string | null {
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
  return {
    role: enumValue(item.role, ["venue", "departure", "destination"]),
    municipality: nullableText(item.municipality),
    neighborhood: nullableText(item.neighborhood),
    pointName: nullableText(item.pointName),
    address: nullableText(item.address),
  };
}

function price(value: unknown): PublicPrice {
  const item = record(value);
  const type = enumValue(item.type, ["free", "fixed", "from", "unknown"]);
  const scope = enumValue(item.scope, ["session", "month", "year", "unknown"]);
  const amount = item.amount;
  const currency = nullableText(item.currency, 3);
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) return incompatible();
  if (amount !== null && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) return incompatible();
  if (type === "free" && amount !== null && amount !== 0) return incompatible();
  if ((type === "fixed" || type === "from") && (amount === null || currency === null)) return incompatible();
  return { type, scope, amount: amount as number | null, currency, conditions: nullableText(item.conditions, 500) };
}

function occurrence(value: unknown): PublicOccurrence {
  const item = record(value);
  // Only explicitly public fields are reconstructed; never spread provider objects into the page.
  if (item.contractVersion !== 1 || item.timeZone !== "Europe/Madrid" || !uuid.test(text(item.id)))
    return incompatible();
  const startInstant = instant(item.startInstant);
  const endInstant = item.endInstant === null ? null : instant(item.endInstant);
  if (endInstant !== null && Date.parse(endInstant) <= Date.parse(startInstant)) return incompatible();
  return {
    id: item.id as string,
    title: text(item.title),
    organizerName: nullableText(item.organizerName),
    startInstant,
    endInstant,
    registrationUrl: registrationUrl(item.registrationUrl),
    activityLanguage: nullableText(item.activityLanguage, 100),
    // Optional extensions pending #122. Never infer them from titles or private B1 data.
    category: item.category === undefined ? null : nullableText(item.category, 100),
    level: item.level === undefined ? null : nullableText(item.level, 100),
    locations: array(item.locations, 8, location),
    prices: array(item.prices, 12, price),
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
  return { items: items.filter((item) => Date.parse(item.startInstant) >= now.getTime()), nextCursor };
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

/** Provisional H0 consumer; Engine #122 must confirm SQL/nested shapes before remote activation. */
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
