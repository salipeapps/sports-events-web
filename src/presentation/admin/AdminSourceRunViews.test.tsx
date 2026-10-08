import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FixtureAdminRepository } from "@/data/fixtures/fixtureAdminRepository";
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

  it("links an execution to its real pending candidates and surfaces failed-run incidents", async () => {
    const repository = new FixtureAdminRepository();
    const runs = await repository.listRuns();
    const sources = await repository.listSources();
    const run = runs.find((item) => item.id === "fixture-run-8421");
    if (!run) throw new Error("Missing fixture run");
    const linked = await repository.listCandidates({ executionId: run.id });
    const html = renderToStaticMarkup(<AdminRunDetail run={run} sources={sources} candidates={linked.items} />);
    expect(html).toContain("Candidatos originados por esta ejecución");
    expect(html).toContain("/admin/candidates/");
    expect(html).toContain("/admin/sources/S001");

    const failedRun = runs.find((item) => item.id === "fixture-run-8419");
    if (!failedRun) throw new Error("Missing failure fixture");
    const failedHtml = renderToStaticMarkup(<AdminRunDetail run={failedRun} sources={sources} candidates={[]} />);
    expect(failedHtml).toContain("Error");
    expect(failedHtml).toContain("Reintentos");
  });
});
