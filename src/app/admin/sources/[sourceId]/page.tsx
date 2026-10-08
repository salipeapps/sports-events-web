import { notFound } from "next/navigation";

import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminSourceDetail } from "@/presentation/admin/AdminSourceRunViews";

export default async function SourceDetailPage({ params }: { params: Promise<{ sourceId: string }> }) {
  const repository = getAdminRepository();
  const [{ sourceId }, sources, runs] = await Promise.all([params, repository.listSources(), repository.listRuns()]);
  const source = sources.find((item) => item.id === sourceId);
  if (!source) notFound();

  return <AdminSourceDetail source={source} runs={runs} />;
}
