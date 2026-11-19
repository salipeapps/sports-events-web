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

test("stable detail URL: excursion, HTTPS consultation CTA, withdrawal and unknown ids return 404", async ({
  page,
  request,
}) => {
  const id = "00000000-0000-4000-8000-000000000001";
  await page.goto("/");
  const first = page.getByRole("article").first();
  await expect(first).toContainText("Destino");
  await first.getByRole("link", { name: /Ver ficha completa/ }).click();
  await expect(page).toHaveURL(`/actividades/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("TEST · Actividad 01");
  await expect(page.getByRole("status").first()).toContainText("No son actividades reales");
  const detail = page.getByRole("article");
  await expect(detail).toContainText("Salida");
  await expect(detail).toContainText("Alboraia");
  await expect(detail).toContainText("Destino");
  await expect(detail).toContainText("El destino de la excursión no es el punto de encuentro");
  await expect(detail).toContainText("Precio por confirmar");
  await expect(detail).toContainText("no significa que sea gratuita");
  await expect(detail).toContainText("Europe/Madrid");
  await expect(detail).toContainText("no reserva plazas");
  expect((await detail.innerText()).indexOf("Salida")).toBeLessThan((await detail.innerText()).indexOf("Destino"));
  await expect(detail.getByRole("link", { name: /Consultar inscripción/ })).toHaveAttribute(
    "href",
    "https://example.org/inscripcion",
  );
  await expect(page.getByText(/Reservar|plazas disponibles/)).toHaveCount(0);

  // An editorial SUSPEND removes the row from the projection: the same URL becomes an honest 404.
  await request.post(`http://127.0.0.1:3122/test/withdraw/${id}`);
  const withdrawn = await page.reload();
  expect(withdrawn?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Esta actividad no está disponible" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await page.getByRole("link", { name: "Ver la agenda de actividades" }).click();
  await expect(page.getByRole("article").first()).toContainText("Actividad 02");

  for (const path of [
    "/actividades/00000000-0000-4000-8000-000000000028", // private draft fixture
    "/actividades/00000000-0000-4000-8000-000000000031", // historical fixture
    "/actividades/00000000-0000-4000-8000-0000000000ff", // unknown
    "/actividades/not-a-uuid",
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByText(/Borrador privado|Histórica/)).toHaveCount(0);
  }
});

test("detail upstream failure is distinct from withdrawal and leaks nothing; mobile has no overflow", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const path = "/actividades/00000000-0000-4000-8000-000000000002";
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("TEST · Actividad 02");
  await expect(page.getByRole("article")).toContainText("Gratis · por sesión");
  await expect(page.getByRole("article")).toContainText("TEST · Ropa cómoda y agua");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await request.post("http://127.0.0.1:3122/test/scenario/error");
  await page.reload();
  await expect(page.getByRole("heading", { name: "La ficha no está disponible ahora" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  expect(await page.content()).not.toContain("PRIVATE_SQL_TOKEN_DO_NOT_RENDER");
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
});

test("combined filters: shareable URL, reset, filtered pagination and explicit zero results", async ({ page }) => {
  await page.goto("/");
  const form = page.getByRole("form", { name: "Filtrar actividades" });
  await form.getByLabel("Categoría").selectOption("yoga");
  await form.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/categoria=yoga/);
  // Empty optional fields stay out of the shareable URL.
  await expect(page).not.toHaveURL(/municipio=|idioma=|precio=/);
  await expect(page.getByRole("article")).toHaveCount(5);
  for (const card of await page.getByRole("article").all()) await expect(card).toContainText("Yoga");
  await expect(page.getByLabel("Filtros activos")).toContainText("Yoga");

  // AND across dimensions; municipality is case-insensitive and ignores excursion destinations.
  await form.getByLabel("Municipio").fill("valència");
  await form.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("Russafa");
  const shared = page.url();
  await page.goto(shared);
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(form.getByLabel("Municipio")).toHaveValue("valència");
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);

  await page.goto("/?municipio=Serra");
  await expect(page.getByRole("heading", { name: "No hay actividades que cumplan estos filtros" })).toBeVisible();

  await page.goto("/?categoria=yoga&idioma=es");
  await expect(page.getByRole("heading", { name: "No hay actividades que cumplan estos filtros" })).toBeVisible();
  await expect(page.getByText("0 actividades en esta página")).toBeVisible();
  await page.getByRole("link", { name: "Limpiar filtros" }).first().click();
  await expect(page).not.toHaveURL(/categoria|idioma/);
  await expect(page.getByRole("article")).toHaveCount(24);

  await page.goto("/?precio=sesion");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("10,00");

  // "Sin precio por sesión" is not "gratis": 26 rows, paginated with the filter preserved in the cursor link.
  await page.goto("/?precio=sin-sesion");
  await expect(page.getByRole("article")).toHaveCount(24);
  const firstPage = await page.getByRole("article").allInnerTexts();
  await page.getByRole("link", { name: "Ver más actividades" }).click();
  await expect(page).toHaveURL(/precio=sin-sesion/);
  await expect(page).toHaveURL(/cursor=/);
  await expect(page.getByRole("article")).toHaveCount(2);
  for (const text of await page.getByRole("article").allInnerTexts()) expect(firstPage).not.toContain(text);
  await page.getByRole("link", { name: "Volver al inicio del periodo" }).click();
  await expect(page).toHaveURL(/precio=sin-sesion/);
  await expect(page.getByRole("article")).toHaveCount(24);
});

test("period presets keep filters, invalid filters are rejected and only filtered URLs add their own noindex", async ({
  page,
}) => {
  await page.goto("/?categoria=yoga");
  // Next.js may stream a fallback before searchParams have resolved. The fallback
  // must not expose unscoped tabs that would drop the selected category.
  await expect(page.getByLabel("Filtros activos")).toContainText("Yoga");
  await expect(page.getByRole("link", { name: "Hoy", exact: true })).toHaveAttribute("href", /categoria=yoga/);
  await page.getByRole("link", { name: "Hoy", exact: true }).click();
  await expect(page).toHaveURL(/periodo=hoy/);
  await expect(page).toHaveURL(/categoria=yoga/);
  await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Hoy", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Fin de semana" }).click();
  await expect(page.getByRole("heading", { name: "Este fin de semana" })).toBeVisible();
  await expect(page.getByLabel("Filtros activos")).toContainText("Yoga");
  for (const path of ["/?categoria=boxeo", "/?idioma=de", "/?precio=gratis", "/?periodo=ayer", "/?municipio=%3Cb%3E"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "No podemos mostrar esta búsqueda" }), path).toBeVisible();
  }
  // Outside production the root layout already emits "noindex, nofollow" (#53). Filtered URLs add their own
  // "noindex, follow"; the bare home must only carry the environment gate (indexable in production).
  await page.goto("/?categoria=yoga");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});

test("mobile filters start collapsed and the detail keeps the visitor's search on the way back", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  await page.goto(`/?month=${month}`);
  const form = page.getByRole("form", { name: "Filtrar actividades" });
  const toggle = page.locator(".public-filter-panel > summary");
  await expect(toggle).toHaveText("Filtrar actividades");
  await expect(form).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await testInfo.attach("public-filters-mobile-collapsed", {
    body: await page.screenshot({ path: testInfo.outputPath("filters-collapsed.png") }),
    contentType: "image/png",
  });
  await toggle.click();
  await form.getByLabel("Categoría").selectOption("yoga");
  await form.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(new RegExp(`month=${month}`));
  await expect(page).toHaveURL(/categoria=yoga/);
  await expect(page).not.toHaveURL(/municipio=|idioma=|precio=/);
  await expect(toggle).toContainText("1 activo");
  await testInfo.attach("public-filters-mobile-active", {
    body: await page.screenshot({ path: testInfo.outputPath("filters-active.png") }),
    contentType: "image/png",
  });
  await expect(form).toBeHidden();
  const search = new URL(page.url()).search;

  await page
    .getByRole("article")
    .first()
    .getByRole("link", { name: /Ver ficha completa/ })
    .click();
  await expect(page).toHaveURL(/\/actividades\//);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.getByRole("link", { name: "Volver a la agenda" }).click();
  await expect(page).toHaveURL(`/${search}#activities`);
  await expect(page.getByLabel("Filtros activos")).toContainText("Yoga");

  // Without a catalogue referrer the link falls back to the plain agenda.
  await page.goto("/actividades/00000000-0000-4000-8000-000000000002");
  await page.getByRole("link", { name: "Volver a la agenda" }).click();
  await expect(page).toHaveURL("/#activities");
});

test("desktop keeps the filters expanded without a toggle", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("form", { name: "Filtrar actividades" })).toBeVisible();
  await expect(page.locator(".public-filter-panel > summary")).toBeHidden();
});
