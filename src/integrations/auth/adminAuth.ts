import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAuthClient } from "./supabaseServer";
import { SupabaseAdminSessionProvider } from "./supabaseAccess";

import { getServerConfig, isLoopbackRequestHost, type ServerEnvironment } from "@/config/env";
import { canAdmin, requireAdminCapability, type AdminCapability, type AdminAccessResult } from "@/domain/adminAccess";

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
  await cookies();
  try {
    const config = getServerConfig();
    if (config.adminDevAuthMode === "enabled") {
      const host = (await headers()).get("host");
      if (!isLoopbackRequestHost(host)) return { status: "unauthenticated", reason: "unauthorized" };
      return createAdminSessionProvider().getAccess();
    }
    const client = await createAuthClient();
    return client
      ? new SupabaseAdminSessionProvider(client).getAccess()
      : { status: "unauthenticated", reason: "missing_session" };
  } catch {
    return { status: "unauthenticated", reason: "unauthorized" };
  }
}

export async function requireAdminAccess(capability: AdminCapability) {
  const access = await getAdminAccess();
  if (access.status !== "authenticated") redirect(`/admin-access?reason=${access.reason}`);
  if (!canAdmin(access.session.role, capability)) redirect(`/admin/forbidden?capability=${capability}`);
  requireAdminCapability(access.session, capability);
  return access.session;
}
