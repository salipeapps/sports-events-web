import type { Metadata } from "next";

import type { AdminAccessFailureReason } from "@/domain/adminAccess";
import { AdminAccessState } from "@/presentation/admin/AdminAccessState";

export const metadata: Metadata = {
  title: "Acceso Admin",
  robots: {
    index: false,
    follow: false,
  },
};

const knownReasons = new Set<AdminAccessFailureReason>(["missing_session", "expired", "unauthorized"]);

export default async function AdminAccessPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const safeReason: AdminAccessFailureReason =
    reason && knownReasons.has(reason as AdminAccessFailureReason)
      ? (reason as AdminAccessFailureReason)
      : "missing_session";

  return <AdminAccessState reason={safeReason} />;
}
