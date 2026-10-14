import { expect, test } from "@playwright/test";

test.skip(process.env.ADMIN_DEV_AUTH_MODE !== "disabled", "Run in the separate fail-closed CI pass.");

test("every private Admin route denies a request with no session", async ({ page }) => {
  for (const route of [
    "/admin",
    "/admin/forbidden",
    "/admin/activities",
    "/admin/candidates",
    "/admin/candidates/candidate-valid-E019",
    "/admin/sources",
    "/admin/sources/S001",
    "/admin/runs",
    "/admin/runs/fixture-run-8421",
    "/admin/discovery",
    "/admin/discovery/results/discovery-result-promoted",
    "/admin/discovery/executions/discovery-execution-01",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/admin-access\?reason=missing_session/);
    await expect(page.getByRole("heading", { name: /acceso/i })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Administración" })).toHaveCount(0);
  }
});
