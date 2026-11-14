/**
 * V026 editorial trust commands (Engine `docs/editorial-trust-commands.md`): reviewed alias and official channel of an
 * EXISTING organizer, and a source's location authority. Shared by the BFF and the admin forms so that what the admin
 * confirms is exactly what is sent. The Engine and its SQL functions remain the final authority.
 */
export const trustOperations = ["alias", "channel", "locationAuthority"] as const;
export type TrustOperation = (typeof trustOperations)[number];

export const trustActions: Record<TrustOperation, string> = {
  alias: "ADD_ORGANIZER_ALIAS",
  channel: "ADD_ORGANIZER_CHANNEL",
  locationAuthority: "SET_LOCATION_AUTHORITY",
};
export const trustStatuses: Record<TrustOperation, readonly string[]> = {
  alias: ["ADDED", "EXISTS"],
  channel: ["ADDED", "EXISTS"],
  locationAuthority: ["DECLARED", "WITHDRAWN", "UNCHANGED"],
};

export interface TrustInput {
  alias: { alias: string; reason: string; evidenceUrl: string };
  channel: { officialUrl: string; reason: string; evidenceUrl: string };
  locationAuthority: { authoritative: boolean; reason: string; evidenceUrl: string };
}

export interface TrustReceipt {
  commandKey: string;
  action: string;
  organizerId: string | null;
  alias: string | null;
  officialUrl: string | null;
  channelId: string | null;
  sourceId: string | null;
  authoritative: boolean | null;
  status: string;
  recordedAt: string;
}

/** Java `OrganizerRegistration.MAX_REASON_LENGTH`, counted in UTF-16 units on both sides. */
export const maxEngineReasonLength = 1000;
export const maxAliasLength = 200;
const evidenceSeparator = " · Evidencia: ";
// Control, invisible formatting (bidi overrides, zero-width), private use, surrogates and unassigned code points.
const unsafe = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}]/u;
// Java `[\s\p{Z}]+` without UNICODE_CHARACTER_CLASS: ASCII whitespace plus Unicode separators.
const separators = /[ \t\n\x0B\f\r\p{Z}]+/gu;
const label = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const channelOrigin = new RegExp(`^https://${label}(?:\\.${label})+/?$`);

/** The presentation form the Engine stores (NFC, single ASCII spaces, trimmed). */
export function normalizeAlias(raw: string): string {
  return raw.normalize("NFC").replace(separators, " ").trim();
}

export function isValidAlias(value: unknown): value is string {
  if (typeof value !== "string" || value !== normalizeAlias(value)) return false;
  const length = [...value].length;
  return length >= 2 && length <= maxAliasLength && !unsafe.test(value) && /\p{L}/u.test(value);
}

/**
 * The capture trusts the channel's whole host, so the Engine only accepts an origin (`https://host` or
 * `https://host/`). Mirrors Java `Registration.safePublicUrl` and is stricter: lowercase host only.
 */
export function isOfficialChannelOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500 || !channelOrigin.test(value)) return false;
  const host = value.slice("https://".length).replace(/\/$/, "");
  return (
    !/^[\d.]+$/.test(host) &&
    !/([0-9][ .()/_~-]*){7}/.test(value) &&
    !/token|secret|password|api[_-]?key|\.local(\/|$)|\.internal(\/|$)/i.test(value) &&
    !/[A-Za-z0-9_-]{32}/.test(host)
  );
}

/** A public HTTPS page the admin reviewed: no credentials, port, query or fragment, already canonical. */
export function isEvidenceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.includes(".") &&
      !/^[\d.]+$/.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      url.href === value
    );
  } catch {
    return false;
  }
}

export function isTrustReason(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    value.length <= maxEngineReasonLength &&
    !unsafe.test(value)
  );
}

/**
 * The Engine contract has no evidence field: the reviewed evidence URL travels inside the audited reason
 * (`editorial_trust_changes.reason`), in a fixed format. Returns null when the result would exceed the Engine limit.
 */
export function composeTrustReason(reason: string, evidenceUrl: string): string | null {
  if (!isTrustReason(reason) || !isEvidenceUrl(evidenceUrl)) return null;
  const composed = reason + evidenceSeparator + evidenceUrl;
  return composed.length <= maxEngineReasonLength ? composed : null;
}

export function trustPath(operation: TrustOperation, targetId: string): string {
  return operation === "locationAuthority"
    ? "/sources/" + targetId + "/location-authority"
    : "/organizers/" + targetId + (operation === "alias" ? "/aliases" : "/channels");
}

export function trustMethod(operation: TrustOperation): "POST" | "PUT" {
  return operation === "locationAuthority" ? "PUT" : "POST";
}
