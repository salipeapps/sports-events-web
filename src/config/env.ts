const APP_ENVIRONMENTS = ["development", "test", "production"] as const;
const ADMIN_DEV_AUTH_MODES = ["disabled", "enabled"] as const;
const ADMIN_ROLES = ["admin", "reviewer"] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];
export type AdminDevAuthMode = (typeof ADMIN_DEV_AUTH_MODES)[number];
export type AdminDevRole = (typeof ADMIN_ROLES)[number];

export interface ServerEnvironment {
  APP_ENV?: string;
  NODE_ENV?: string;
  ADMIN_DEV_AUTH_MODE?: string;
  ADMIN_DEV_AUTH_ROLE?: string;
  ADMIN_DEV_AUTH_NAME?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  APP_ORIGIN?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}

export function parseAppEnvironment(value: string | undefined): AppEnvironment {
  const candidate = value ?? "development";

  if (APP_ENVIRONMENTS.some((environment) => environment === candidate)) {
    return candidate as AppEnvironment;
  }

  throw new Error(`Invalid APP_ENV "${candidate}". Expected one of: ${APP_ENVIRONMENTS.join(", ")}.`);
}

export function parseAdminDevAuthMode(value: string | undefined): AdminDevAuthMode {
  const candidate = value ?? "disabled";

  if (ADMIN_DEV_AUTH_MODES.some((mode) => mode === candidate)) {
    return candidate as AdminDevAuthMode;
  }

  throw new Error(`Invalid ADMIN_DEV_AUTH_MODE "${candidate}". Expected one of: ${ADMIN_DEV_AUTH_MODES.join(", ")}.`);
}

export function parseAdminDevRole(value: string | undefined): AdminDevRole {
  const candidate = value ?? "admin";

  if (ADMIN_ROLES.some((role) => role === candidate)) {
    return candidate as AdminDevRole;
  }

  throw new Error(`Invalid ADMIN_DEV_AUTH_ROLE "${candidate}". Expected one of: ${ADMIN_ROLES.join(", ")}.`);
}

export function getServerConfig(environment?: ServerEnvironment) {
  const source = environment ?? process.env;
  const appEnv = parseAppEnvironment(source.APP_ENV);
  const nodeEnv = source.NODE_ENV;
  const adminDevAuthMode = parseAdminDevAuthMode(source.ADMIN_DEV_AUTH_MODE);
  const adminDevAuthRole = parseAdminDevRole(source.ADMIN_DEV_AUTH_ROLE);
  const adminDevAuthName = source.ADMIN_DEV_AUTH_NAME?.trim() || "Local Admin";

  if (
    (appEnv !== "development" ||
      nodeEnv !== "development" ||
      source.VERCEL !== undefined ||
      source.VERCEL_ENV !== undefined ||
      !isLoopbackOrigin(source.APP_ORIGIN)) &&
    adminDevAuthMode === "enabled"
  ) {
    throw new Error("ADMIN_DEV_AUTH_MODE=enabled is development-only and cannot be enabled in production.");
  }

  return {
    appEnv,
    nodeEnv,
    adminDevAuthMode,
    adminDevAuthRole,
    adminDevAuthName,
  } as const;
}

export function isLoopbackOrigin(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isLoopbackRequestHost(value: string | null): boolean {
  if (!value) return false;

  try {
    const url = new URL(`http://${value}`);
    return url.username === "" && url.password === "" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function getAuthConfig(source: ServerEnvironment = process.env) {
  try {
    const url = new URL(source.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const origin = new URL(source.APP_ORIGIN ?? "");
    const key = source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
    const local = source.NODE_ENV === "development" && source.VERCEL === undefined && source.VERCEL_ENV === undefined;
    if (
      !(url.protocol === "https:" && /^[a-z0-9]+\.supabase\.co$/.test(url.hostname)) &&
      !(local && isLoopbackOrigin(url.origin))
    )
      return null;
    if (origin.protocol !== "https:" && !(local && isLoopbackOrigin(origin.origin))) return null;
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)
    )
      return null;
    return { url: url.origin, key, origin: origin.origin };
  } catch {
    return null;
  }
}
