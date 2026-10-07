import { describe, expect, it } from "vitest";

import { known, unknown } from "./admin";
import {
  ContractValidationError,
  deserializeAdminCandidate,
  deserializeEngineRun,
  deserializeSourceConfig,
  parseAdminCandidate,
  serializeContract,
} from "./adminValidation";
import { candidateFixtures, runFixtures, sourceFixtures } from "@/data/fixtures/adminFixtures";

describe("admin contracts", () => {
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

  it("rejects malformed field values", () => {
    const malformed = structuredClone(candidateFixtures[0]) as unknown as Record<string, unknown>;
    const final = malformed.final as Record<string, unknown>;
    final.title = { state: "unknown", reason: "made_up_reason" };

    expect(() => parseAdminCandidate(malformed)).toThrow(ContractValidationError);
  });
});
