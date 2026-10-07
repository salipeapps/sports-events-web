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

  it("reuses the same catalog pattern for the candidates shortcut", async () => {
    const model = await loadActivityCatalog(new FixtureAdminRepository(), {}, "candidates");
    const html = renderToStaticMarkup(<AdminActivityCatalog model={model} />);

    expect(html).toContain("<h1>Candidatos</h1>");
    expect(html).toContain("Candidatas");
    expect(html).toContain("Revisión");
    expect(html).not.toContain("Publicadas (");
  });
});
