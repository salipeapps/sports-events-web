import { getDiscoveryRepository } from "@/data/discoveryRepositoryProvider";
import { DiscoveryOverview, resolveDiscoveryTab } from "@/presentation/admin/DiscoveryOverview";

export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const [snapshot, query] = await Promise.all([getDiscoveryRepository().getSnapshot(), searchParams]);
  return <DiscoveryOverview snapshot={snapshot} activeTab={resolveDiscoveryTab(query.tab)} />;
}
