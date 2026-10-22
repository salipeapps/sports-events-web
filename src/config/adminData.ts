import { isLoopbackOrigin, type ServerEnvironment } from "./env";

/** Fixtures require an explicit local development session, never a hosted deployment. */
export function isLocalAdminDemo(env: ServerEnvironment = process.env): boolean {
  return (
    env.APP_ENV === "development" &&
    env.NODE_ENV === "development" &&
    env.ADMIN_DEV_AUTH_MODE === "enabled" &&
    env.VERCEL === undefined &&
    env.VERCEL_ENV === undefined &&
    isLoopbackOrigin(env.APP_ORIGIN)
  );
}
