import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DiscoveryCandidate } from "@/integrations/discovery/readApi";

import { candidatePageHref, LiveCandidateDetail, LiveDiscoveryOverview } from "./LiveDiscovery";

describe("independently paginated candidate sections", () => {
  const candidateId = "ca73b0ff-8001-4000-8000-111111111111";

  it("keeps the review cursor when advancing observations", () => {
    const href = candidatePageHref(candidateId, "observations", "observation:next", "review+previous");
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.get("observationsCursor")).toBe("observation:next");
    expect(url.searchParams.get("reviewsCursor")).toBe("review+previous");
  });

  it("keeps the observation cursor when advancing reviews", () => {
    const href = candidatePageHref(candidateId, "reviews", "review:next", "observation+previous");
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.get("reviewsCursor")).toBe("review:next");
    expect(url.searchParams.get("observationsCursor")).toBe("observation+previous");
  });

  it("omits absent sibling cursors on first-page navigation", () => {
    const href = candidatePageHref(candidateId, "observations", "opaque");
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.get("reviewsCursor")).toBeNull();
  });
});

const sampleCandidate: DiscoveryCandidate = {
  id: "ca73b0ff-8001-4000-8000-111111111111",
  canonicalUrl: "https://example.test/source",
  firstObservedAt: "2026-10-08T09:00:00Z",
  lastObservedAt: "2026-10-09T09:00:00Z",
  reviewStatus: "PENDING_REVIEW",
  latestReviewId: null,
  linkedSourceId: null,
  classification: {
    kind: "UNSUPPORTED_REVIEWABLE",
    reason: "NO_CAPABILITY",
    sourceFamily: null,
    proposedAdapterKey: null,
    knownSourceId: null,
    ruleVersion: 1,
    classifiedAt: "2026-10-09T09:00:00Z",
  },
  observationCount: 1,
  minPosition: 1,
  maxPosition: 1,
  latestObservation: {
    id: "3afeef88-1111-4000-8000-111111111111",
    candidateId: "ca73b0ff-8001-4000-8000-111111111111",
    knownSourceId: null,
    queryId: "11a2a2a2-1111-4000-8000-111111111111",
    executionId: "20a2a2a2-1111-4000-8000-111111111111",
    providerKey: "serpapi",
    originalUrl: "https://example.test/source?from=search",
    observedAt: "2026-10-09T09:00:00Z",
    title: "Club de running de Valencia",
    snippet: "Entrenamientos organizados para corredores",
    resultPosition: 1,
  },
  source: null,
  latestReview: null,
};

describe("read-only review queue rendering", () => {
  it("presents real candidate states, a review filter and inspection without write actions", () => {
    const html = renderToStaticMarkup(
      createElement(LiveDiscoveryOverview, {
        tab: "resultados",
        params: { classificationKind: "UNSUPPORTED_REVIEWABLE" },
        data: { items: [sampleCandidate], nextCursor: null },
      }),
    );
    expect(html).toContain("Candidatos a fuentes");
    expect(html).toContain("Filtrar cola de revisión");
    expect(html).toContain("Sin adaptador");
    expect(html).toContain("Requiere adaptador");
    expect(html).toContain("Pendiente de revisión");
    expect(html).toContain("Inspeccionar");
    expect(html).toContain("Mostrando 1 candidato(s) en esta página");
    expect(html).toContain("no es un contador global");
    expect(html).toContain("/admin/discovery/results/" + sampleCandidate.id);
    expect(html).not.toContain('type="submit" value="Rechazar"');
    expect(html).not.toContain("Ejecutar búsqueda</button>");
  });

  it("shows source provenance and read-only guidance without offering a false B2 approval", () => {
    const html = renderToStaticMarkup(
      createElement(LiveCandidateDetail, {
        detail: { candidate: sampleCandidate, promotion: null },
        observations: { items: [sampleCandidate.latestObservation!], nextCursor: null },
        reviews: { items: [], nextCursor: null },
        cursors: {},
      }),
    );
    expect(html).toContain("Inspección de fuente candidata");
    expect(html).toContain("Primera observación");
    expect(html).toContain("Descripción observada");
    expect(html).toContain("No hay adaptador compatible");
    expect(html).toContain("Conservar para estudiar un adaptador");
    expect(html).toContain("Sin decisiones");
    expect(html).toContain("Rechazo bloqueado");
    expect(html).toContain("Promoción bloqueada");
    expect(html).toContain("No requiere enviar una decisión");
    expect(html).not.toContain("<button");
  });

  it("does not label approved candidates as promoted without a linked B2 source", () => {
    const html = renderToStaticMarkup(
      createElement(LiveDiscoveryOverview, {
        tab: "resultados",
        params: { reviewStatus: "APPROVED" },
        data: {
          items: [
            {
              ...sampleCandidate,
              reviewStatus: "APPROVED",
              latestReviewId: "ca73b0ff-8001-4000-8000-222222222222",
            },
          ],
          nextCursor: null,
        },
      }),
    );
    expect(html).toContain("Aprobada");
    expect(html).not.toContain("Promovida");
  });
});
