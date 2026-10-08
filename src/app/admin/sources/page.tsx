import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminSourcesCatalog } from "@/presentation/admin/AdminSourceRunViews";
import type { AdminSearchParams } from "@/presentation/admin/adminActivityQuery";
import { resolveSourceQuery } from "@/presentation/admin/sourceRunPresentation";

export default async function SourcesPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireAdminAccess("sources.manage");
  const repository = getAdminRepository();
  const [sources, runs, query] = await Promise.all([repository.listSources(), repository.listRuns(), searchParams]);
  return <AdminSourcesCatalog sources={sources} runs={runs} query={resolveSourceQuery(query)} />;
}
