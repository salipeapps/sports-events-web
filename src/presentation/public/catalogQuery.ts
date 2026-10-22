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

export interface CatalogSelection {
  query: CatalogQuery;
  month: string | null;
  currentMonth: string;
  previousMonth: string | null;
  nextMonth: string | null;
  label: string;
  at: string;
  tail: boolean;
  hasTail: boolean;
}

export function selectCatalog(params: CatalogSearchParams, now = new Date()): CatalogSelection | null {
  const p = parts(now);
  const currentMonth = monthKey(+p.year, +p.month);
  const month = params.month ?? null;
  const cursor = params.cursor ?? null;
  const at = params.at ?? now.toISOString();
  if (!isCatalogInstant(at) || !at.endsWith("Z")) return null;
  const anchor = new Date(at);
  if (!Number.isFinite(anchor.getTime()) || anchor > now || now.getTime() - anchor.getTime() > 86_400_000) return null;
  if (params.tail !== undefined && params.tail !== "1") return null;
  const tail = params.tail === "1";
  if (month !== null && (typeof month !== "string" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))) return null;
  if (cursor !== null && (typeof cursor !== "string" || !/^[A-Za-z0-9_-]{1,2048}$/.test(cursor))) return null;
  const year = month ? +month.slice(0, 4) : +p.year;
  const selectedMonth = month ? +month.slice(5) : +p.month;
  if (month && month < currentMonth) return null;
  const a = parts(anchor);
  const from = month ? new Date(Math.max(anchor.getTime(), madridMidnight(year, selectedMonth, 1).getTime())) : anchor;
  const to = month ? madridMidnight(year, selectedMonth + 1, 1) : madridMidnight(+a.year, +a.month, +a.day + 7);
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
    },
    month,
    currentMonth,
    previousMonth: month && month > currentMonth ? monthKey(year, selectedMonth - 1) : null,
    nextMonth: monthKey(year, selectedMonth + 1) <= "2099-12" ? monthKey(year, selectedMonth + 1) : null,
    at,
    tail,
    hasTail,
    label: month
      ? new Intl.DateTimeFormat("es-ES", { timeZone: zone, month: "long", year: "numeric" }).format(
          madridMidnight(year, selectedMonth, 15),
        )
      : "Próximos 7 días",
  };
}

export function catalogHref(month: string | null, cursor: string | null = null, at?: string, tail = false) {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (cursor) params.set("cursor", cursor);
  if (at) params.set("at", at);
  if (tail) params.set("tail", "1");
  return params.size ? `/?${params}#activities` : "/#activities";
}
