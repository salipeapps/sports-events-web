import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminDashboard } from "@/presentation/admin/AdminDashboard";

export default async function AdminPage() {
  await requireAdminAccess("dashboard.view");
  const summary = await getAdminRepository().getDashboardSummary();

  return <AdminDashboard summary={summary} />;
}
