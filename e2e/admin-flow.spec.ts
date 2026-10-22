import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.ADMIN_DEV_AUTH_MODE === "disabled", "This suite requires the explicit development-only Admin.");

async function expectNoViewportOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    "The page must not produce document-level horizontal overflow",
  ).toBe(true);
}

test("Admin shell, Figma sections and desktop responsive structure", async ({ page }, testInfo) => {
  const screens = [
    ["/admin", "Resumen", "01-dashboard"],
    ["/admin/activities", "Actividades", "02-actividades"],
    ["/admin/candidates/candidate-valid-E019", /.+/, "03-revision"],
    ["/admin/sources", "Fuentes", "04-fuentes"],
    ["/admin/discovery", "Descubrimiento", "discovery"],
  ] as const;

  for (const [url, title, screenshot] of screens) {
    await page.goto(url);
    await expect(page.locator(".admin-shell")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Demo local" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Administración" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expectNoViewportOverflow(page);
    await testInfo.attach(screenshot, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  }

  const sidebarColor = await page.locator(".admin-sidebar").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(sidebarColor).toBe("rgb(7, 26, 59)");
});

test("dashboard, activity filtering and candidate review show documented evidence", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("Actividades publicadas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Elementos urgentes a revisar" })).toBeVisible();

  await page.getByRole("navigation", { name: "Administración" }).getByRole("link", { name: "Actividades" }).click();
  await expect(page.getByRole("heading", { name: "Actividades" })).toBeVisible();
  await page
    .getByRole("link", { name: /Revisión/ })
    .first()
    .click();
  await page.locator('select[name="source"]').selectOption("S009");
  await page.locator('select[name="status"]').selectOption("blocked");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/source=S009/);
  await expect(page.getByRole("heading", { level: 1, name: "Actividades" })).toBeVisible();

  await page.goto("/admin/candidates/candidate-valid-E019");
  await expect(page.getByRole("heading", { name: "Datos extraídos (IA)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidencias y fuente" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reglas e IA" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar y publicar" })).toBeEnabled();
});

test("discovery remains separate from sources, links lineage and does not execute fake mutations", async ({ page }) => {
  await page.goto("/admin/discovery");
  await expect(page.getByRole("heading", { name: "Descubrimiento" })).toBeVisible();
  await expect(page.getByText("DEFAULT", { exact: true })).toBeVisible();
  await expect(page.getByText("Override explícito")).toBeVisible();
  await expect(page.getByRole("button", { name: "Probar consulta" })).toBeDisabled();

  await page
    .getByRole("navigation", { name: "Apartados de Descubrimiento" })
    .getByRole("link", { name: "Proveedores" })
    .click();
  await expect(page.getByRole("table")).toContainText("Predeterminado");
  await expect(page.getByRole("table")).toContainText("Credenciales");
  await page
    .getByRole("navigation", { name: "Apartados de Descubrimiento" })
    .getByRole("link", { name: "Resultados" })
    .click();
  await page.getByRole("link", { name: "Comunidad Meetup de Valencia" }).click();
  await expect(page.getByText("Un resultado de búsqueda no representa una actividad validada")).toBeVisible();
  await page.getByRole("link", { name: /discovery-execution-01/ }).click();
  await expect(page.getByRole("heading", { name: /Ejecución discovery-execution-01/ })).toBeVisible();
  await page.getByRole("link", { name: "Comunidad Meetup de Valencia" }).click();
  await page.getByRole("link", { name: /Ver fuente revisada: S001/ }).click();
  await expect(page).toHaveURL(/\/admin\/sources\/S001/);
  await page.getByRole("link", { name: "fixture-run-8421" }).click();
  await expect(page).toHaveURL(/\/admin\/runs\/fixture-run-8421/);
  await expect(page.getByRole("heading", { name: "Candidatos originados por esta ejecución" })).toBeVisible();
});

test("valid candidate publishes, conflict cannot publish, and recorded decisions require a reason", async ({
  page,
}) => {
  // Re-entry must also succeed if Playwright retries after an already completed server action.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/admin/candidates/candidate-valid-E019");
    const approve = page.getByRole("button", { name: "Aprobar y publicar" });
    if (await approve.isEnabled()) {
      await approve.click();
      await expect(page.getByText("Candidatura aprobada y publicada.")).toBeVisible();
    } else {
      await expect(page.getByText("Publicada", { exact: true }).first()).toBeVisible();
    }
    const approvalHistory = page.locator(".admin-review-history");
    await expect(approvalHistory.getByText("Aprobada", { exact: true })).toBeVisible();
    await expect(approvalHistory.getByText("Publicada", { exact: true })).toBeVisible();

    await page.goto("/admin/runs/fixture-run-8421");
    const publishedCandidate = page.locator(".admin-operation-notes li").filter({ hasText: "candidate-valid-E019" });
    await expect(publishedCandidate).toContainText("Publicada");

    await page.goto("/admin/candidates/candidate-conflict-E023");
    await expect(page.getByRole("button", { name: "Aprobar y publicar" })).toBeDisabled();
    const reject = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: "Rechazar" }) })
      .last();
    if (await reject.count()) {
      await reject.locator("summary").click();
      const form = reject.locator("form");
      await expect(form.locator('textarea[name="decisionReason"]')).toHaveAttribute("required", "");
      await form.locator('textarea[name="decisionReason"]').fill("Conflicto de horario sin verificar");
      await form.getByRole("button", { name: "Confirmar rechazo" }).click();
      await expect(page.getByText("Candidatura rechazada.")).toBeVisible();
    } else {
      await expect(page.getByText("Rechazada", { exact: true }).first()).toBeVisible();
    }
    const rejectionHistory = page.locator(".admin-review-history");
    await expect(rejectionHistory.getByText("Rechazada", { exact: true })).toBeVisible();
    const rejectionHistoryEntry = rejectionHistory.locator("li").filter({ hasText: "Rechazada" });
    await expect(rejectionHistoryEntry).toContainText("Conflicto de horario sin verificar");

    await page.goto("/admin/runs/fixture-run-8420");
    const rejectedCandidate = page.locator(".admin-operation-notes li").filter({ hasText: "candidate-conflict-E023" });
    await expect(rejectedCandidate).toContainText("Rechazada");
  }
});

test("mobile navigation, keyboard and overflow stay usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/admin", "/admin/activities", "/admin/sources", "/admin/runs", "/admin/discovery"]) {
    await page.goto(route);
    await expect(page.locator(".admin-shell")).toBeVisible();
    await expectNoViewportOverflow(page);
    await expect(page.getByRole("navigation", { name: "Administración" })).toBeVisible();
  }
  const sourceLink = page.getByRole("navigation", { name: "Administración" }).getByRole("link", { name: "Fuentes" });
  await sourceLink.focus();
  await expect(sourceLink).toBeFocused();
  await sourceLink.press("Enter");
  await expect(page).toHaveURL(/\/admin\/sources/);
});
