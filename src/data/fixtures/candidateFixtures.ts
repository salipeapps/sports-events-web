import { primaryCandidateFixtures } from "./candidatePrimaryFixtures";
import { workflowCandidateFixtures } from "./candidateWorkflowFixtures";

export { publishedOccurrenceFixtures } from "./publishedFixture";

export const candidateFixtures = [...primaryCandidateFixtures, ...workflowCandidateFixtures];
