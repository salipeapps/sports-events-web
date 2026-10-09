import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminActivityCatalog } from "@/presentation/admin/AdminActivityCatalog";
import { loadActivityCatalog } from "@/presentation/admin/adminActivityLoader";
import type { AdminSearchParams } from "@/presentation/admin/adminActivityQuery";

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireAdminAccess("catalog.review");
  const params = await searchParams;
  const model = await loadActivityCatalog(getAdminRepository(), params, "candidates");

  return <AdminActivityCatalog model={model} />;
}
