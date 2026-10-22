import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/integrations/auth/adminAuth", () => ({ requireAdminAccess: vi.fn() }));

import AdminPage from "./page";

describe("AdminPage", () => {
  it("renders the Admin dashboard heading defined in Figma", async () => {
    const html = renderToStaticMarkup(await AdminPage());

    expect(html).toContain("Resumen");
    expect(html).toContain("Visión general del estado operativo de la plataforma y del catálogo.");
  });
});
