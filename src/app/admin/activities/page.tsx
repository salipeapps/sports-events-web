import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminActivityCatalog } from "@/presentation/admin/AdminActivityCatalog";
import { loadAdminView } from "@/presentation/admin/AdminReadState";
import { loadActivityCatalog } from "@/presentation/admin/adminActivityLoader";
import type { AdminSearchParams } from "@/presentation/admin/adminActivityQuery";

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireAdminAccess("catalog.review");
  return loadAdminView("activities", async () => {
    const params = await searchParams;
    const model = await loadActivityCatalog(getAdminRepository(), params, "activities");

    return <AdminActivityCatalog model={model} />;
  });
}
