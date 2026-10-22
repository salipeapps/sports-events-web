import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FixtureAdminRepository } from "@/data/fixtures/fixtureAdminRepository";
import { AdminActivityCatalog } from "./AdminActivityCatalog";
import { loadActivityCatalog } from "./adminActivityLoader";

describe("AdminActivityCatalog", () => {
  it("renders the Figma activities tabs and repository-backed filters", async () => {
    const model = await loadActivityCatalog(new FixtureAdminRepository(), {}, "activities");
    const html = renderToStaticMarkup(<AdminActivityCatalog model={model} />);

    expect(html).toContain("Publicadas");
    expect(html).toContain("Candidatas");
    expect(html).toContain("Revisión");
    expect(html).toContain("Canceladas");
    expect(html).toContain("Archivadas");
    expect(html).toContain("Buscar actividades");
    expect(html).toContain("Acciones en lote");
  });

  it("recovers from a requested page beyond the available result set", async () => {
    const model = await loadActivityCatalog(new FixtureAdminRepository(), { page: "999" }, "activities");

    expect(model.total).toBeGreaterThan(0);
    expect(model.pagination.page).toBe(1);
    expect(model.rows.length).toBeGreaterThan(0);
    expect(model.pagination.from).toBe(1);
  });

  it("reuses the same catalog pattern for the candidates shortcut", async () => {
    const model = await loadActivityCatalog(new FixtureAdminRepository(), {}, "candidates");
    const html = renderToStaticMarkup(<AdminActivityCatalog model={model} />);

    expect(html).toContain("<h1>Candidatos</h1>");
    expect(html).toContain("Candidatas");
    expect(html).toContain("Revisión");
    expect(html).not.toContain("Publicadas (");
  });

  it("renders a successful empty search separately from unavailable data, without pagination links", async () => {
    const model = await loadActivityCatalog(
      new FixtureAdminRepository(),
      { q: "no-match-empty-search", page: "99" },
      "candidates",
    );
    const html = renderToStaticMarkup(<AdminActivityCatalog model={model} />);
    expect(model.rows).toEqual([]);
    expect(model.total).toBe(0);
    expect(html).toContain("0 resultados");
    expect(html).not.toMatch(/NOT_AVAILABLE|READ_UNAVAILABLE|aria-label="Paginación del catálogo"/);
  });
});
