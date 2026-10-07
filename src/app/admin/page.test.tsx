import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AdminPage from "./page";

describe("AdminPage", () => {
  it("renders the Admin dashboard heading defined in Figma", async () => {
    const html = renderToStaticMarkup(await AdminPage());

    expect(html).toContain("Resumen");
    expect(html).toContain("Visión general del estado de la plataforma");
  });
});
