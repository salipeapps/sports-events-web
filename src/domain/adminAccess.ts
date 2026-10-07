export const adminRoles = ["admin", "reviewer"] as const;
export type AdminRole = (typeof adminRoles)[number];

export const adminCapabilities = [
  "dashboard.view",
  "catalog.review",
  "catalog.publish",
  "sources.manage",
  "runs.execute",
  "settings.manage",
] as const;
export type AdminCapability = (typeof adminCapabilities)[number];

export interface AdminSession {
  subject: string;
  displayName: string;
  role: AdminRole;
}

export type AdminAccessFailureReason = "missing_session" | "expired" | "unauthorized";

export type AdminAccessResult =
  { status: "authenticated"; session: AdminSession } | { status: "unauthenticated"; reason: AdminAccessFailureReason };

const capabilitiesByRole: Record<AdminRole, readonly AdminCapability[]> = {
  admin: adminCapabilities,
  reviewer: ["dashboard.view", "catalog.review", "catalog.publish"],
};

export class AdminAuthorizationError extends Error {
  constructor(
    readonly role: AdminRole,
    readonly capability: AdminCapability,
  ) {
    super(`Role "${role}" is not allowed to perform "${capability}".`);
    this.name = "AdminAuthorizationError";
  }
}

export function canAdmin(role: AdminRole, capability: AdminCapability): boolean {
  return capabilitiesByRole[role].includes(capability);
}

export function requireAdminCapability(session: AdminSession, capability: AdminCapability): void {
  if (!canAdmin(session.role, capability)) {
    throw new AdminAuthorizationError(session.role, capability);
  }
}
