import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminActivityCatalog } from "@/presentation/admin/AdminActivityCatalog";
import { loadActivityCatalog } from "@/presentation/admin/adminActivityLoader";
import type { AdminSearchParams } from "@/presentation/admin/adminActivityQuery";

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  const params = await searchParams;
  const model = await loadActivityCatalog(getAdminRepository(), params, "activities");

  return <AdminActivityCatalog model={model} />;
}
