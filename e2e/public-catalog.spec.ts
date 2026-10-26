import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:3122/test/scenario/populated");
});

test("anonymous catalogue, safe projection, stable pagination and local labels", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tu próximo planempieza aquí.");
  await expect(page.getByRole("status")).toContainText("No son actividades reales");
  await expect(page.getByRole("article")).toHaveCount(24);
  const first = page.getByRole("article").first();
  await expect(first).toContainText("Alboraia");
  await expect(first).toContainText("Patacona");
  await expect(first).toContainText("Salida");
  await expect(first).toContainText("Precio por confirmar");
  await expect(first).toContainText("Idioma por confirmar");
  await expect(page.getByRole("article").nth(1)).toContainText("Gratis · por sesión");
  await expect(page.getByRole("article").nth(2)).toContainText("al mes");
  for (const name of ["Borrador privado", "Conflicto privado", "Cancelada privada", "Histórica"])
    await expect(page.getByText(name, { exact: false })).toHaveCount(0);
  await page.getByRole("link", { name: "Ver más actividades" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("article").first()).toContainText("Actividad 25");
  await expect(page.getByRole("link", { name: "Ver más actividades" })).toHaveCount(0);
  await page.getByRole("link", { name: "Volver al inicio del periodo" }).click();
  await expect(page.getByRole("article").first()).toContainText("Actividad 01");
  const headers = await (await request.get("http://127.0.0.1:3122/test/headers")).json();
  expect(headers).toEqual({ authorization: null, cookie: null, apikey: "sb_publishable_offline_catalog" });
});

test("empty inventory and upstream failure remain distinct; cancellations are not cached", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(24);
  await request.post("http://127.0.0.1:3122/test/scenario/empty");
  await page.reload();
  await expect(page.getByText("0 actividades en esta página", { exact: false })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /inscripción|Ver más actividades/ })).toHaveCount(0);
  await request.post("http://127.0.0.1:3122/test/scenario/error");
  await page.reload();
  await expect(page.getByRole("heading", { name: "El catálogo no está disponible ahora" })).toBeVisible();
  await expect(page.getByText("0 actividades", { exact: false })).toHaveCount(0);
  expect(await page.content()).not.toContain("PRIVATE_SQL_TOKEN_DO_NOT_RENDER");
});

test("mobile calendar navigation, invalid cursor recovery and no horizontal overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "Calendario completo" }).click();
  await expect(page.getByRole("navigation", { name: "Mes del calendario" })).toBeVisible();
  await expect(page.getByLabel("Elegir mes")).toBeVisible();
  await page.getByRole("link", { name: "Mes siguiente" }).click();
  await expect(page.getByRole("link", { name: "Mes anterior" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No hay actividades publicadas para estas fechas" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/?cursor=invalid!");
  await expect(page.getByRole("heading", { name: "No podemos mostrar esta búsqueda" })).toBeVisible();
  await page.getByRole("link", { name: "Ver próximas actividades" }).click();
  await expect(page.getByRole("article")).toHaveCount(24);
  await testInfo.attach("public-catalog-mobile", {
    body: await page.screenshot({ path: testInfo.outputPath("mobile.png") }),
    contentType: "image/png",
  });
});

test("desktop layout and keyboard access", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(24);
  await testInfo.attach("public-home-desktop", {
    body: await page.screenshot({ path: testInfo.outputPath("home-desktop.png") }),
    contentType: "image/png",
  });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar a las actividades" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Próximos 7 días" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await testInfo.attach("public-catalog-desktop", {
    body: await page.screenshot({ path: testInfo.outputPath("desktop.png") }),
    contentType: "image/png",
  });
});

test("tablet layout and an explicit loading state while the public RPC is pending", async ({ page, request }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await request.post("http://127.0.0.1:3122/test/scenario/slow");
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "Consultando las próximas actividades" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(24);
  await expect(page.getByRole("heading", { name: "Consultando las próximas actividades" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
