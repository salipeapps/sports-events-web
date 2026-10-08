import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FixtureAdminRepository } from "@/data/fixtures/fixtureAdminRepository";
import type { ActivityListItem, PageResult } from "@/domain/admin";
import { AdminRunDetail, AdminRunsCatalog, AdminSourceDetail, AdminSourcesCatalog } from "./AdminSourceRunViews";

describe("Admin source and run observability", () => {
  it("shows the configured source registry and an explicitly unavailable create action", async () => {
    const repository = new FixtureAdminRepository();
    const [sources, runs] = await Promise.all([repository.listSources(), repository.listRuns()]);
    const html = renderToStaticMarkup(<AdminSourcesCatalog sources={sources} runs={runs} query={{}} />);

    for (const heading of ["Fuente", "Tipo", "Cobertura", "Frecuencia", "Estado", "Política", "Última ejecución"]) {
      expect(html).toContain(heading);
    }
    expect(html).toContain("Solo captación");
    expect(html).toContain("Revisión humana");
    expect(html).toContain("Publicación automática");
    expect(html).toContain("Presupuesto agotado");
    expect(html).toContain("Incidencia: Error");
    expect(html).toContain("disabled");
    expect(html).toContain("/admin/sources/S009");
    expect(html).not.toContain("SerpApi");
  });

  it("renders a meaningful empty source filter result", async () => {
    const repository = new FixtureAdminRepository();
    const [sources, runs] = await Promise.all([repository.listSources(), repository.listRuns()]);
    const html = renderToStaticMarkup(
      <AdminSourcesCatalog sources={sources} runs={runs} query={{ q: "no-such-source" }} />,
    );
    expect(html).toContain("No hay resultados");
    expect(html).toContain("0 de");
  });

  it("renders all run columns, errors and unknown cost without inventing spending", async () => {
    const repository = new FixtureAdminRepository();
    const html = renderToStaticMarkup(
      <AdminRunsCatalog runs={await repository.listRuns()} sources={await repository.listSources()} query={{}} />,
    );

    for (const heading of [
      "Inicio",
      "Duración",
      "Nuevos",
      "Actualizados",
      "Descartados",
      "Revisión",
      "Coste / consumo",
      "Estado",
    ]) {
      expect(html).toContain(heading);
    }
    expect(html).toContain("Parcial / incidencia");
    expect(html).toContain("Error");
    expect(html).toContain("Sin dato");
    expect(html).toContain("/admin/runs/fixture-run-8421");
  });

  it("links a source to its actual runs and does not invent a discovery lineage", async () => {
    const repository = new FixtureAdminRepository();
    const sources = await repository.listSources();
    const source = sources.find((item) => item.id === "S001");
    if (!source) throw new Error("Missing source fixture");
    const html = renderToStaticMarkup(<AdminSourceDetail source={source} runs={await repository.listRuns()} />);
    expect(html).toContain("/admin/runs/fixture-run-8421");
    expect(html).toContain("No consta una relación de descubrimiento");
    expect(html).toContain("Configuración y política");

    const withOrigin = {
      ...source,
      discoveryOrigin: {
        candidateId: "discovered-source-12",
        queryId: "query-7",
        executionId: "discovery-run-9",
        reviewUrl: "/admin/discovery/results/discovered-source-12",
      },
    };
    const originHtml = renderToStaticMarkup(<AdminSourceDetail source={withOrigin} runs={[]} />);
    expect(originHtml).toContain("discovered-source-12");
    expect(originHtml).toContain("/admin/discovery/results/discovered-source-12");
  });

  it("shows page navigation and historical published status for large run lineages", async () => {
    const repository = new FixtureAdminRepository();
    const run = (await repository.listRuns()).find((item) => item.id === "fixture-run-8421");
    if (!run) throw new Error("Missing fixture run");
    const sourceItems = await repository.listSources();
    const seed = (await repository.listRunCandidates(run.id)).items[0];
    if (!seed) throw new Error("Missing linked candidate");
    const items: ActivityListItem[] = Array.from({ length: 25 }, (_, i) => ({
      ...seed,
      id: `candidate-paginated-${i}`,
      editorialStatus: i === 0 ? "published" : "candidate",
    }));
    const results: PageResult<ActivityListItem> = { items, total: 122, page: 2, pageSize: 25 };
    const html = renderToStaticMarkup(<AdminRunDetail run={run} sources={sourceItems} candidates={results} />);
    expect(html).toContain("122 candidatos vinculados");
    expect(html).toContain("Publicada");
    expect(html).toContain("?page=1");
    expect(html).toContain("?page=3");
    expect(html).toContain("Página 2 de 5");
    expect(html).toContain("candidate-paginated-24");
  });

  it("links an execution to its real pending candidates and surfaces failed-run incidents", async () => {
    const repository = new FixtureAdminRepository();
    const runs = await repository.listRuns();
    const sources = await repository.listSources();
    const run = runs.find((item) => item.id === "fixture-run-8421");
    if (!run) throw new Error("Missing fixture run");
    const linked = await repository.listRunCandidates(run.id);
    const html = renderToStaticMarkup(<AdminRunDetail run={run} sources={sources} candidates={linked} />);
    expect(html).toContain("Candidatos originados por esta ejecución");
    expect(html).toContain("/admin/candidates/");
    expect(html).toContain("/admin/sources/S001");

    const failedRun = runs.find((item) => item.id === "fixture-run-8419");
    if (!failedRun) throw new Error("Missing failure fixture");
    const failedHtml = renderToStaticMarkup(
      <AdminRunDetail run={failedRun} sources={sources} candidates={{ items: [], total: 0, page: 1, pageSize: 25 }} />,
    );
    expect(failedHtml).toContain("Error");
    expect(failedHtml).toContain("Reintentos");
  });
});
