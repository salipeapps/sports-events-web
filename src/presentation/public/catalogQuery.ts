import type { CatalogQuery } from "@/domain/publicCatalog";
import {
  catalogCategories,
  catalogFilterLimits,
  catalogLanguages,
  isCatalogInstant,
  isCatalogMaxPrice,
  isCatalogSearchText,
} from "@/domain/publicCatalog";

export { catalogCategories, catalogLanguages };

export type CatalogSearchParams = Record<string, string | string[] | undefined>;
const zone = "Europe/Madrid";
const calendarParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parts(date: Date) {
  return Object.fromEntries(calendarParts.formatToParts(date).map(({ type, value }) => [type, value]));
}

/** Calendar arithmetic in Madrid, including the 23/25-hour DST days. */
export function madridMidnight(year: number, month: number, day: number): Date {
  const wall = Date.UTC(year, month - 1, day);
  let instant = wall;
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = parts(new Date(instant));
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    instant += wall - represented;
  }
  return new Date(instant);
}

export function monthKey(year: number, month: number) {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type CatalogPeriod = "hoy" | "manana" | "finde";
export type CatalogPrice = "sesion" | "sin-sesion";

/**
 * Server-side filters only. Values of one dimension are OR, dimensions are AND; nothing is
 * filtered or invented in the browser. Empty arrays/null/false mean "no filter".
 */
export interface CatalogFilters {
  q: string | null;
  categorias: string[];
  municipios: string[];
  barrios: string[];
  idiomas: string[];
  niveles: string[];
  gratis: boolean;
  precioMax: number | null;
  precio: CatalogPrice | null;
}

const periods: CatalogPeriod[] = ["hoy", "manana", "finde"];
const periodLabels: Record<CatalogPeriod, string> = { hoy: "Hoy", manana: "Mañana", finde: "Este fin de semana" };
export const emptyFilters: CatalogFilters = {
  q: null,
  categorias: [],
  municipios: [],
  barrios: [],
  idiomas: [],
  niveles: [],
  gratis: false,
  precioMax: null,
  precio: null,
};

export interface CatalogScope {
  month?: string | null;
  period?: CatalogPeriod | null;
  filters?: CatalogFilters;
}

export interface CatalogSelection {
  query: CatalogQuery;
  month: string | null;
  period: CatalogPeriod | null;
  filters: CatalogFilters;
  currentMonth: string;
  previousMonth: string | null;
  nextMonth: string | null;
  label: string;
  at: string;
  tail: boolean;
  hasTail: boolean;
}

const collapse = (value: string) => value.trim().replace(/\s+/g, " ");

/** A single optional string; an empty form field means "no filter". Repeated values are rejected. */
function optional(value: string | string[] | undefined): string | null | undefined {
  if (value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = collapse(value);
  return trimmed === "" ? null : trimmed;
}

/**
 * Repeated parameters and comma-separated text both add values (`municipio=València,Alboraia`).
 * Exact duplicates collapse and empty entries are ignored; too many or any invalid value rejects.
 */
function many(value: string | string[] | undefined, max: number, valid: (value: string) => boolean): string[] | null {
  if (value === undefined) return [];
  const values: string[] = [];
  for (const raw of typeof value === "string" ? [value] : value)
    for (const piece of raw.split(",")) {
      const item = collapse(piece);
      if (item && !values.includes(item)) values.push(item);
    }
  return values.length <= max && values.every(valid) ? values : null;
}

// Conservative public place names: a letter first, then letters, spaces and name punctuation.
const placeName = /^[\p{L}\p{M}][\p{L}\p{M} .'’()·-]*$/u;
// Editorial level labels may carry digits ("Nivel 2") or ranges ("iniciación/intermedio").
const levelName = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .'’()·/+-]*$/u;
const bounded = (pattern: RegExp) => (value: string) =>
  value.length <= catalogFilterLimits.valueLength && pattern.test(value);

function maxPrice(value: string | string[] | undefined): number | null | undefined {
  const text = optional(value);
  if (text === null || text === undefined) return text;
  if (!/^\d{1,5}(?:[.,]\d{1,2})?$/.test(text)) return undefined;
  const amount = Number(text.replace(",", "."));
  return isCatalogMaxPrice(amount) ? amount : undefined;
}

/** Validated filters, or null when any value is malformed (the page then shows "búsqueda no válida"). */
export function parseFilters(params: CatalogSearchParams): CatalogFilters | null {
  const q = optional(params.q);
  const categorias = many(params.categoria, catalogFilterLimits.categorias, (value) =>
    catalogCategories.includes(value),
  );
  const idiomas = many(params.idioma, catalogFilterLimits.idiomas, (value) => catalogLanguages.includes(value));
  const municipios = many(params.municipio, catalogFilterLimits.municipios, bounded(placeName));
  const barrios = many(params.barrio, catalogFilterLimits.barrios, bounded(placeName));
  const niveles = many(params.nivel, catalogFilterLimits.niveles, bounded(levelName));
  const gratis = optional(params.gratis);
  const precioMax = maxPrice(params["precio-max"]);
  const precio = optional(params.precio);
  if (
    q === undefined ||
    (q !== null && !isCatalogSearchText(q)) ||
    !categorias ||
    !idiomas ||
    !municipios ||
    !barrios ||
    !niveles ||
    (gratis !== null && gratis !== "1") ||
    precioMax === undefined ||
    precio === undefined ||
    (precio !== null && precio !== "sesion" && precio !== "sin-sesion")
  )
    return null;
  return {
    q,
    categorias,
    municipios,
    barrios,
    idiomas,
    niveles,
    gratis: gratis === "1",
    precioMax,
    precio: precio as CatalogPrice | null,
  };
}

/** Canonical URL entries, also used for hidden fields so every form and link keeps the search. */
export function filterEntries(filters: CatalogFilters): [string, string][] {
  const entries: [string, string][] = [];
  if (filters.q) entries.push(["q", filters.q]);
  for (const value of filters.categorias) entries.push(["categoria", value]);
  for (const value of filters.municipios) entries.push(["municipio", value]);
  for (const value of filters.barrios) entries.push(["barrio", value]);
  for (const value of filters.idiomas) entries.push(["idioma", value]);
  for (const value of filters.niveles) entries.push(["nivel", value]);
  if (filters.gratis) entries.push(["gratis", "1"]);
  if (filters.precioMax !== null) entries.push(["precio-max", String(filters.precioMax)]);
  if (filters.precio) entries.push(["precio", filters.precio]);
  return entries;
}

export function hasFilters(filters: CatalogFilters): boolean {
  return filterEntries(filters).length > 0;
}

/** True when the search needs `catalog_occurrences_v3` (text, OR within a dimension or new filters). */
export function needsAdvancedFilters(filters: CatalogFilters): boolean {
  return (
    filters.q !== null ||
    filters.barrios.length > 0 ||
    filters.niveles.length > 0 ||
    filters.gratis ||
    filters.precioMax !== null ||
    [filters.categorias, filters.municipios, filters.idiomas].some((values) => values.length > 1)
  );
}

function filterQuery(filters: CatalogFilters): Partial<CatalogQuery> {
  return {
    ...(filters.q !== null ? { q: filters.q } : {}),
    ...(filters.categorias.length ? { categorias: filters.categorias } : {}),
    ...(filters.municipios.length ? { municipios: filters.municipios } : {}),
    ...(filters.barrios.length ? { barrios: filters.barrios } : {}),
    ...(filters.idiomas.length ? { idiomas: filters.idiomas } : {}),
    ...(filters.niveles.length ? { niveles: filters.niveles } : {}),
    ...(filters.gratis ? { gratis: true as const } : {}),
    ...(filters.precioMax !== null ? { precioMax: filters.precioMax } : {}),
    ...(filters.precio !== null ? { precioComparable: filters.precio === "sesion" } : {}),
  };
}

function weekday(date: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Madrid calendar ranges for the presets. Starts already in the past are never requested. */
export function periodRange(period: CatalogPeriod, anchor: Date): { from: Date; to: Date } {
  const a = parts(anchor);
  const day = (offset: number) => madridMidnight(+a.year, +a.month, +a.day + offset);
  if (period === "hoy") return { from: anchor, to: day(1) };
  if (period === "manana") return { from: day(1), to: day(2) };
  // Weekend = Saturday and Sunday. On Saturday or Sunday it starts now, never earlier the same day.
  const wd = weekday(anchor);
  if (wd === 6) return { from: anchor, to: day(2) };
  if (wd === 0) return { from: anchor, to: day(1) };
  return { from: day(6 - wd), to: day(8 - wd) };
}

export function selectCatalog(params: CatalogSearchParams, now = new Date()): CatalogSelection | null {
  const p = parts(now);
  const currentMonth = monthKey(+p.year, +p.month);
  const month = params.month ?? null;
  const cursor = params.cursor ?? null;
  const at = params.at ?? now.toISOString();
  const filters = parseFilters(params);
  if (!filters) return null;
  if (!isCatalogInstant(at) || !at.endsWith("Z")) return null;
  const anchor = new Date(at);
  if (!Number.isFinite(anchor.getTime()) || anchor > now || now.getTime() - anchor.getTime() > 86_400_000) return null;
  if (params.tail !== undefined && params.tail !== "1") return null;
  const tail = params.tail === "1";
  if (month !== null && (typeof month !== "string" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))) return null;
  if (cursor !== null && (typeof cursor !== "string" || !/^[A-Za-z0-9_-]{1,2048}$/.test(cursor))) return null;
  const rawPeriod = params.periodo ?? null;
  if (rawPeriod !== null && (typeof rawPeriod !== "string" || !periods.includes(rawPeriod as CatalogPeriod)))
    return null;
  const period = rawPeriod as CatalogPeriod | null;
  if (period && month) return null;
  const year = month ? +month.slice(0, 4) : +p.year;
  const selectedMonth = month ? +month.slice(5) : +p.month;
  if (month && month < currentMonth) return null;
  const a = parts(anchor);
  const range = period ? periodRange(period, anchor) : null;
  const from = range
    ? range.from
    : month
      ? new Date(Math.max(anchor.getTime(), madridMidnight(year, selectedMonth, 1).getTime()))
      : anchor;
  const to = range
    ? range.to
    : month
      ? madridMidnight(year, selectedMonth + 1, 1)
      : madridMidnight(+a.year, +a.month, +a.day + 7);
  // October may exceed the RPC's 31 exact days. Paginate its last local day as a second segment.
  const hasTail = to.getTime() - from.getTime() > 31 * 86_400_000;
  if (tail && !hasTail) return null;
  const boundary = hasTail ? madridMidnight(year, selectedMonth, 31) : to;
  return {
    query: {
      desde: (tail ? boundary : from).toISOString(),
      hasta: (tail ? to : boundary).toISOString(),
      cursor,
      limit: 24,
      ...filterQuery(filters),
    },
    month,
    period,
    filters,
    currentMonth,
    previousMonth: month && month > currentMonth ? monthKey(year, selectedMonth - 1) : null,
    nextMonth: monthKey(year, selectedMonth + 1) <= "2099-12" ? monthKey(year, selectedMonth + 1) : null,
    at,
    tail,
    hasTail,
    label: period
      ? periodLabels[period]
      : month
        ? new Intl.DateTimeFormat("es-ES", { timeZone: zone, month: "long", year: "numeric" }).format(
            madridMidnight(year, selectedMonth, 15),
          )
        : "Próximos 7 días",
  };
}

/**
 * Shareable catalogue link. The RPC binds cursors to the exact range and filters, so every
 * pagination link carries the same filters, period/month and `at` anchor.
 */
export function catalogHref(
  scope: CatalogScope | string | null = null,
  cursor: string | null = null,
  at?: string,
  tail = false,
) {
  const {
    month = null,
    period = null,
    filters = emptyFilters,
  } = typeof scope === "string" || scope === null ? { month: scope } : scope;
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (period) params.set("periodo", period);
  for (const [name, value] of filterEntries(filters)) params.append(name, value);
  if (cursor) params.set("cursor", cursor);
  if (at) params.set("at", at);
  if (tail) params.set("tail", "1");
  return params.size ? `/?${params}#activities` : "/#activities";
}

/**
 * Catalogue URL a visitor came from, so "Volver a la agenda" keeps month, period, filters and
 * page. Only a same-origin home URL qualifies; its query is revalidated by the home itself.
 */
export function catalogReturnHref(referrer: string, origin: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.origin !== origin || url.pathname !== "/") return null;
    return `/${url.search}#activities`;
  } catch {
    return null;
  }
}
