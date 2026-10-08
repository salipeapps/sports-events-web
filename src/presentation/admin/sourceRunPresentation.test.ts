import { describe, expect, it } from "vitest";

import { known, unknown } from "@/domain/admin";
import { runFixtures, sourceFixtures } from "@/data/fixtures/adminFixtures";
import {
  effectiveSourceState,
  filterRuns,
  filterSources,
  formatDuration,
  formatMoney,
  sourceBudgetLabel,
} from "./sourceRunPresentation";

describe("source and run presentation", () => {
  it("distinguishes blocked, paused, active and simulated budget exhaustion", () => {
    expect(effectiveSourceState(sourceFixtures.find((source) => source.id === "S001")!)).toBe("active");
    expect(effectiveSourceState(sourceFixtures.find((source) => source.id === "S009")!)).toBe("paused");
    expect(effectiveSourceState(sourceFixtures.find((source) => source.id === "S011")!)).toBe("blocked");
    expect(effectiveSourceState(sourceFixtures.find((source) => source.id === "S038")!)).toBe("budget_exhausted");
  });

  it("filters by source state and searchable coverage without treating discovery providers as sources", () => {
    const paused = filterSources(sourceFixtures, { status: "paused" });
    expect(paused.map((source) => source.id)).toEqual(["S009"]);
    const search = filterSources(sourceFixtures, { q: "beach_sports" });
    expect(search.map((source) => source.id)).toContain("S006");
    expect(filterSources(sourceFixtures, { q: "nonexistent-coverage" })).toEqual([]);
  });

  it("filters executions by source and state and orders them by newest first", () => {
    expect(filterRuns(runFixtures, sourceFixtures, { status: "failed" }).map((run) => run.id)).toEqual([
      "fixture-run-8419",
    ]);
    expect(filterRuns(runFixtures, sourceFixtures, { source: "S001" }).map((run) => run.id)).toEqual([
      "fixture-run-8421",
    ]);
    expect(filterRuns(runFixtures, sourceFixtures, {}).map((run) => run.id)).toEqual([
      "fixture-run-8421",
      "fixture-run-8420",
      "fixture-run-8419",
    ]);
    const discovered = { ...runFixtures[0], id: "discovery-example", kind: "discovery" as const };
    expect(filterRuns([...runFixtures, discovered], sourceFixtures, {})).toHaveLength(3);
  });

  it("never represents unknown spending as zero and keeps known zero distinct", () => {
    expect(formatMoney(unknown("not_observed"))).toBe("Sin dato");
    expect(formatMoney(known({ amount: 0, currency: "EUR" }))).toContain("0");
    expect(formatDuration(unknown("not_verified"))).toBe("No verificado");
    expect(sourceBudgetLabel(sourceFixtures.find((source) => source.id === "S038")!)).toBe(
      "Agotado (escenario)",
    );
  });
});
