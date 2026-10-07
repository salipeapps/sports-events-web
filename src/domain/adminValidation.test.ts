import { describe, expect, it } from "vitest";

import { known, unknown } from "./admin";
import {
  ContractValidationError,
  deserializeAdminCandidate,
  deserializeEngineRun,
  deserializeSourceConfig,
  canPublishCandidate,
  parseAdminCandidate,
  publicationBlockReasons,
  serializeContract,
} from "./adminValidation";
import { candidateFixtures, runFixtures, sourceFixtures } from "@/data/fixtures/adminFixtures";

describe("admin contracts", () => {
  it("treats an editorial blocked status as a publication guard", () => {
    const source = candidateFixtures.find((candidate) => candidate.id === "candidate-valid-E019");
    if (!source) throw new Error("Expected valid fixture");

    const candidate = parseAdminCandidate({
      ...structuredClone(source),
      editorialStatus: "blocked",
    });

    expect(publicationBlockReasons(candidate)).toContain("editorial_status_blocked");
    expect(canPublishCandidate(candidate)).toBe(false);
  });

  it("keeps unknown distinct from known zero and false", () => {
    expect(known(0)).toEqual({ state: "known", value: 0 });
    expect(known(false)).toEqual({ state: "known", value: false });
    expect(unknown<number>("not_observed")).toEqual({ state: "unknown", reason: "not_observed" });
  });

  it("round-trips a candidate without losing unknown states or payment variants", () => {
    const source = candidateFixtures.find((candidate) => candidate.id === "candidate-payment-variant-E049");
    if (!source) throw new Error("Expected payment variant fixture");

    const decoded = deserializeAdminCandidate(serializeContract(source));
    expect(decoded.final.languages.state).toBe("unknown");
    expect(decoded.final.price).toEqual(source.final.price);
  });

  it("round-trips source and run contracts", () => {
    const source = sourceFixtures[0];
    const run = runFixtures[0];
    expect(deserializeSourceConfig(serializeContract(source))).toEqual(source);
    expect(deserializeEngineRun(serializeContract(run))).toEqual(run);
  });

  it("rejects malformed unknown reasons", () => {
    const malformed = structuredClone(candidateFixtures[0]) as unknown as Record<string, unknown>;
    const final = malformed.final as Record<string, unknown>;
    final.title = { state: "unknown", reason: "made_up_reason" };

    expect(() => parseAdminCandidate(malformed)).toThrow(ContractValidationError);
  });

  it.each([
    ["title", { state: "known", value: 42 }],
    ["individualAccess", { state: "known", value: "yes" }],
    ["price", { state: "known", value: { kind: "fixed" } }],
  ])("rejects invalid known values for %s", (field, invalidValue) => {
    const malformed = structuredClone(candidateFixtures[0]) as unknown as Record<string, unknown>;
    const final = malformed.final as Record<string, unknown>;
    final[field] = invalidValue;

    expect(() => parseAdminCandidate(malformed)).toThrow(ContractValidationError);
  });

  it("validates known values in source and run wrappers", () => {
    const malformedSource = structuredClone(sourceFixtures[0]) as unknown as Record<string, unknown>;
    malformedSource.frequency = { state: "known", value: 6 };
    expect(() => deserializeSourceConfig(JSON.stringify(malformedSource))).toThrow(ContractValidationError);

    const malformedRun = structuredClone(runFixtures[0]) as unknown as Record<string, unknown>;
    malformedRun.durationSeconds = { state: "known", value: "134" };
    expect(() => deserializeEngineRun(JSON.stringify(malformedRun))).toThrow(ContractValidationError);
  });

  it("rejects negative engine run durations", () => {
    const malformedRun = structuredClone(runFixtures[0]) as unknown as Record<string, unknown>;
    malformedRun.durationSeconds = { state: "known", value: -1 };

    expect(() => deserializeEngineRun(JSON.stringify(malformedRun))).toThrow(ContractValidationError);
  });

  it("rejects negative price amounts", () => {
    const malformed = structuredClone(candidateFixtures[0]) as unknown as Record<string, unknown>;
    const final = malformed.final as Record<string, unknown>;
    final.price = {
      state: "known",
      value: {
        kind: "fixed",
        options: [{ amount: -5, currency: "EUR" }],
        perSessionComparable: true,
      },
    };

    expect(() => parseAdminCandidate(malformed)).toThrow(ContractValidationError);
  });

  it("rejects negative source budgets and engine run costs", () => {
    const malformedSource = structuredClone(sourceFixtures[0]) as unknown as Record<string, unknown>;
    malformedSource.budget = {
      state: "known",
      value: { amount: -1, currency: "EUR", period: "monthly" },
    };
    expect(() => deserializeSourceConfig(JSON.stringify(malformedSource))).toThrow(ContractValidationError);

    const malformedRun = structuredClone(runFixtures[0]) as unknown as Record<string, unknown>;
    malformedRun.cost = { state: "known", value: { amount: -1, currency: "EUR" } };
    expect(() => deserializeEngineRun(JSON.stringify(malformedRun))).toThrow(ContractValidationError);
  });

  it("rejects an invalid change-proposal disposition", () => {
    const source = candidateFixtures.find((candidate) => candidate.id === "candidate-change-E023");
    if (!source) throw new Error("Expected change fixture");

    const malformed = structuredClone(source) as unknown as Record<string, unknown>;
    malformed.blockerResolutions = [
      {
        id: "resolution-invalid",
        kind: "change_proposal",
        targetId: "change-E023-time",
        disposition: "maybe",
        at: "2026-10-07T12:00:00.000Z",
        actor: { id: "reviewer-1", role: "reviewer", displayName: "Reviewer" },
        reason: "Invalid disposition fixture",
      },
    ];

    expect(() => parseAdminCandidate(malformed)).toThrow(ContractValidationError);
  });

  it.each(["rules", "evidence", "conflicts", "matches", "blockerResolutions", "history"])(
    "rejects malformed elements inside %s",
    (field) => {
      const malformed = structuredClone(candidateFixtures[0]) as unknown as Record<string, unknown>;
      malformed[field] = [null];

      expect(() => parseAdminCandidate(malformed)).toThrow(ContractValidationError);
    },
  );
});
