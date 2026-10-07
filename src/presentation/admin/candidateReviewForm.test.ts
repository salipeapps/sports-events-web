import { describe, expect, it } from "vitest";

import { FixtureAdminRepository } from "@/data/fixtures/fixtureAdminRepository";
import { buildCandidateCorrections, formatEditablePrice } from "./candidateReviewForm";

describe("candidate review form", () => {
  it("does not create corrections when the visible final values are submitted unchanged", async () => {
    const candidate = await new FixtureAdminRepository().getCandidate("candidate-valid-E019");
    if (!candidate) throw new Error("fixture candidate missing");

    const form = new FormData();
    form.set("title", candidate.final.title.state === "known" ? candidate.final.title.value : "");
    form.set("category", candidate.final.category.state === "known" ? candidate.final.category.value : "");
    form.set("description", candidate.final.description.state === "known" ? candidate.final.description.value : "");
    form.set("startLocal", candidate.final.startLocal.state === "known" ? candidate.final.startLocal.value : "");
    form.set("location", candidate.final.location.state === "known" ? candidate.final.location.value : "");
    form.set("organizerId", candidate.final.organizerId.state === "known" ? candidate.final.organizerId.value : "");
    form.set("price", formatEditablePrice(candidate.final.price));
    form.set("level", candidate.final.level.state === "known" ? candidate.final.level.value : "");
    form.set("languages", candidate.final.languages.state === "known" ? candidate.final.languages.value.join(", ") : "");

    expect(buildCandidateCorrections(form, candidate)).toEqual({});
  });

  it("builds structured corrections without touching unrelated final fields", async () => {
    const candidate = await new FixtureAdminRepository().getCandidate("candidate-valid-E019");
    if (!candidate) throw new Error("fixture candidate missing");

    const form = new FormData();
    form.set("title", "Título editorial");
    form.set("category", candidate.final.category.state === "known" ? candidate.final.category.value : "");
    form.set("description", candidate.final.description.state === "known" ? candidate.final.description.value : "");
    form.set("startLocal", candidate.final.startLocal.state === "known" ? candidate.final.startLocal.value : "");
    form.set("location", candidate.final.location.state === "known" ? candidate.final.location.value : "");
    form.set("organizerId", candidate.final.organizerId.state === "known" ? candidate.final.organizerId.value : "");
    form.set("price", "8 € efectivo / 9 € Bizum");
    form.set("level", candidate.final.level.state === "known" ? candidate.final.level.value : "");
    form.set("languages", "ES, EN");

    const corrections = buildCandidateCorrections(form, candidate);

    expect(corrections.title).toEqual({ state: "known", value: "Título editorial" });
    expect(corrections.price?.state).toBe("known");
    expect(corrections.languages).toEqual({ state: "known", value: ["ES", "EN"] });
    expect(corrections.timezone).toBeUndefined();
    expect(corrections.registrationUrl).toBeUndefined();
  });

  it("rejects a malformed edited price instead of silently discarding it", async () => {
    const candidate = await new FixtureAdminRepository().getCandidate("candidate-valid-E019");
    if (!candidate) throw new Error("fixture candidate missing");

    const form = new FormData();
    form.set("title", candidate.final.title.state === "known" ? candidate.final.title.value : "");
    form.set("category", candidate.final.category.state === "known" ? candidate.final.category.value : "");
    form.set("description", candidate.final.description.state === "known" ? candidate.final.description.value : "");
    form.set("startLocal", candidate.final.startLocal.state === "known" ? candidate.final.startLocal.value : "");
    form.set("location", candidate.final.location.state === "known" ? candidate.final.location.value : "");
    form.set("organizerId", candidate.final.organizerId.state === "known" ? candidate.final.organizerId.value : "");
    form.set("price", "precio pendiente");
    form.set("level", candidate.final.level.state === "known" ? candidate.final.level.value : "");
    form.set("languages", candidate.final.languages.state === "known" ? candidate.final.languages.value.join(", ") : "");

    expect(() => buildCandidateCorrections(form, candidate)).toThrow("Introduce un precio");
  });
});
