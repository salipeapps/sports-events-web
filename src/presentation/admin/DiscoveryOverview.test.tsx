import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FixtureDiscoveryRepository } from "@/data/fixtures/fixtureDiscoveryRepository";
import {
  DiscoveryExecutionDetail,
  DiscoveryOverview,
  DiscoveryResultDetail,
  resolveDiscoveryTab,
} from "./DiscoveryOverview";

describe("Admin v0 discovery presentation", () => {
  it("preserves provider DEFAULT and explicit override without exposing any credentials", async () => {
    const snapshot = await new FixtureDiscoveryRepository().getSnapshot();
    const html = renderToStaticMarkup(<DiscoveryOverview snapshot={snapshot} activeTab="consultas" />);
    expect(html).toContain("DEFAULT");
    expect(html).toContain("Override explícito");
    expect(html).toContain("Pausada");
    expect(html).toContain("discovery-execution-01");
    expect(html).toContain("disabled");
    expect(html).not.toContain("API_KEY");
    expect(html).not.toContain("sk-");
  });

  it("keeps providers, results and promoted sources as separate concepts", async () => {
    const snapshot = await new FixtureDiscoveryRepository().getSnapshot();
    const providerHtml = renderToStaticMarkup(<DiscoveryOverview snapshot={snapshot} activeTab="proveedores" />);
    expect(providerHtml).toContain("No configuradas");
    expect(providerHtml).toContain("Predeterminado");

    const resultsHtml = renderToStaticMarkup(<DiscoveryOverview snapshot={snapshot} activeTab="resultados" />);
    expect(resultsHtml).toContain("Promovido a fuente");
    expect(resultsHtml).toContain("Conocido");
    expect(resultsHtml).toContain("Candidato de fuente");
    const promoted = snapshot.results.find((item) => item.id === "discovery-result-promoted");
    if (!promoted) throw new Error("Missing demo result");
    const detailHtml = renderToStaticMarkup(<DiscoveryResultDetail snapshot={snapshot} result={promoted} />);
    expect(detailHtml).toContain("/admin/sources/S001");
    expect(detailHtml).toContain("/admin/discovery/executions/discovery-execution-01");

    const execution = snapshot.executions[0];
    const runHtml = renderToStaticMarkup(<DiscoveryExecutionDetail snapshot={snapshot} execution={execution} />);
    expect(runHtml).toContain("Sin dato");
    expect(runHtml).not.toContain("0 €");
  });

  it("supports empty lists and normalizes malformed tabs", async () => {
    const snapshot = await new FixtureDiscoveryRepository().getSnapshot();
    const emptyHtml = renderToStaticMarkup(
      <DiscoveryOverview snapshot={{ ...snapshot, results: [] }} activeTab="resultados" />,
    );
    expect(emptyHtml).toContain("No hay resultados registrados");
    expect(resolveDiscoveryTab(["resultados", "proveedores"])).toBe("resultados");
    expect(resolveDiscoveryTab("unknown")).toBe("consultas");
  });
});
