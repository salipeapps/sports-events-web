import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminDashboard } from "@/presentation/admin/AdminDashboard";

export default async function AdminPage() {
  const summary = await getAdminRepository().getDashboardSummary();

  return <AdminDashboard summary={summary} />;
}
