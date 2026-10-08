import { notFound } from "next/navigation";

import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminRunDetail } from "@/presentation/admin/AdminSourceRunViews";

export default async function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const repository = getAdminRepository();
  const [{ runId }, runs, sources] = await Promise.all([params, repository.listRuns(), repository.listSources()]);
  const run = runs.find((item) => item.id === runId);
  if (!run || run.kind === "discovery") notFound();

  const linked = await repository.listCandidates({ executionId: runId, pageSize: 100 });
  return <AdminRunDetail run={run} sources={sources} candidates={linked.items} />;
}
