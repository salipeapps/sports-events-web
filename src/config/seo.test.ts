import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { indexableOrigin } from "./seo";
import { buildSitemap } from "@/data/publicSitemap";
import type { CatalogPage, CatalogQuery, PublicCatalogRepository } from "@/domain/publicCatalog";

const production = { APP_ENV: "production", APP_ORIGIN: "https://moumeet.example" };

describe("indexability gate (#53)", () => {
  it("allows only an explicit production HTTPS canonical origin", () => {
    expect(indexableOrigin(production)).toBe("https://moumeet.example");
    expect(indexableOrigin({ ...production, VERCEL_ENV: "production" })).toBe("https://moumeet.example");
  });
  it.each([
    { ...production, APP_ENV: "staging" },
    { ...production, APP_ENV: undefined },
    { ...production, VERCEL_ENV: "preview" },
    { ...production, APP_ORIGIN: "http://moumeet.example" },
    { ...production, APP_ORIGIN: "https://moumeet.example/es" },
    { ...production, APP_ORIGIN: "https://user:pass@moumeet.example" },
    { ...production, APP_ORIGIN: "https://moumeet-staging.vercel.app" },
    { ...production, APP_ORIGIN: "https://localhost" },
    { ...production, APP_ORIGIN: "https://moumeet.example:8443" },
    { ...production, APP_ORIGIN: undefined },
    { ...production, APP_ORIGIN: "not a url" },
  ])("is never indexable for %j", (environment) => expect(indexableOrigin(environment)).toBeNull());
});

function repository(pages: CatalogPage[]) {
  const list = vi.fn<(query: CatalogQuery) => Promise<CatalogPage>>();
  pages.forEach((page) => list.mockResolvedValueOnce(page));
  return { list, get: vi.fn() } as unknown as PublicCatalogRepository & { list: typeof list };
}
const item = (id: string) => ({ id, updatedAt: "2026-11-01T10:00:00Z" }) as unknown as CatalogPage["items"][number];

describe("sitemap (#53)", () => {
  const now = new Date("2026-11-07T10:00:00Z");
  it("is empty outside production and never calls the catalogue", async () => {
    const source = repository([]);
    expect(await buildSitemap({ ...production, APP_ENV: "staging" }, source, now)).toEqual([]);
    expect(source.list).not.toHaveBeenCalled();
  });
  it("lists the home and every projected occurrence across cursor pages, once", async () => {
    const source = repository([
      { items: [item("a"), item("b")], nextCursor: "next" },
      { items: [item("b"), item("c")], nextCursor: null },
    ]);
    const entries = await buildSitemap(production, source, now);
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://moumeet.example/",
      "https://moumeet.example/actividades/a",
      "https://moumeet.example/actividades/b",
      "https://moumeet.example/actividades/c",
    ]);
    expect(source.list.mock.calls[1][0]).toMatchObject({ cursor: "next", limit: 100 });
    expect(source.list.mock.calls[0][0]).toMatchObject({
      desde: now.toISOString(),
      hasta: "2026-12-08T10:00:00.000Z",
    });
  });
  it("keeps only what was actually read when the catalogue fails", async () => {
    const source = repository([{ items: [item("a")], nextCursor: "next" }]);
    source.list.mockRejectedValueOnce(new Error("READ_UNAVAILABLE"));
    expect((await buildSitemap(production, source, now)).map((entry) => entry.url)).toEqual([
      "https://moumeet.example/",
      "https://moumeet.example/actividades/a",
    ]);
  });
  it("does not list occurrences when the public catalogue is disabled", async () => {
    expect(await buildSitemap(production, null, now)).toEqual([
      { url: "https://moumeet.example/", changeFrequency: "daily" },
    ]);
  });
});
