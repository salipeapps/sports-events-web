import { expect, test } from "@playwright/test";

test("public home needs no account and disabled catalogue does not invent inventory", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tu próximo plan");
  await expect(page.getByRole("heading", { name: "El catálogo no está disponible ahora" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByText("Demo local", { exact: false })).toHaveCount(0);
  await expect(page.getByText("0 actividades", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /inscripción/ })).toHaveCount(0);
});
