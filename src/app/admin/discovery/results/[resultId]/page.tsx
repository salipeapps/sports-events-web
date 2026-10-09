import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { notFound } from "next/navigation";

import { getDiscoveryRepository } from "@/data/discoveryRepositoryProvider";
import { DiscoveryResultDetail } from "@/presentation/admin/DiscoveryOverview";
import { DiscoveryReadError, getDiscoveryMode, getLiveDiscoveryRepository } from "@/integrations/discovery/readApi";
import { LiveCandidateDetail, LiveDiscoveryFailure } from "@/presentation/admin/LiveDiscovery";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DiscoveryResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ resultId: string }>;
  searchParams: Promise<{ observationsCursor?: string; reviewsCursor?: string }>;
}) {
  await requireAdminAccess("discovery.view");
  const { resultId } = await params;
  const mode = getDiscoveryMode();
  if (mode === "demo") {
    const snapshot = await getDiscoveryRepository().getSnapshot();
    const result = snapshot.results.find((item) => item.id === resultId);
    if (!result) notFound();
    return <DiscoveryResultDetail snapshot={snapshot} result={result} />;
  }
  if (mode !== "staging") return <LiveDiscoveryFailure code="NOT_CONFIGURED" />;
  try {
    const cursors = await searchParams;
    const repo = getLiveDiscoveryRepository();
    const [detail, observations, reviews] = await Promise.all([
      repo.candidate(resultId),
      repo.candidateObservations(resultId, { cursor: cursors.observationsCursor, limit: 20 }),
      repo.candidateReviews(resultId, { cursor: cursors.reviewsCursor, limit: 20 }),
    ]);
    return <LiveCandidateDetail detail={detail} observations={observations} reviews={reviews} />;
  } catch (error) {
    return <LiveDiscoveryFailure code={error instanceof DiscoveryReadError ? error.code : "READ_UNAVAILABLE"} />;
  }
}
