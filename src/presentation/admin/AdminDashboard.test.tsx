import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FixtureAdminRepository } from "@/data/fixtures/fixtureAdminRepository";
import { AdminDashboard } from "./AdminDashboard";

describe("AdminDashboard", () => {
  it("renders repository-backed metrics without inventing unknown coverage", async () => {
    const summary = await new FixtureAdminRepository().getDashboardSummary();
    const html = renderToStaticMarkup(<AdminDashboard summary={summary} />);

    expect(html).toContain("Actividades publicadas");
    expect(html).toContain("Candidatos pendientes");
    expect(html).toContain("Ejecuciones hoy");
    expect(html).toContain("Sin histórico verificable");
    expect(html).toContain("Elementos urgentes a revisar");
  });
});
