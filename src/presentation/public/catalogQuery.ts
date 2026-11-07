import type { CatalogQuery } from "@/domain/publicCatalog";
import { isCatalogInstant } from "@/domain/publicCatalog";

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

/** Only the dimensions the H2 RPC filters server-side. Nothing is filtered or invented in the browser. */
export interface CatalogFilters {
  categoria: string | null;
  municipio: string | null;
  idioma: string | null;
  precio: CatalogPrice | null;
}

export const catalogCategories = ["yoga", "running", "hiking", "cycling", "fitness", "swimming", "dance", "other"];
export const catalogLanguages = ["es", "en", "ca", "other"];
const periods: CatalogPeriod[] = ["hoy", "manana", "finde"];
const periodLabels: Record<CatalogPeriod, string> = { hoy: "Hoy", manana: "Mañana", finde: "Este fin de semana" };
export const emptyFilters: CatalogFilters = { categoria: null, municipio: null, idioma: null, precio: null };

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

/** A single optional string; an empty form field means "no filter". Repeated values are rejected. */
function optional(value: string | string[] | undefined): string | null | undefined {
  if (value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed === "" ? null : trimmed;
}

/** Validated filters, or null when any value is malformed (the page then shows "búsqueda no válida"). */
export function parseFilters(params: CatalogSearchParams): CatalogFilters | null {
  const categoria = optional(params.categoria);
  const municipio = optional(params.municipio);
  const idioma = optional(params.idioma);
  const precio = optional(params.precio);
  if (categoria === undefined || municipio === undefined || idioma === undefined || precio === undefined) return null;
  if (categoria !== null && !catalogCategories.includes(categoria)) return null;
  if (idioma !== null && !catalogLanguages.includes(idioma)) return null;
  if (precio !== null && precio !== "sesion" && precio !== "sin-sesion") return null;
  // Same conservative shape the RPC accepts: letters, spaces and name punctuation, at most 100 characters.
  if (municipio !== null && (municipio.length > 100 || !/^[\p{L}\p{M}][\p{L}\p{M} .'’()-]*$/u.test(municipio)))
    return null;
  return { categoria, municipio, idioma, precio: precio as CatalogPrice | null };
}

export function hasFilters(filters: CatalogFilters): boolean {
  return Object.values(filters).some((value) => value !== null);
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
      ...(filters.municipio !== null ? { municipio: filters.municipio } : {}),
      ...(filters.categoria !== null ? { categoria: filters.categoria } : {}),
      ...(filters.idioma !== null ? { idioma: filters.idioma } : {}),
      ...(filters.precio !== null ? { precioComparable: filters.precio === "sesion" } : {}),
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
  if (filters.categoria) params.set("categoria", filters.categoria);
  if (filters.municipio) params.set("municipio", filters.municipio);
  if (filters.idioma) params.set("idioma", filters.idioma);
  if (filters.precio) params.set("precio", filters.precio);
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
