import { requireAdminAccess } from "@/integrations/auth/adminAuth";
import { canAdmin } from "@/domain/adminAccess";
import { notFound } from "next/navigation";

import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { CandidateReview } from "@/presentation/admin/CandidateReview";
import { loadAdminView } from "@/presentation/admin/AdminReadState";

export default async function CandidateReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ candidateId: string }>;
  searchParams: Promise<{ result?: string; error?: string }>;
}) {
  const session = await requireAdminAccess("catalog.review");
  return loadAdminView("candidate", async () => {
    const { candidateId } = await params;
    const query = await searchParams;
    const repository = getAdminRepository();

    const [candidate, organizers, sources] = await Promise.all([
      repository.getCandidate(candidateId),
      repository.listOrganizers(),
      repository.listSources(),
    ]);

    if (!candidate) notFound();
    const publishedOccurrence = await repository.getLinkedPublishedOccurrence(candidateId);

    return (
      <CandidateReview
        canExecute={canAdmin(session.role, "runs.execute")}
        candidate={candidate}
        organizers={organizers}
        sources={sources}
        publishedOccurrence={publishedOccurrence}
        result={query.result}
        error={query.error}
      />
    );
  });
}
