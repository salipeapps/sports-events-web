import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminSourcesCatalog } from "@/presentation/admin/AdminSourceRunViews";

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const repository = getAdminRepository();
  const [sources, runs, query] = await Promise.all([
    repository.listSources(),
    repository.listRuns(),
    searchParams,
  ]);
  return <AdminSourcesCatalog sources={sources} runs={runs} query={query} />;
}
