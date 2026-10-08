import { notFound } from "next/navigation";

import { getDiscoveryRepository } from "@/data/discoveryRepositoryProvider";
import { DiscoveryExecutionDetail } from "@/presentation/admin/DiscoveryOverview";

export default async function DiscoveryExecutionPage({ params }: { params: Promise<{ executionId: string }> }) {
  const [{ executionId }, snapshot] = await Promise.all([params, getDiscoveryRepository().getSnapshot()]);
  const execution = snapshot.executions.find((item) => item.id === executionId);
  if (!execution) notFound();
  return <DiscoveryExecutionDetail snapshot={snapshot} execution={execution} />;
}
