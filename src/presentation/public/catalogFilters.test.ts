import { describe, expect, it } from "vitest";
import {
  catalogHref,
  catalogReturnHref,
  filterEntries,
  needsAdvancedFilters,
  parseFilters,
  periodRange,
  selectCatalog,
  type CatalogSearchParams,
} from "./catalogQuery";

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

/** Next.js searchParams: a repeated key becomes an array. */
function searchParams(href: string): CatalogSearchParams {
  const params: CatalogSearchParams = {};
  for (const [key, value] of new URL(href, "http://localhost").searchParams) {
    const previous = params[key];
    params[key] = previous === undefined ? value : [...(typeof previous === "string" ? [previous] : previous), value];
  }
  return params;
}

describe("server-side filters (#51)", () => {
  it("maps validated filters to the RPC query only when present", () => {
    const { query } = selectCatalog(
      { categoria: "yoga", municipio: "  València  ", idioma: "en", precio: "sin-sesion" },
      thursday,
    )!;
    expect(query).toMatchObject({
      categorias: ["yoga"],
      municipios: ["València"],
      idiomas: ["en"],
      precioComparable: false,
    });
    expect(selectCatalog({ precio: "sesion" }, thursday)!.query.precioComparable).toBe(true);
    const plain = selectCatalog(
      { q: " ", categoria: "", municipio: " ", barrio: "", nivel: "", idioma: "", precio: "", "precio-max": "" },
      thursday,
    )!.query;
    expect(Object.keys(plain).sort()).toEqual(["cursor", "desde", "hasta", "limit"]);
  });
  it.each([
    { categoria: "boxeo" },
    { categoria: ["yoga", "boxeo"] },
    { idioma: "de" },
    { precio: "gratis" },
    { municipio: "<script>" },
    { municipio: "https://example.org" },
    { municipio: "600111222" },
    { municipio: "a".repeat(101) },
    { municipio: Array.from({ length: 11 }, (_, index) => `Pueblo ${String.fromCharCode(65 + index)}`) },
    { barrio: "Ruzafa <b>" },
    { nivel: "-- drop" },
    { q: "a" },
    { q: "yoga a" },
    { q: "aa bb cc dd ee ff gg" },
    { q: "x".repeat(101) },
    { q: ["yoga", "running"] },
    { gratis: "0" },
    { gratis: "true" },
    { "precio-max": "-1" },
    { "precio-max": "10000.01" },
    { "precio-max": "12.345" },
    { "precio-max": "1e3" },
    { "precio-max": ["10", "20"] },
  ])("rejects unsupported, unsafe or extreme filter %j instead of guessing", (params) => {
    expect(parseFilters(params)).toBeNull();
    expect(selectCatalog(params, thursday)).toBeNull();
  });
  it("accepts real Valencian place names", () => {
    for (const municipio of ["València", "L'Eliana", "Alboraia", "Sant Antoni de Benagéber", "El Puig de Santa Maria"])
      expect(parseFilters({ municipio })?.municipios).toEqual([municipio]);
    expect(parseFilters({ barrio: "Sant Marcel·lí" })?.barrios).toEqual(["Sant Marcel·lí"]);
  });
  it("collects several values per dimension from repeated keys and commas, without duplicates", () => {
    const filters = parseFilters({
      categoria: ["yoga", "running", "yoga"],
      municipio: "València, Alboraia,,",
      idioma: ["es", "ca"],
      nivel: "Iniciación/intermedio, Nivel 2",
      barrio: ["Benimaclet", "Russafa"],
    })!;
    expect(filters).toMatchObject({
      categorias: ["yoga", "running"],
      municipios: ["València", "Alboraia"],
      idiomas: ["es", "ca"],
      niveles: ["Iniciación/intermedio", "Nivel 2"],
      barrios: ["Benimaclet", "Russafa"],
    });
    expect(needsAdvancedFilters(filters)).toBe(true);
    expect(needsAdvancedFilters(parseFilters({ categoria: "yoga", municipio: "València" })!)).toBe(false);
  });
  it("maps text, free and maximum price to the v3 query", () => {
    const { query } = selectCatalog({ q: "  Yoga   Turia ", gratis: "1", "precio-max": "12,5" }, thursday)!;
    expect(query).toMatchObject({ q: "Yoga Turia", gratis: true, precioMax: 12.5 });
    expect(selectCatalog({ "precio-max": "0" }, thursday)!.query.precioMax).toBe(0);
    expect(selectCatalog({ "precio-max": "10000" }, thursday)!.query.precioMax).toBe(10_000);
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
  it("a shared multi-value v3 link round-trips every dimension in canonical order", () => {
    const first = selectCatalog(
      {
        periodo: "finde",
        q: "ruta turia",
        categoria: ["hiking", "running"],
        municipio: "València, Alboraia",
        barrio: "Benimaclet",
        idioma: ["es", "en"],
        nivel: "Iniciación",
        gratis: "1",
        "precio-max": "15",
        precio: "sesion",
      },
      thursday,
    )!;
    const href = catalogHref({ period: first.period, filters: first.filters }, "page_2", first.at);
    expect(href).toBe(
      "/?periodo=finde&q=ruta+turia&categoria=hiking&categoria=running&municipio=Val%C3%A8ncia&municipio=Alboraia" +
        "&barrio=Benimaclet&idioma=es&idioma=en&nivel=Iniciaci%C3%B3n&gratis=1&precio-max=15&precio=sesion" +
        `&cursor=page_2&at=${encodeURIComponent(first.at)}#activities`,
    );
    const next = selectCatalog(searchParams(href), new Date("2026-10-22T10:05:00Z"))!;
    expect(next.query).toEqual({ ...first.query, cursor: "page_2" });
    expect(next.filters).toEqual(first.filters);
    expect(filterEntries(next.filters)).toEqual(filterEntries(first.filters));
  });
  it("reset keeps the period but drops every filter", () => {
    expect(catalogHref({ period: "hoy" })).toBe("/?periodo=hoy#activities");
    expect(catalogHref({ month: "2026-11" })).toBe("/?month=2026-11#activities");
    expect(catalogHref(null)).toBe("/#activities");
  });
});

describe("return to the catalogue search (#54 QA)", () => {
  const origin = "https://sports-events-web-staging.vercel.app";
  it("keeps month, filters and page from a same-origin home referrer", () => {
    expect(
      catalogReturnHref(`${origin}/?month=2026-11&categoria=running&municipio=Val%C3%A8ncia#activities`, origin),
    ).toBe("/?month=2026-11&categoria=running&municipio=Val%C3%A8ncia#activities");
    expect(catalogReturnHref(`${origin}/`, origin)).toBe("/#activities");
  });
  it("ignores other origins, other paths and malformed referrers", () => {
    expect(catalogReturnHref("https://evil.example/?categoria=running", origin)).toBeNull();
    expect(catalogReturnHref(`${origin}/actividades/00000000-0000-4000-8000-000000000001`, origin)).toBeNull();
    expect(catalogReturnHref(`${origin}/admin?month=2026-11`, origin)).toBeNull();
    expect(catalogReturnHref("not a url", origin)).toBeNull();
    expect(catalogReturnHref("", origin)).toBeNull();
  });
});
