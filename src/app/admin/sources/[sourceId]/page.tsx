import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { notFound } from "next/navigation";

import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { AdminSourceDetail } from "@/presentation/admin/AdminSourceRunViews";
import { loadAdminView } from "@/presentation/admin/AdminReadState";

export default async function SourceDetailPage({ params }: { params: Promise<{ sourceId: string }> }) {
  await requireAdminAccess("sources.manage");
  return loadAdminView("source", async () => {
    const repository = getAdminRepository();
    const [{ sourceId }, sources, runs] = await Promise.all([params, repository.listSources(), repository.listRuns()]);
    const source = sources.find((item) => item.id === sourceId);
    if (!source) notFound();

    return <AdminSourceDetail source={source} runs={runs} />;
  });
}
