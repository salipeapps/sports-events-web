import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminRunsCatalog } from "@/presentation/admin/AdminSourceRunViews";
import type { AdminSearchParams } from "@/presentation/admin/adminActivityQuery";
import { resolveRunQuery } from "@/presentation/admin/sourceRunPresentation";

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  const repository = getAdminRepository();
  const [sources, runs, query] = await Promise.all([repository.listSources(), repository.listRuns(), searchParams]);
  return <AdminRunsCatalog sources={sources} runs={runs} query={resolveRunQuery(query)} />;
}
