import { notFound } from "next/navigation";

import { getAdminRepository } from "@/data/adminRepositoryProvider";
import { CandidateReview } from "@/presentation/admin/CandidateReview";

export default async function CandidateReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ candidateId: string }>;
  searchParams: Promise<{ result?: string; error?: string }>;
}) {
  const { candidateId } = await params;
  const query = await searchParams;
  const repository = getAdminRepository();

  const [candidate, organizers, sources] = await Promise.all([
    repository.getCandidate(candidateId),
    repository.listOrganizers(),
    repository.listSources(),
  ]);

  if (!candidate) notFound();

  return (
    <CandidateReview
      candidate={candidate}
      organizers={organizers}
      source={sources.find((source) => source.id === candidate.sourceId) ?? null}
      result={query.result}
      error={query.error}
    />
  );
}
