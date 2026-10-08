import { notFound } from "next/navigation";

import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminRunDetail } from "@/presentation/admin/AdminSourceRunViews";
import type { AdminSearchParams } from "@/presentation/admin/adminActivityQuery";
import { resolveRunCandidatePage } from "@/presentation/admin/sourceRunPresentation";

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const repository = getAdminRepository();
  const [{ runId }, query, runs, sources] = await Promise.all([
    params,
    searchParams,
    repository.listRuns(),
    repository.listSources(),
  ]);
  const run = runs.find((item) => item.id === runId);
  if (!run || run.kind === "discovery") notFound();

  const linked = await repository.listRunCandidates(runId, { page: resolveRunCandidatePage(query) });
  return <AdminRunDetail run={run} sources={sources} candidates={linked} />;
}
