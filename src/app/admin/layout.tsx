import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getAdminAccess } from "@/integrations/auth/adminAuth";
import { AdminShell } from "@/presentation/admin/AdminShell";
import { isLocalAdminDemo } from "@/config/adminData";

export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const access = await getAdminAccess();

  if (access.status !== "authenticated") {
    redirect(`/admin-access?reason=${access.reason}`);
  }

  return (
    <AdminShell session={access.session} demo={isLocalAdminDemo()}>
      {children}
    </AdminShell>
  );
}
