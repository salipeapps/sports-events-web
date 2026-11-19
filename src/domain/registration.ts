export type RegistrationMethod = "WEB" | "WHATSAPP" | "PHONE" | "EMAIL";
export type RegistrationAction = "OPEN_HTTPS" | "COPY_NUMBER" | "CALL" | "COMPOSE_EMAIL";
export interface PublicRegistration {
  method: RegistrationMethod;
  destination: string;
  action: RegistrationAction;
}
export interface OrganizerRegistration {
  method: RegistrationMethod;
  destination: string;
  evidenceUrl: string;
  organizerPublished: boolean;
}
export const registrationActions = {
  WEB: "OPEN_HTTPS",
  WHATSAPP: "COPY_NUMBER",
  PHONE: "CALL",
  EMAIL: "COMPOSE_EMAIL",
} as const;

/** Same conservative grammar as Engine V021, without navigation inference or network access. */
export function isSafeRegistrationUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    !/^https:\/\/[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?([.][a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+(\/[a-zA-Z0-9/_.~-]*)?$/.test(
      value,
    ) ||
    /([0-9][ .()/_~-]*){7}/.test(value) ||
    /token|secret|password|api[_-]?key|[.]local(\/|$)|[.]internal(\/|$)/i.test(value)
  )
    return false;
  if (/^[0-9.]+$/.test(new URL(value).hostname)) return false;
  return !value
    .split("/")
    .some(
      (segment) =>
        /[A-Za-z0-9_-]{32}/.test(segment) &&
        !/^[a-z]{2,24}(-[a-z]{2,24}){3,12}-20[2-9][0-9]$/.test(segment) &&
        // Match Engine Registration.safePublicUrl / reviewed STAGING catalog_read.safe_url:
        // complete five-or-more-word lowercase slugs are human-readable, not opaque tokens.
        !/^[a-z]{3,24}(-[a-z]{3,24}){4,12}$/.test(segment),
    );
}
export function isRegistrationDestination(method: unknown, value: unknown): method is RegistrationMethod {
  if (typeof value !== "string") return false;
  switch (method) {
    case "WEB":
      return isSafeRegistrationUrl(value) && !/(^|\.)(wa\.me|whatsapp\.com)$/i.test(new URL(value).hostname);
    case "WHATSAPP":
    case "PHONE":
      return /^\+[1-9][0-9]{6,14}$/.test(value);
    case "EMAIL":
      return (
        value.length <= 254 &&
        value.indexOf("@") <= 64 &&
        /^[A-Za-z0-9]+([._+-][A-Za-z0-9]+)*@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(
          value,
        ) &&
        !/[.](local|internal)$/i.test(value)
      );
    default:
      return false;
  }
}
export function decodePublicRegistration(value: unknown): PublicRegistration {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INCOMPATIBLE_CONTRACT");
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).length !== 3 ||
    !isRegistrationDestination(raw.method, raw.destination) ||
    raw.action !== registrationActions[raw.method]
  )
    throw new Error("INCOMPATIBLE_CONTRACT");
  return { method: raw.method, destination: raw.destination as string, action: raw.action } as PublicRegistration;
}
