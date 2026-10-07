import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AdminPage from "./page";

describe("AdminPage", () => {
  it("renders the Admin v0 entry point", () => {
    const html = renderToStaticMarkup(<AdminPage />);

    expect(html).toContain("Admin v0");
    expect(html).toContain("Motor y revisión editorial");
  });
});
