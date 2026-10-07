import { describe, expect, it } from "vitest";

import { FixtureAdminRepository } from "@/data/fixtures/fixtureAdminRepository";
import type { AdminCandidate } from "@/domain/admin";
import { candidateReviewVersion } from "@/domain/candidateReviewVersion";
import { buildCandidateCorrections, editablePriceKind, formatEditablePrice } from "./candidateReviewForm";

function formFor(candidate: AdminCandidate): FormData {
  const form = new FormData();
  form.set("candidateVersion", candidateReviewVersion(candidate));
  form.set("title", candidate.final.title.state === "known" ? candidate.final.title.value : "");
  form.set("category", candidate.final.category.state === "known" ? candidate.final.category.value : "");
  form.set("description", candidate.final.description.state === "known" ? candidate.final.description.value : "");
  form.set("startLocal", candidate.final.startLocal.state === "known" ? candidate.final.startLocal.value : "");
  form.set("timezone", candidate.final.timezone.state === "known" ? candidate.final.timezone.value : "");
  form.set("location", candidate.final.location.state === "known" ? candidate.final.location.value : "");
  form.set("organizerId", candidate.final.organizerId.state === "known" ? candidate.final.organizerId.value : "");
  form.set("priceKind", editablePriceKind(candidate.final.price));
  form.set("price", formatEditablePrice(candidate.final.price));
  form.set("level", candidate.final.level.state === "known" ? candidate.final.level.value : "");
  form.set("languages", candidate.final.languages.state === "known" ? candidate.final.languages.value.join(", ") : "");
  form.set(
    "registrationUrl",
    candidate.final.registrationUrl.state === "known" ? candidate.final.registrationUrl.value : "",
  );
  form.set(
    "individualAccess",
    candidate.final.individualAccess.state === "known" ? String(candidate.final.individualAccess.value) : "",
  );
  return form;
}

describe("candidate review form", () => {
  it("does not create corrections when the visible final values are submitted unchanged", async () => {
    const candidate = await new FixtureAdminRepository().getCandidate("candidate-valid-E019");
    if (!candidate) throw new Error("fixture candidate missing");

    expect(buildCandidateCorrections(formFor(candidate), candidate)).toEqual({});
  });

  it("builds structured corrections including essential publication fields", async () => {
    const candidate = await new FixtureAdminRepository().getCandidate("candidate-incomplete-E017");
    if (!candidate) throw new Error("fixture candidate missing");

    const form = formFor(candidate);
    form.set("title", "Título editorial");
    form.set("languages", "ES, EN");
    form.set("individualAccess", "true");

    const corrections = buildCandidateCorrections(form, candidate);

    expect(corrections.title).toEqual({ state: "known", value: "Título editorial" });
    expect(corrections.languages).toEqual({ state: "known", value: ["ES", "EN"] });
    expect(corrections.individualAccess).toEqual({ state: "known", value: true });
    expect(corrections.departureCity).toBeUndefined();
  });

  it("preserves the semantic price kind when only the amount changes", async () => {
    const candidate = await new FixtureAdminRepository().getCandidate("candidate-incomplete-E017");
    if (!candidate || candidate.final.price.state !== "known") throw new Error("fixture price missing");

    const originalKind = candidate.final.price.value.kind;
    const form = formFor(candidate);
    form.set("price", "6 €");

    const corrections = buildCandidateCorrections(form, candidate);

    expect(corrections.price?.state).toBe("known");
    if (corrections.price?.state !== "known") throw new Error("expected known price");
    expect(corrections.price.value.kind).toBe(originalKind);
  });

  it("rejects a negative edited price instead of stripping its sign", async () => {
    const candidate = await new FixtureAdminRepository().getCandidate("candidate-valid-E019");
    if (!candidate) throw new Error("fixture candidate missing");

    const form = formFor(candidate);
    form.set("price", "-5 €");

    expect(() => buildCandidateCorrections(form, candidate)).toThrow("Introduce un precio");
  });

  it("preserves a structured price note when only the amount changes", async () => {
    const candidate = await new FixtureAdminRepository().getCandidate("candidate-incomplete-E017");
    if (!candidate || candidate.final.price.state !== "known") throw new Error("fixture price missing");

    const previousNote = candidate.final.price.value.note;
    const form = formFor(candidate);
    form.set("price", "6 €");

    const corrections = buildCandidateCorrections(form, candidate);
    if (corrections.price?.state !== "known") throw new Error("expected known price");

    expect(corrections.price.value.note).toBe(previousNote);
  });

  it("rejects a malformed edited price instead of silently discarding it", async () => {
    const candidate = await new FixtureAdminRepository().getCandidate("candidate-valid-E019");
    if (!candidate) throw new Error("fixture candidate missing");

    const form = formFor(candidate);
    form.set("price", "precio pendiente");

    expect(() => buildCandidateCorrections(form, candidate)).toThrow("Introduce un precio");
  });
});
