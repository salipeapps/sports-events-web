import type { DiscoveryCandidate } from "../../../src/integrations/discovery/readApi";

// Isolated offline fixture. Never imported by application code or inserted into STAGING.
export const candidate: DiscoveryCandidate = {
  id: "ca73b0ff-8001-4000-8000-111111111111",
  canonicalUrl: "https://www.momoyoga.com/studio/schedule",
  firstObservedAt: "2026-10-08T09:00:00Z",
  lastObservedAt: "2026-10-09T09:00:00Z",
  reviewStatus: "PENDING_REVIEW",
  latestReviewId: null,
  linkedSourceId: null,
  classification: {
    kind: "SUPPORTED_ADAPTER_CANDIDATE",
    reason: "EXACT_SUPPORTED_URL",
    sourceFamily: "MOMOYOGA",
    proposedAdapterKey: "momoyoga",
    knownSourceId: null,
    ruleVersion: 1,
    classifiedAt: "2026-10-09T09:00:00Z",
  },
  observationCount: 1,
  minPosition: 1,
  maxPosition: 1,
  latestObservation: null,
  source: null,
  latestReview: null,
};
