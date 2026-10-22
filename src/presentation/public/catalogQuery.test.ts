import { describe, expect, it } from "vitest";
import { catalogHref, madridMidnight, selectCatalog } from "./catalogQuery";

const now = new Date("2026-10-22T10:00:00.000Z");
describe("public calendar windows", () => {
  it("includes upcoming starts today and ends after seven local dates", () => {
    expect(selectCatalog({}, now)?.query).toEqual({
      desde: now.toISOString(),
      hasta: "2026-10-28T23:00:00.000Z",
      limit: 24,
      cursor: null,
    });
  });
  it("handles spring and autumn DST without inventing midnight offsets", () => {
    expect(madridMidnight(2026, 3, 29).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(madridMidnight(2026, 3, 30).toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(madridMidnight(2026, 10, 25).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(madridMidnight(2026, 10, 26).toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
  it("retains exactly the same RPC range when following a cursor", () => {
    const first = selectCatalog({}, now)!;
    const link = new URL(catalogHref(first.month, "page_2", first.at), "http://localhost");
    const next = selectCatalog(Object.fromEntries(link.searchParams), new Date("2026-10-22T10:01:00Z"))!;
    expect(next.query).toEqual({ ...first.query, cursor: "page_2" });
  });
  it("covers every hour of a future 31-day autumn month in bounded RPC segments", () => {
    const start = new Date("2026-09-15T10:00:00Z");
    const first = selectCatalog({ month: "2026-10" }, start)!;
    const tail = selectCatalog({ month: "2026-10", tail: "1", at: first.at }, start)!;
    expect(first.hasTail).toBe(true);
    expect(first.query.desde).toBe("2026-09-30T22:00:00.000Z");
    expect(first.query.hasta).toBe(tail.query.desde);
    expect(tail.query.hasta).toBe("2026-10-31T23:00:00.000Z");
    for (const query of [first.query, tail.query])
      expect(Date.parse(query.hasta) - Date.parse(query.desde)).toBeLessThanOrEqual(31 * 86_400_000);
  });
  it("uses a rolling current month without including earlier starts", () => {
    const selected = selectCatalog({ month: "2026-10" }, now)!;
    expect(selected.query.desde).toBe(now.toISOString());
    expect(selected.query.hasta).toBe("2026-10-31T23:00:00.000Z");
    expect(selected.previousMonth).toBeNull();
  });
  it.each([
    { month: "2026-02" },
    { month: "2026-13" },
    { month: ["2026-10", "2026-11"] },
    { month: "2100-01" },
    { cursor: "bad!cursor" },
    { cursor: ["one", "two"] },
    { at: "2026-10-01T00:00:00Z" },
    { at: "2026-10-23T00:00:00Z" },
    { at: "garbage" },
    { tail: "1" },
  ])("rejects invalid/expired navigation %j", (query) => expect(selectCatalog(query, now)).toBeNull());
});
