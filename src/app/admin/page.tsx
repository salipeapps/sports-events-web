import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminDashboard } from "@/presentation/admin/AdminDashboard";
import { loadAdminView } from "@/presentation/admin/AdminReadState";

export default async function AdminPage() {
  await requireAdminAccess("dashboard.view");
  return loadAdminView("dashboard", async () => {
    const summary = await getAdminRepository().getDashboardSummary();

    return <AdminDashboard summary={summary} />;
  });
}
