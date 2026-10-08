import type { AdminCandidate, PublishedOccurrence } from "./admin";

function hashSnapshot(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function candidateReviewVersion(candidate: AdminCandidate): string {
  const snapshot = JSON.stringify({
    final: candidate.final,
    editorialStatus: candidate.editorialStatus,
    conflicts: candidate.conflicts.map(({ id, status, blocking, summary }) => ({ id, status, blocking, summary })),
    matches: candidate.matches.map(({ id, status, relation }) => ({ id, status, relation })),
    changeProposal: candidate.changeProposal,
    publishedBaseline: candidate.publishedBaseline ?? null,
    blockerResolutions: candidate.blockerResolutions ?? [],
    history: candidate.history.map(({ id, action, at }) => ({ id, action, at })),
  });

  return `review-v1-${hashSnapshot(snapshot)}`;
}

export function publishedOccurrenceReviewVersion(occurrence: PublishedOccurrence): string {
  const snapshot = JSON.stringify({
    id: occurrence.id,
    sourceRecordIds: occurrence.sourceRecordIds,
    event: occurrence.event,
    history: occurrence.history.map(({ id, action, at }) => ({ id, action, at })),
  });
  return `occurrence-v1-${hashSnapshot(snapshot)}`;
}

export function assertExpectedCandidateVersion(candidate: AdminCandidate, expectedVersion: string): void {
  if (!expectedVersion.trim()) {
    throw new Error("Falta la versión esperada de la candidatura. Recarga la página antes de realizar la acción.");
  }

  if (expectedVersion !== candidateReviewVersion(candidate)) {
    throw new Error(
      "La candidatura ha cambiado desde que abriste esta revisión. Recarga la página antes de guardar o decidir.",
    );
  }
}
