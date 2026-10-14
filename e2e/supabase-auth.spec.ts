import { expect, test, type Page } from "@playwright/test";
async function login(page: Page, subject: string, password = "Fixture-password-123") {
  await page.goto("/admin-access");
  await page.getByLabel("Email", { exact: true }).fill(`${subject}@example.test`);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
}

async function expectCommandsDisabled(page: Page) {
  for (const operation of ["rejection", "promotion"]) {
    const result = await page.request.post(
      `/api/internal/discovery/candidates/ca73b0ff-8001-4000-8000-111111111111/${operation}`,
      {
        headers: { Origin: "http://127.0.0.1:3100", "Idempotency-Key": "11a2a2a2-1111-4000-8000-111111111111" },
        data: { reasonCode: "OUT_OF_SCOPE", reviewerRef: "spoofed" },
      },
    );
    expect(result.status()).toBe(404);
    expect(result.headers()["cache-control"]).toContain("no-store");
    const body = await result.json();
    expect(body).toEqual({ code: "NOT_CONFIGURED", requestId: result.headers()["x-request-id"] });
  }
}

test("anonymous direct command URLs fail closed while flags are disabled", async ({ page }) => {
  await expectCommandsDisabled(page);
});
test("admin login persists verified cookies; deactivation takes effect on next request", async ({
  page,
  request,
  context,
}) => {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expectCommandsDisabled(page);
  const authCookies = (await context.cookies()).filter(({ name }) => name.startsWith("sb-"));
  expect(authCookies.length).toBeGreaterThan(0);
  expect(authCookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax")).toBe(true);
  await page.reload();
  await expect(page.locator(".admin-shell")).toBeVisible();
  const response = await request.post("http://127.0.0.1:3201/fixture/deactivate", { data: { id: "admin" } });
  expect(response.ok()).toBe(true);
  await page.goto("/admin/activities");
  await expect(page).toHaveURL(/reason=unauthorized/);
});
test("reviewer stays in the shell on denied routes and retains discovery and logout", async ({ page, context }) => {
  await login(page, "reviewer");
  await expect(page).toHaveURL(/\/admin$/);
  await expectCommandsDisabled(page);
  await page.goto("/admin/activities");
  await expect(page.getByRole("heading", { name: "Actividades", exact: true })).toBeVisible();
  const cookiesBefore = (await context.cookies()).filter(({ name }) => name.startsWith("sb-"));
  for (const label of ["Fuentes", "Ejecuciones"]) {
    await page.getByRole("link", { name: `${label} Solo admin`, exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/forbidden\?capability=/);
    await expect(page.getByRole("heading", { name: "No tienes permisos para acceder a esta sección" })).toBeVisible();
    await expect(page.locator(".admin-content")).toContainText("Tu rol es Revisor");
    await expect(page.locator(".admin-content")).toContainText(
      label === "Fuentes" ? "La gestión de fuentes" : "La gestión de ejecuciones",
    );
    await expect(page.locator(".admin-identity")).toContainText("Reviewer");
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    await page.getByRole("link", { name: "Volver a Resumen", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
  }
  for (const route of ["/admin/sources", "/admin/sources/S001", "/admin/runs", "/admin/runs/fixture-run-8421"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/admin\/forbidden\?capability=/);
    await expect(page.locator(".admin-shell")).toBeVisible();
    await expect(page.locator(".admin-content table")).toHaveCount(0);
  }
  expect((await context.cookies()).filter(({ name }) => name.startsWith("sb-"))).toEqual(cookiesBefore);
  await page.getByRole("link", { name: "Volver a Descubrimiento", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Descubrimiento" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "NOT_CONFIGURED" })).toContainText("NOT_CONFIGURED");
  await page.goto("/admin/candidates");
  await expect(page.getByRole("heading", { name: "Candidatos", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/admin-access/);
  await page.goto("/admin/forbidden");
  await expect(page).toHaveURL(/admin-access/);
});

test("admin retains source and run list and detail access", async ({ page }) => {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  for (const route of ["/admin/sources", "/admin/sources/S001", "/admin/runs", "/admin/runs/fixture-run-8421"]) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.locator(".admin-content h1")).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Fuentes", exact: true })).toBeVisible();
});
for (const subject of ["outsider", "inactive", "expired"])
  test(`${subject} cannot enter Admin despite forged user metadata`, async ({ page }) => {
    await login(page, subject);
    await expect(page).toHaveURL(/admin-access/);
    await expect(page.locator(".admin-shell")).toHaveCount(0);
  });
test("incorrect credentials, recovery and invalid callback", async ({ page }) => {
  await login(page, "admin", "incorrect");
  await expect(page.getByRole("status")).toContainText("credenciales");
  await page.getByRole("link", { name: "Recuperar contraseña" }).click();
  await expect(page).toHaveURL(/admin-access\/recover$/);
  await expect(page.getByRole("heading", { name: "Recuperar contraseña" })).toBeVisible();
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByRole("status")).toContainText("Si la cuenta");
  await page.goto("/auth/confirm?token_hash=bad&type=recovery&next=https://evil.test");
  await expect(page).toHaveURL(/admin-access\?reason=expired/);
});
test("invitation activation and logout remove private access", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=valid-fixture&type=invite&next=https://evil.test");
  await expect(page).toHaveURL(/admin-access\/password$/);
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("Fixture-password-123");
  await page.getByLabel("Confirmar contraseña").fill("Fixture-password-123");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page).toHaveURL(/admin-access\?reason=missing_session/);
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/admin-access/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/admin-access/);
  await page.goto("/");
  await expect(page.locator(".admin-shell")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("forged session cookies cannot provide identity", async ({ page, context }) => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "admin", exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })}.forged`;
  const value = `base64-${encode({ access_token: token, refresh_token: "forged", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "admin", user_metadata: { role: "admin" } } })}`;
  await context.addCookies([{ name: "sb-127-auth-token", value, domain: "127.0.0.1", path: "/" }]);
  await page.goto("/admin");
  await expect(page).toHaveURL(/admin-access/);
  await expect(page.locator(".admin-shell")).toHaveCount(0);
});

test("expired access token renews through the SSR refresh-token flow", async ({ page, request }) => {
  const before = await (await request.get("http://127.0.0.1:3201/fixture/stats")).json();
  await login(page, "renewal");
  await expect(page).toHaveURL(/\/admin$/);
  const after = await (await request.get("http://127.0.0.1:3201/fixture/stats")).json();
  expect(after.refreshCount).toBeGreaterThan(before.refreshCount);
  const response = await page.goto("/admin/activities");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { name: "Actividades", exact: true })).toBeVisible();
});

test("login form preserves the existing tokens and works on mobile", async ({ page }) => {
  await page.goto("/admin-access");
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/admin-login-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel("Email", { exact: true }).focus();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await page.screenshot({ path: "test-results/admin-login-mobile.png", fullPage: true });
});
