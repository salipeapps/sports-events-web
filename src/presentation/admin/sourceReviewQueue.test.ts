import { describe, expect, it } from "vitest";

import type { DiscoveryCandidate } from "@/integrations/discovery/readApi";
import {
  activeSourceQueueView,
  classificationLabel,
  classificationReasonLabel,
  classificationTone,
  reviewStatusLabel,
  reviewStatusTone,
  sourceCandidateGuidance,
  sourceQueueHref,
  sourceQueueViews,
} from "./sourceReviewQueue";

describe("read-only review queue filters", () => {
  it("sends each preset to a supported engine filter without inventing a promoted/date filter", () => {
    const expected = {
      all: {},
      pending: { reviewStatus: "PENDING_REVIEW" },
      supported: { classificationKind: "SUPPORTED_ADAPTER_CANDIDATE" },
      unsupported: { classificationKind: "UNSUPPORTED_REVIEWABLE" },
      ambiguous: { classificationKind: "AMBIGUOUS_REVIEW_REQUIRED" },
      rejected: { reviewStatus: "REJECTED" },
      approved: { reviewStatus: "APPROVED" },
    };
    expect(sourceQueueViews.map((view) => view.id)).toEqual(Object.keys(expected));
    for (const view of sourceQueueViews) {
      const url = new URL(sourceQueueHref(view.id, {}), "https://example.test");
      expect(url.pathname).toBe("/admin/discovery");
      expect(url.searchParams.get("tab")).toBe("resultados");
      expect(Object.fromEntries([...url.searchParams].filter(([key]) => key !== "tab"))).toEqual(expected[view.id]);
      expect(activeSourceQueueView(expected[view.id])).toBe(view.id);
    }
  });

  it("preserves the backend context but discards contradictory review filters and cursors", () => {
    const href = sourceQueueHref("ambiguous", {
      tab: "resultados",
      reviewStatus: "REJECTED",
      classificationKind: "UNSUPPORTED_REVIEWABLE",
      cursor: "previous-page",
      providerKey: "serpapi",
      queryId: "01111111-1111-4111-8111-111111111111",
      search: "running Valencia",
      dateFrom: "2026-10-01",
    });
    const params = new URL(href, "https://example.test").searchParams;
    expect(params.get("classificationKind")).toBe("AMBIGUOUS_REVIEW_REQUIRED");
    expect(params.has("reviewStatus")).toBe(false);
    expect(params.has("cursor")).toBe(false);
    expect(params.get("providerKey")).toBe("serpapi");
    expect(params.get("search")).toBe("running Valencia");
    expect(params.has("dateFrom")).toBe(false);
  });

  it("does not claim a preset is active when multiple advanced status filters are combined", () => {
    expect(
      activeSourceQueueView({
        reviewStatus: "PENDING_REVIEW",
        classificationKind: "UNSUPPORTED_REVIEWABLE",
      }),
    ).toBeNull();
  });
});

describe("candidate classification and review presentation", () => {
  const candidate = {
    reviewStatus: "PENDING_REVIEW",
    linkedSourceId: null,
    classification: { kind: "UNSUPPORTED_REVIEWABLE" },
  } as DiscoveryCandidate;

  it("uses clear labels without hiding unfamiliar server values", () => {
    expect(reviewStatusLabel("PENDING_REVIEW")).toBe("Pendiente de revisión");
    expect(reviewStatusTone("APPROVED")).toBe("success");
    expect(reviewStatusTone("REJECTED")).toBe("danger");
    expect(classificationLabel("UNSUPPORTED_REVIEWABLE")).toBe("Requiere adaptador");
    expect(classificationLabel("AMBIGUOUS_REVIEW_REQUIRED")).toBe("Revisión técnica necesaria");
    expect(classificationTone("SUPPORTED_ADAPTER_CANDIDATE")).toBe("success");
    expect(classificationReasonLabel("NO_CAPABILITY")).toBe("No hay adaptador compatible");
    expect(classificationReasonLabel("MODIFIED_URL")).toBe("La URL requiere comprobación");
    expect(classificationLabel("FUTURE_KIND")).toBe("FUTURE_KIND");
    expect(classificationReasonLabel("NEW_REASON")).toBe("NEW_REASON");
  });

  it.each(["SUPPORTED_ADAPTER_CANDIDATE", "UNSUPPORTED_REVIEWABLE", "AMBIGUOUS_REVIEW_REQUIRED"])(
    "keeps already approved %s sources distinct from B2 promotion",
    (kind) => {
      const guidance = sourceCandidateGuidance({
        ...candidate,
        reviewStatus: "APPROVED",
        classification: { ...candidate.classification!, kind },
      });
      expect(guidance).toContain("Aprobación registrada");
      expect(guidance).toContain("todavía no consta una fuente B2 vinculada");
      expect(guidance).not.toContain("requiere una revisión");
      expect(guidance).not.toContain("antes de tomar una decisión");
    },
  );

  it("prioritizes recorded rejection and linked B2 source over technical classification", () => {
    const rejection = sourceCandidateGuidance({
      ...candidate,
      reviewStatus: "REJECTED",
      classification: { ...candidate.classification!, kind: "SUPPORTED_ADAPTER_CANDIDATE" },
    });
    expect(rejection).toContain("Rechazada");

    const linked = sourceCandidateGuidance({
      ...candidate,
      reviewStatus: "APPROVED",
      linkedSourceId: "01010101-1111-4111-8111-111111111111",
    });
    expect(linked).toContain("Vinculada a una fuente B2");
    expect(linked).not.toContain("todavía no consta");
  });

  it("does not imply approval or promotion for incompatible or ambiguous candidates", () => {
    expect(sourceCandidateGuidance(candidate)).toContain("todavía no puede pasar a captura B2");
    expect(
      sourceCandidateGuidance({
        ...candidate,
        classification: { ...candidate.classification!, kind: "AMBIGUOUS_REVIEW_REQUIRED" },
      }),
    ).toContain("Comprobar manualmente");
    expect(
      sourceCandidateGuidance({
        ...candidate,
        classification: { ...candidate.classification!, kind: "SUPPORTED_ADAPTER_CANDIDATE" },
      }),
    ).toContain("aprobación requiere una revisión");
    expect(
      sourceCandidateGuidance({
        ...candidate,
        linkedSourceId: "01010101-1111-4111-8111-111111111111",
      }),
    ).toContain("no implica captación ni publicación automática");
  });
});
