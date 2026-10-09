import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { notFound } from "next/navigation";

import { getDiscoveryRepository } from "@/data/discoveryRepositoryProvider";
import { DiscoveryExecutionDetail } from "@/presentation/admin/DiscoveryOverview";
import { DiscoveryReadError, getDiscoveryMode, getLiveDiscoveryRepository } from "@/integrations/discovery/readApi";
import { LiveDiscoveryFailure, LiveExecutionDetail } from "@/presentation/admin/LiveDiscovery";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DiscoveryExecutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ executionId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  await requireAdminAccess("discovery.view");
  const { executionId } = await params;
  const mode = getDiscoveryMode();
  if (mode === "demo") {
    const snapshot = await getDiscoveryRepository().getSnapshot();
    const execution = snapshot.executions.find((item) => item.id === executionId);
    if (!execution) notFound();
    return <DiscoveryExecutionDetail snapshot={snapshot} execution={execution} />;
  }
  if (mode !== "staging") return <LiveDiscoveryFailure code="NOT_CONFIGURED" />;
  const outcome = await (async () => {
    try {
      const { cursor } = await searchParams;
      const repo = getLiveDiscoveryRepository();
      const [execution, observations] = await Promise.all([
        repo.execution(executionId),
        repo.executionObservations(executionId, { cursor, limit: 20 }),
      ]);
      return { execution, observations };
    } catch (error) {
      return { code: (error instanceof DiscoveryReadError ? error.code : "READ_UNAVAILABLE") as const };
    }
  })();
  if ("code" in outcome) return <LiveDiscoveryFailure code={outcome.code} />;
  return <LiveExecutionDetail execution={outcome.execution} observations={outcome.observations} />;
}
