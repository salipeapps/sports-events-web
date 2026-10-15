import { describe, expect, it } from "vitest";
import { candidate } from "../../../e2e/fixtures/discovery-ui/candidate";
import { promotionDraft, restoreReviewIntent, reviewAvailability, type DiscoveryReviewAccess } from "./discoveryReview";

const access: DiscoveryReviewAccess = {
  subject: "verified-admin",
  canReject: true,
  canPromote: true,
  rejectionEnabled: true,
  promotionEnabled: true,
};

describe("decision eligibility", () => {
  it("requires role and independent enabled gates for a pending compatible candidate", () => {
    expect(reviewAvailability(candidate)).toEqual({ reject: false, promote: false });
    expect(reviewAvailability(candidate, { ...access, rejectionEnabled: false, promotionEnabled: false })).toEqual({
      reject: false,
      promote: false,
    });
    expect(reviewAvailability(candidate, { ...access, canPromote: false })).toEqual({ reject: true, promote: false });
    expect(reviewAvailability(candidate, access)).toEqual({ reject: true, promote: true });
    expect(reviewAvailability({ ...candidate, reviewStatus: "APPROVED" }, access)).toEqual({
      reject: false,
      promote: false,
    });
    expect(reviewAvailability({ ...candidate, linkedSourceId: "linked" }, access)).toEqual({
      reject: false,
      promote: false,
    });
  });
  it.each([
    "UNSUPPORTED_REVIEWABLE",
    "AMBIGUOUS_REVIEW_REQUIRED",
    "KNOWN_SOURCE",
    "UNSAFE_OR_INVALID",
    "NON_SOURCE_RESULT",
    "UNKNOWN",
  ])("never promotes %s even with an adapter hint", (kind) => {
    expect(
      reviewAvailability({ ...candidate, classification: { ...candidate.classification!, kind } }, access).promote,
    ).toBe(false);
  });
  it("sends classification ruleset version, exact host, and no editable actor or source state", () => {
    expect(promotionDraft(candidate, " Studio ", "BOOKING_PLATFORM", 1)).toEqual({
      expectedReviewStatus: "PENDING_REVIEW",
      expectedClassificationVersion: 1,
      sourceName: "Studio",
      sourceKind: "BOOKING_PLATFORM",
      canonicalSourceUrl: candidate.canonicalUrl,
      adapterKey: "momoyoga",
      allowedDomain: "www.momoyoga.com",
      requestBudget: 1,
    });
  });
});

describe("uncertain intent recovery", () => {
  const intent = {
    version: 1,
    candidateId: candidate.id,
    subject: access.subject,
    operation: "rejection",
    key: "11a2a2a2-1111-4000-8000-111111111111",
    body: { reasonCode: "OUT_OF_SCOPE" },
  };
  it("restores exact intent only for the same verified subject and candidate", () => {
    const raw = JSON.stringify(intent);
    expect(restoreReviewIntent(raw, access.subject, candidate.id)).toEqual(intent);
    expect(restoreReviewIntent(raw, "different-actor", candidate.id)).toBeNull();
    expect(restoreReviewIntent(raw, access.subject, "other-candidate")).toBeNull();
  });
  it.each([
    "{",
    "null",
    "[]",
    JSON.stringify({ ...intent, key: "bad" }),
    JSON.stringify({ ...intent, body: { reasonCode: "PROVIDER_HTML" } }),
    JSON.stringify({ ...intent, body: { reasonCode: "OUT_OF_SCOPE", reviewerRef: "spoofed" } }),
  ])("blocks corrupt retry drafts: %s", (raw) => {
    expect(restoreReviewIntent(raw, access.subject, candidate.id)).toBeNull();
  });
});
