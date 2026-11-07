import { describe, expect, it } from "vitest";
import { catalogHref, parseFilters, periodRange, selectCatalog } from "./catalogQuery";

// Thursday 22/10/2026 12:00 Madrid (CEST).
const thursday = new Date("2026-10-22T10:00:00.000Z");
const iso = (date: Date) => date.toISOString();

describe("Madrid period presets (#51)", () => {
  it("today runs from now until local midnight", () => {
    expect(selectCatalog({ periodo: "hoy" }, thursday)?.query).toEqual({
      desde: iso(thursday),
      hasta: "2026-10-22T22:00:00.000Z",
      cursor: null,
      limit: 24,
    });
  });
  it("tomorrow is the next full local day", () => {
    const { query, label } = selectCatalog({ periodo: "manana" }, thursday)!;
    expect([query.desde, query.hasta, label]).toEqual([
      "2026-10-22T22:00:00.000Z",
      "2026-10-23T22:00:00.000Z",
      "Mañana",
    ]);
  });
  it("the weekend crossing the autumn DST change lasts 49 real hours", () => {
    const { from, to } = periodRange("finde", thursday);
    expect([iso(from), iso(to)]).toEqual(["2026-10-23T22:00:00.000Z", "2026-10-25T23:00:00.000Z"]);
    expect(to.getTime() - from.getTime()).toBe(49 * 3_600_000);
  });
  it("Friday 23:30 still starts the weekend at Saturday midnight", () => {
    const { from } = periodRange("finde", new Date("2026-10-23T21:30:00Z"));
    expect(iso(from)).toBe("2026-10-23T22:00:00.000Z");
  });
  it("on Saturday and Sunday the weekend starts now and ends Monday midnight", () => {
    const saturday = new Date("2026-10-24T08:00:00Z");
    expect(iso(periodRange("finde", saturday).from)).toBe(iso(saturday));
    expect(iso(periodRange("finde", saturday).to)).toBe("2026-10-25T23:00:00.000Z");
    const sundayNight = new Date("2026-10-25T22:30:00Z"); // 23:30 CET
    expect(iso(periodRange("finde", sundayNight).to)).toBe("2026-10-25T23:00:00.000Z");
    expect(iso(periodRange("hoy", sundayNight).to)).toBe("2026-10-25T23:00:00.000Z");
  });
  it("spring DST weekend lasts 47 real hours", () => {
    const { from, to } = periodRange("finde", new Date("2026-03-26T10:00:00Z"));
    expect(to.getTime() - from.getTime()).toBe(47 * 3_600_000);
  });
  it.each([{ periodo: "ayer" }, { periodo: ["hoy", "manana"] }, { periodo: "hoy", month: "2026-11" }])(
    "rejects invalid period %j",
    (params) => expect(selectCatalog(params, thursday)).toBeNull(),
  );
});

describe("server-side filters supported by the H2 RPC (#51)", () => {
  it("maps validated filters to the RPC body only when present", () => {
    const { query } = selectCatalog(
      { categoria: "yoga", municipio: "  València  ", idioma: "en", precio: "sin-sesion" },
      thursday,
    )!;
    expect(query).toMatchObject({
      categoria: "yoga",
      municipio: "València",
      idioma: "en",
      precioComparable: false,
    });
    expect(selectCatalog({ precio: "sesion" }, thursday)!.query.precioComparable).toBe(true);
    const plain = selectCatalog({ categoria: "", municipio: " ", idioma: "", precio: "" }, thursday)!.query;
    expect(Object.keys(plain).sort()).toEqual(["cursor", "desde", "hasta", "limit"]);
  });
  it.each([
    { categoria: "boxeo" },
    { categoria: ["yoga", "running"] },
    { idioma: "de" },
    { precio: "gratis" },
    { municipio: "<script>" },
    { municipio: "https://example.org" },
    { municipio: "600111222" },
    { municipio: "a".repeat(101) },
  ])("rejects unsupported or unsafe filter %j instead of guessing", (params) => {
    expect(parseFilters(params)).toBeNull();
    expect(selectCatalog(params, thursday)).toBeNull();
  });
  it("accepts real Valencian place names", () => {
    for (const municipio of ["València", "L'Eliana", "Alboraia", "Sant Antoni de Benagéber", "El Puig de Santa Maria"])
      expect(parseFilters({ municipio })?.municipio).toBe(municipio);
  });
  it("a shared link reproduces period, filters and cursor exactly", () => {
    const first = selectCatalog({ periodo: "finde", categoria: "hiking", municipio: "València" }, thursday)!;
    const link = new URL(
      catalogHref({ period: first.period, filters: first.filters }, "page_2", first.at),
      "http://localhost",
    );
    expect(link.searchParams.get("municipio")).toBe("València");
    const next = selectCatalog(Object.fromEntries(link.searchParams), new Date("2026-10-22T10:05:00Z"))!;
    expect(next.query).toEqual({ ...first.query, cursor: "page_2" });
    expect(next.filters).toEqual(first.filters);
  });
  it("reset keeps the period but drops every filter", () => {
    expect(catalogHref({ period: "hoy" })).toBe("/?periodo=hoy#activities");
    expect(catalogHref({ month: "2026-11" })).toBe("/?month=2026-11#activities");
    expect(catalogHref(null)).toBe("/#activities");
  });
});
