import { expect, test } from "@playwright/test";
test("contact actions preserve the published channel and copy WhatsApp without inventing a link", async ({
  page,
  context,
  request,
}) => {
  await request.post("http://127.0.0.1:3122/test/scenario/populated");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(24);
  await expect(
    page
      .getByRole("article")
      .first()
      .getByRole("link", { name: /Ir a inscripción/ }),
  ).toHaveAttribute("href", "https://example.org/book");
  const whatsapp = page.getByRole("article").nth(1);
  await expect(whatsapp).toContainText("Reservar por WhatsApp: +34600111222");
  await whatsapp.getByRole("button", { name: /Copiar número de WhatsApp/ }).click();
  await expect(whatsapp.getByRole("status")).toContainText("Número copiado");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("+34600111222");
  await expect(
    page
      .getByRole("article")
      .nth(2)
      .getByRole("link", { name: /Llamar/ }),
  ).toHaveAttribute("href", "tel:+34600111333");
  await expect(
    page
      .getByRole("article")
      .nth(3)
      .getByRole("link", { name: /Enviar correo/ }),
  ).toHaveAttribute("href", "mailto:reservas@example.org");
  expect(await page.content()).not.toContain("wa.me");
  await expect(page.getByRole("article").first().getByRole("link", { name: "Ver convocatoria" })).toHaveAttribute(
    "href",
    "https://example.org/activity",
  );
  await request.post("http://127.0.0.1:3122/test/scenario/empty");
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(0);
  await request.post("http://127.0.0.1:3122/test/scenario/error");
  await page.reload();
  await expect(page.getByRole("heading", { name: "El catálogo no está disponible ahora" })).toBeVisible();
});

test("detail page keeps the verified WhatsApp channel as copy-only and links the organiser source", async ({
  page,
  context,
  request,
}) => {
  await request.post("http://127.0.0.1:3122/test/scenario/populated");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/actividades/00000000-0000-4000-8000-000000000002");
  const detail = page.getByRole("article");
  await expect(detail).toContainText("Reservar por WhatsApp: +34600111222");
  await detail.getByRole("button", { name: /Copiar número de WhatsApp/ }).click();
  await expect(detail.getByRole("status")).toContainText("Número copiado");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("+34600111222");
  expect(await page.content()).not.toContain("wa.me");
  await expect(detail.getByRole("link", { name: /convocatoria original/ })).toHaveAttribute(
    "href",
    "https://example.org/activity",
  );
  await page.goto("/actividades/00000000-0000-4000-8000-000000000003");
  await expect(page.getByRole("article").getByRole("link", { name: /Llamar/ })).toHaveAttribute(
    "href",
    "tel:+34600111333",
  );
});
