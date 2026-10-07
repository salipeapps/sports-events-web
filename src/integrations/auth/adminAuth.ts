import { cookies } from "next/headers";

import { getServerConfig, type ServerEnvironment } from "@/config/env";
import type { AdminAccessResult } from "@/domain/adminAccess";

export interface AdminSessionProvider {
  getAccess(): Promise<AdminAccessResult>;
}

class DenyAllAdminSessionProvider implements AdminSessionProvider {
  async getAccess(): Promise<AdminAccessResult> {
    return { status: "unauthenticated", reason: "missing_session" };
  }
}

class LocalDevelopmentAdminSessionProvider implements AdminSessionProvider {
  constructor(
    private readonly role: "admin" | "reviewer",
    private readonly displayName: string,
  ) {}

  async getAccess(): Promise<AdminAccessResult> {
    return {
      status: "authenticated",
      session: {
        subject: `local-development-${this.role}`,
        displayName: this.displayName,
        role: this.role,
      },
    };
  }
}

export function createAdminSessionProvider(environment?: ServerEnvironment): AdminSessionProvider {
  const config = getServerConfig(environment);

  if (config.appEnv === "development" && config.nodeEnv !== "production" && config.adminDevAuthMode === "enabled") {
    return new LocalDevelopmentAdminSessionProvider(config.adminDevAuthRole, config.adminDevAuthName);
  }

  return new DenyAllAdminSessionProvider();
}

export async function getAdminAccess(): Promise<AdminAccessResult> {
  // Keep the route request-bound and leave the cookie boundary ready for the future real auth provider.
  await cookies();
  return createAdminSessionProvider().getAccess();
}
