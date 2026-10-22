import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminReadError } from "@/domain/adminRead";
import { loadAdminView } from "./AdminReadState";
import AdminLoading from "@/app/admin/loading";

it("keeps a failed read distinct from a missing contract and never forwards upstream error details", async () => {
  const html = renderToStaticMarkup(
    await loadAdminView("dashboard", async () => {
      throw new AdminReadError("READ_UNAVAILABLE");
    }),
  );
  expect(html).toContain("READ_UNAVAILABLE");
  expect(html).not.toContain("NOT_AVAILABLE");
  expect(html).toContain("Vuelve a cargar");
  expect(html).not.toMatch(/admin-metric-card|admin-status-ring/);
  const unexpected = new Error("private upstream detail");
  await expect(
    loadAdminView("candidates", async () => {
      throw unexpected;
    }),
  ).rejects.toBe(unexpected);
});

it.each(["NEXT_REDIRECT", "NEXT_HTTP_ERROR_FALLBACK;404"])("preserves %s control flow", async (message) => {
  const error = new Error(message);
  await expect(
    loadAdminView("candidate", async () => {
      throw error;
    }),
  ).rejects.toBe(error);
});

it("retains an accessible loading state without inventory or statistics", () => {
  const html = renderToStaticMarkup(<AdminLoading />);
  expect(html).toContain('aria-busy="true"');
  expect(html).not.toMatch(/NOT_AVAILABLE|Sin candidatos|admin-metric-card/);
});
