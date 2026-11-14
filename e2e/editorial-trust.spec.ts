import { expect, test, type Page, type Request } from "@playwright/test";

test.skip(process.env.ADMIN_DEV_AUTH_MODE === "disabled", "This suite requires the explicit development-only Admin.");

const organizerId = "0a9b0ff0-8001-4000-8000-222222222222";
const sourceId = "e37b522f-9d13-30e2-99ec-bffd47f2b228";
const evidence = "https://organizer.example.org/about";

interface Captured {
  method: string;
  key: string | null;
  body: Record<string, unknown>;
}
function capture(request: Request): Captured {
  return {
    method: request.method(),
    key: request.headers()["idempotency-key"] ?? null,
    body: JSON.parse(request.postData() ?? "{}") as Record<string, unknown>,
  };
}

async function fillAlias(page: Page, alias = "Fundació  Esportiva Municipal") {
  const form = page.getByRole("form", { name: "Alias de organizador" });
  await form.getByLabel("ID del organizador (UUID)").fill(organizerId);
  await form.getByLabel("Alias").fill(alias);
  await form.getByLabel("Motivo editorial (obligatorio)").fill("Mismo organizador en su web oficial");
  await form.getByLabel("URL de evidencia oficial revisada (HTTPS, obligatoria)").fill(evidence);
  await form.getByRole("button", { name: "Revisar alias antes de enviar" }).click();
}

test("an admin reviews, confirms and sees the Engine receipt for an alias", async ({ page }) => {
  const calls: Captured[] = [];
  await page.route("**/api/internal/editorial/organizers/*/aliases", (route) => {
    const call = capture(route.request());
    calls.push(call);
    return route.fulfill({
      json: {
        commandKey: call.key,
        action: "ADD_ORGANIZER_ALIAS",
        organizerId,
        alias: "Fundació Esportiva Municipal",
        officialUrl: null,
        channelId: null,
        sourceId: null,
        authoritative: null,
        status: "ADDED",
        recordedAt: "2026-11-15T10:00:00Z",
      },
    });
  });
  await page.goto("/admin/editorial");
  await page.getByRole("link", { name: /Confianza editorial/ }).click();
  await expect(page.getByRole("heading", { name: "Confianza editorial (V026)" })).toBeVisible();

  await fillAlias(page);
  const review = page.getByRole("group", { name: "Revisión: alias" });
  await expect(review).toContainText("POST /api/editorial/v1/organizers/" + organizerId + "/aliases");
  // The normalized presentation form is what the admin confirms and what is sent.
  await expect(review).toContainText("Fundació Esportiva Municipal");
  await expect(review).toContainText("Mismo organizador en su web oficial · Evidencia: " + evidence);
  const send = review.getByRole("button", { name: "Enviar al Engine" });
  await expect(send).toBeDisabled();
  expect(calls).toHaveLength(0);

  await review.getByLabel(/He revisado la evidencia/).check();
  await send.click();
  const receipt = page.getByRole("status", { name: "Recibo del Engine" });
  await expect(receipt).toContainText("ADDED: el Engine ha registrado el valor nuevo.");
  await expect(receipt).toContainText(calls[0].key!);
  expect(calls).toEqual([
    {
      method: "POST",
      key: expect.stringMatching(/^[0-9a-f-]{36}$/),
      body: {
        alias: "Fundació Esportiva Municipal",
        reason: "Mismo organizador en su web oficial",
        evidenceUrl: evidence,
      },
    },
  ]);
  // The form is cleared after the receipt: nothing carries over to the next intention.
  await expect(page.getByRole("form", { name: "Alias de organizador" }).getByLabel("Alias")).toHaveValue("");
});

test("a timeout is shown as uncertain and the retry reuses the same key", async ({ page }) => {
  const calls: Captured[] = [];
  await page.route("**/api/internal/editorial/organizers/*/aliases", (route) => {
    const call = capture(route.request());
    calls.push(call);
    if (calls.length === 1) return route.fulfill({ status: 503, json: { code: "WRITE_UNAVAILABLE" } });
    return route.fulfill({
      json: {
        commandKey: call.key,
        action: "ADD_ORGANIZER_ALIAS",
        organizerId,
        alias: "Fundació Esportiva Municipal",
        status: "EXISTS",
        recordedAt: "2026-11-15T10:00:00Z",
      },
    });
  });
  await page.goto("/admin/editorial/trust");
  await fillAlias(page);
  const review = page.getByRole("group", { name: "Revisión: alias" });
  await review.getByLabel(/He revisado la evidencia/).check();
  await review.getByRole("button", { name: "Enviar al Engine" }).click();

  const alert = page.getByRole("alert").filter({ hasText: "Resultado incierto" });
  await expect(alert).toContainText("Resultado incierto");
  await expect(alert).toContainText(calls[0].key!);
  await expect(page.getByRole("status", { name: "Recibo del Engine" })).toHaveCount(0);

  await review.getByRole("button", { name: "Reintentar con la misma clave" }).click();
  await expect(page.getByRole("status", { name: "Recibo del Engine" })).toContainText(
    "EXISTS: el valor ya existía; el Engine no ha escrito nada.",
  );
  expect(calls).toHaveLength(2);
  expect(calls[1].key).toBe(calls[0].key);
  expect(calls[1].body).toEqual(calls[0].body);
});

test("a channel with a path is rejected locally and a conflict lists the holders", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/internal/editorial/organizers/*/channels", (route) => {
    calls++;
    return route.fulfill({
      status: 409,
      json: {
        code: "CONFLICT",
        reason: "CHANNEL_IN_USE",
        organizers: [{ id: "c4a2a2a2-1111-4000-8000-333333333333", canonicalName: "Otro organizador" }],
      },
    });
  });
  await page.goto("/admin/editorial/trust");
  const form = page.getByRole("form", { name: "Canal oficial de organizador" });
  await form.getByLabel("ID del organizador (UUID)").fill(organizerId);
  await form.getByLabel("Origen HTTPS del canal oficial").fill("https://organizer.example.org/inscripcion");
  await form.getByLabel("Motivo editorial (obligatorio)").fill("Web oficial");
  await form.getByLabel("URL de evidencia oficial revisada (HTTPS, obligatoria)").fill(evidence);
  await form.getByRole("button", { name: "Revisar canal antes de enviar" }).click();
  await expect(form.getByRole("alert")).toContainText("solo un origen HTTPS");
  expect(calls).toBe(0);

  await form.getByLabel("Origen HTTPS del canal oficial").fill("https://organizer.example.org");
  await form.getByRole("button", { name: "Revisar canal antes de enviar" }).click();
  const review = page.getByRole("group", { name: "Revisión: canal" });
  await review.getByLabel(/He revisado la evidencia/).check();
  await review.getByRole("button", { name: "Enviar al Engine" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Conflicto" })).toContainText("No se ha registrado nada");
  await expect(page.getByRole("list", { name: "Organizadores que ya lo usan" })).toContainText("Otro organizador");
  // A definite answer requires a fresh explicit confirmation.
  await expect(review.getByLabel(/He revisado la evidencia/)).not.toBeChecked();
});

test("location authority needs an explicit choice and is sent with PUT", async ({ page }) => {
  const calls: Captured[] = [];
  await page.route("**/api/internal/editorial/sources/*/location-authority", (route) => {
    const call = capture(route.request());
    calls.push(call);
    return route.fulfill({
      json: {
        commandKey: call.key,
        action: "SET_LOCATION_AUTHORITY",
        sourceId,
        authoritative: false,
        status: "WITHDRAWN",
        recordedAt: "2026-11-15T10:00:00Z",
      },
    });
  });
  await page.goto("/admin/editorial/trust");
  const form = page.getByRole("form", { name: "Autoridad de ubicación" });
  await form.getByLabel("ID de la fuente (UUID)").fill(sourceId);
  await form.getByLabel("Motivo editorial (obligatorio)").fill("La fuente publica ubicaciones sin revisar");
  await form.getByLabel("URL de evidencia oficial revisada (HTTPS, obligatoria)").fill(evidence);
  await form.getByRole("button", { name: "Revisar cambio antes de enviar" }).click();
  await expect(form.getByRole("alert")).toContainText("Elige expresamente");

  await form.getByLabel("Retirar autoridad de ubicación").check();
  await form.getByRole("button", { name: "Revisar cambio antes de enviar" }).click();
  const review = page.getByRole("group", { name: "Revisión: autoridad de ubicación" });
  await expect(review).toContainText("PUT /api/editorial/v1/sources/" + sourceId + "/location-authority");
  await review.getByLabel(/He revisado la evidencia/).check();
  await review.getByRole("button", { name: "Enviar al Engine" }).click();
  await expect(page.getByRole("status", { name: "Recibo del Engine" })).toContainText("WITHDRAWN");
  expect(calls.map((call) => [call.method, call.body.authoritative])).toEqual([["PUT", false]]);
});
