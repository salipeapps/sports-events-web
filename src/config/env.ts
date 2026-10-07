const APP_ENVIRONMENTS = ["development", "test", "production"] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export function parseAppEnvironment(value: string | undefined): AppEnvironment {
  const candidate = value ?? "development";

  if (APP_ENVIRONMENTS.some((environment) => environment === candidate)) {
    return candidate as AppEnvironment;
  }

  throw new Error(`Invalid APP_ENV "${candidate}". Expected one of: ${APP_ENVIRONMENTS.join(", ")}.`);
}

export function getServerConfig(environment: { APP_ENV?: string } = process.env) {
  return {
    appEnv: parseAppEnvironment(environment.APP_ENV),
  } as const;
}
