import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminRunsCatalog } from "@/presentation/admin/AdminSourceRunViews";

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string }>;
}) {
  const repository = getAdminRepository();
  const [sources, runs, query] = await Promise.all([
    repository.listSources(),
    repository.listRuns(),
    searchParams,
  ]);
  return <AdminRunsCatalog sources={sources} runs={runs} query={query} />;
}
