import { notFound } from "next/navigation";

import { getDiscoveryRepository } from "@/data/discoveryRepositoryProvider";
import { DiscoveryResultDetail } from "@/presentation/admin/DiscoveryOverview";

export default async function DiscoveryResultPage({ params }: { params: Promise<{ resultId: string }> }) {
  const [{ resultId }, snapshot] = await Promise.all([params, getDiscoveryRepository().getSnapshot()]);
  const result = snapshot.results.find((item) => item.id === resultId);
  if (!result) notFound();
  return <DiscoveryResultDetail snapshot={snapshot} result={result} />;
}
