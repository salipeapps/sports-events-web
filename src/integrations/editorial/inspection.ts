import { isRegistrationDestination, isSafeRegistrationUrl } from "@/domain/registration";
import type { EditorialData, EditorialInspection } from "@/domain/editorial";
import { isCatalogInstant } from "@/domain/publicCatalog";

export class EditorialInspectionError extends Error {}
function invalid(): never {
  throw new EditorialInspectionError("INCOMPATIBLE_CONTRACT");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) invalid();
  return value;
}
function nullableText(value: unknown, max = 500): string | null {
  return value === null ? null : text(value, max);
}
function uuid(value: unknown): string {
  const result = text(value, 36);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(result)) invalid();
  return result;
}
function list<T>(value: unknown, max: number, decode: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) invalid();
  return value.map(decode);
}
function enumeration(value: unknown, allowed: string[]): string {
  const result = text(value, 50);
  if (!allowed.includes(result)) invalid();
  return result;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}
function version(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function instant(value: unknown): string {
  if (!isCatalogInstant(value)) invalid();
  return value as string;
}
function date(value: unknown): string {
  const result = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !isCatalogInstant(result + "T00:00:00Z")) invalid();
  return result;
}
function localTime(value: unknown): string {
  const result = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/.test(result)) invalid();
  return result;
}
function coordinate(value: unknown, max: number): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > max) invalid();
  return value;
}
/** Unsafe evidence URLs are unavailable links; they never become browser navigation. */
function url(value: unknown): string | null {
  if (value === null) return null;
  const input = text(value, 2048);
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash || parsed.port) return null;
    for (const key of parsed.searchParams.keys()) {
      if (/token|secret|key|auth|email|session|signature|password/i.test(key)) return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}
function data(value: unknown): EditorialData {
  const raw = record(value);
  const schedule = raw.schedule === null ? null : record(raw.schedule);
  const calendar = raw.calendarDates == null ? null : record(raw.calendarDates);
  return {
    title: text(raw.title),
    organizerId: raw.organizerId === null ? null : uuid(raw.organizerId),
    schedule: schedule && {
      localStart: localTime(schedule.localStart),
      localEnd: schedule.localEnd === null ? null : localTime(schedule.localEnd),
      zoneId: enumeration(schedule.zoneId, ["Europe/Madrid"]) as "Europe/Madrid",
      startInstant: schedule.startInstant === null ? null : instant(schedule.startInstant),
      endInstant: schedule.endInstant === null ? null : instant(schedule.endInstant),
    },
    calendarDates: calendar && {
      startDate: date(calendar.startDate),
      endDate: calendar.endDate === null ? null : date(calendar.endDate),
      precision: enumeration(calendar.precision, ["DATE_ONLY", "ALL_DAY"]) as "DATE_ONLY" | "ALL_DAY",
    },
    locations: list(raw.locations, 20, (value) => {
      const item = record(value);
      return {
        role: enumeration(item.role, ["ACTIVITY", "MEETING_POINT", "DEPARTURE", "DESTINATION"]),
        municipality: nullableText(item.municipality),
        neighborhood: nullableText(item.neighborhood),
        pointName: nullableText(item.pointName),
        address: nullableText(item.address),
        latitude: coordinate(item.latitude, 90),
        longitude: coordinate(item.longitude, 180),
        verified: boolean(item.verified),
      };
    }),
    priceOptions: list(raw.priceOptions, 20, (value) => {
      const item = record(value);
      const money = item.money === null ? null : record(item.money);
      if (money && (typeof money.amount !== "number" || !Number.isFinite(money.amount) || money.amount < 0)) invalid();
      return {
        type: enumeration(item.type, [
          "FREE",
          "FIXED",
          "DONATION",
          "TRIAL",
          "EARLY_BIRD",
          "FROM",
          "MEMBERSHIP",
          "SUBSCRIPTION",
        ]),
        scope: enumeration(item.scope, [
          "PER_SESSION",
          "FIRST_SESSION_ONLY",
          "PER_MONTH",
          "PER_YEAR",
          "MEMBERSHIP",
          "TRANSPORT",
          "OTHER",
        ]),
        money: money && { amount: money.amount as number, currency: text(money.currency, 3) },
        conditions: nullableText(item.conditions, 2000),
        validFrom: item.validFrom === null ? null : date(item.validFrom),
        validTo: item.validTo === null ? null : date(item.validTo),
        transportCost: enumeration(item.transportCost, ["INCLUDED", "EXCLUDED", "NOT_APPLICABLE", "UNKNOWN"]),
      };
    }),
    ...(Object.hasOwn(raw, "registration")
      ? {
          registration: (() => {
            if (raw.registration === null) return null;
            const r = record(raw.registration);
            if (
              Object.keys(r).length !== 4 ||
              !isRegistrationDestination(r.method, r.destination) ||
              !isSafeRegistrationUrl(r.evidenceUrl) ||
              typeof r.organizerPublished !== "boolean"
            )
              invalid();
            return {
              method: r.method,
              destination: r.destination as string,
              evidenceUrl: r.evidenceUrl as string,
              organizerPublished: r.organizerPublished as boolean,
            };
          })(),
        }
      : {}),
    registrationUri: url(raw.registrationUri),
    activityLanguage: nullableText(raw.activityLanguage, 50),
  };
}

export function normalizeInspection(value: unknown, candidateId: string): EditorialInspection {
  const raw = record(value);
  if (uuid(raw.candidateId) !== candidateId || version(raw.candidateVersion) < 1) invalid();
  const source = record(raw.source);
  const details = data(raw.data);
  const conflicts = list(raw.conflicts, 100, (value) => {
    const item = record(value);
    return {
      id: uuid(item.id),
      fieldPath: text(item.fieldPath),
      sourceUrl: url(item.sourceUrl),
      observedAt: instant(item.observedAt),
    };
  });
  return {
    candidateId,
    candidateVersion: version(raw.candidateVersion),
    revision: version(raw.revision),
    status: text(raw.status, 45),
    title: details.title,
    data: details,
    registrationSupported: Object.hasOwn(details, "registration"),
    organizerName: nullableText(raw.organizerName),
    organizers: list(raw.organizers, 100, (value) => {
      const item = record(value);
      return { id: uuid(item.id), name: text(item.name) };
    }),
    moreOrganizers: boolean(raw.moreOrganizers),
    source: {
      id: uuid(source.id),
      name: text(source.name),
      url: url(source.url),
      observedAt: instant(source.observedAt),
    },
    publicationId: raw.publicationId === null ? null : uuid(raw.publicationId),
    publicationStatus:
      raw.publicationStatus === null
        ? null
        : enumeration(raw.publicationStatus, ["published", "suspended", "cancelled", "archived"]),
    conflictCount: conflicts.length,
    moreConflicts: boolean(raw.moreConflicts),
    conflicts,
  };
}
