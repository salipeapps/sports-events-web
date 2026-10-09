import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { getDiscoveryRepository } from "@/data/discoveryRepositoryProvider";
import { DiscoveryOverview, resolveDiscoveryTab } from "@/presentation/admin/DiscoveryOverview";
import { DiscoveryReadError, getDiscoveryMode, getLiveDiscoveryRepository } from "@/integrations/discovery/readApi";
import { LiveDiscoveryFailure, LiveDiscoveryOverview, readQueryParams } from "@/presentation/admin/LiveDiscovery";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminAccess("discovery.view");
  const query = readQueryParams(await searchParams);
  const tab = resolveDiscoveryTab(query.tab);
  const mode = getDiscoveryMode();
  if (mode === "demo") {
    const snapshot = await getDiscoveryRepository().getSnapshot();
    return <DiscoveryOverview snapshot={snapshot} activeTab={tab} />;
  }
  if (mode !== "staging") return <LiveDiscoveryFailure code="NOT_CONFIGURED" />;
  const outcome = await (async () => {
    try {
      const repo = getLiveDiscoveryRepository();
      const page = { cursor: query.cursor, limit: 20 };
      const data =
        tab === "resultados"
          ? await repo.candidates({
              ...page,
              reviewStatus: query.reviewStatus,
              classificationKind: query.classificationKind,
              queryId: query.queryId,
              providerKey: query.providerKey,
              executionId: query.executionId,
              search: query.search,
            })
          : tab === "consultas"
            ? await repo.queries(page)
            : await repo.providers(page);
      return { data };
    } catch (error) {
      return { code: (error instanceof DiscoveryReadError ? error.code : "READ_UNAVAILABLE") as const };
    }
  })();
  if ("code" in outcome) return <LiveDiscoveryFailure code={outcome.code} />;
  return <LiveDiscoveryOverview tab={tab} data={outcome.data} params={query} />;
}
