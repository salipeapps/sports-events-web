const APP_ENVIRONMENTS = ["development", "test", "production"] as const;
const ADMIN_DEV_AUTH_MODES = ["disabled", "enabled"] as const;
const ADMIN_ROLES = ["admin", "reviewer"] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];
export type AdminDevAuthMode = (typeof ADMIN_DEV_AUTH_MODES)[number];
export type AdminDevRole = (typeof ADMIN_ROLES)[number];

export interface ServerEnvironment {
  APP_ENV?: string;
  ADMIN_DEV_AUTH_MODE?: string;
  ADMIN_DEV_AUTH_ROLE?: string;
  ADMIN_DEV_AUTH_NAME?: string;
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
  const adminDevAuthMode = parseAdminDevAuthMode(source.ADMIN_DEV_AUTH_MODE);
  const adminDevAuthRole = parseAdminDevRole(source.ADMIN_DEV_AUTH_ROLE);
  const adminDevAuthName = source.ADMIN_DEV_AUTH_NAME?.trim() || "Local Admin";

  if (appEnv === "production" && adminDevAuthMode === "enabled") {
    throw new Error("ADMIN_DEV_AUTH_MODE=enabled is development-only and cannot be enabled in production.");
  }

  return {
    appEnv,
    adminDevAuthMode,
    adminDevAuthRole,
    adminDevAuthName,
  } as const;
}
