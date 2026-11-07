import { expect, test, type Page } from "@playwright/test";
import { inspectionFixture } from "../src/integrations/editorial/inspection.fixture";
import { normalizeInspection } from "../src/integrations/editorial/inspection";
import type { EditorialInspection } from "../src/domain/editorial";

test.skip(process.env.ADMIN_DEV_AUTH_MODE === "disabled", "This suite requires the explicit development-only Admin.");

const candidateId = "ca73b0ff-8001-4000-8000-111111111111";
const inspectionPath = "/api/internal/editorial/candidates/" + candidateId;
const candidate = {
  ...normalizeInspection(inspectionFixture, candidateId),
  candidateId,
  candidateVersion: 1,
  revision: 0,
  status: "PENDING_REVIEW",
  title: "Candidato de prueba E2E",
  conflictCount: 0,
  moreConflicts: false,
};

/** Mirrors the BFF: canonical test URLs keep the exact write snapshot equal to the display data. */
function withData<T extends EditorialInspection>(inspection: T, data: EditorialInspection["data"]): T {
  return { ...inspection, data, correctionBase: data };
}

function receipt(commandKey: string, status = "APPROVED") {
  return { commandKey, candidateIds: [candidateId], status };
}

async function mockInspection(page: Page, status = "APPROVED") {
  let reads = 0;
  let inspection = candidate;
  await page.route("**" + inspectionPath, (route) => {
    reads++;
    return route.fulfill({
      json: inspection,
    });
  });
  return {
    readCount: () => reads,
    confirm: () => {
      inspection = { ...candidate, revision: 1, status };
    },
  };
}

test("a full candidate UUID opens the inspector from the entry page", async ({ page }) => {
  const reads = await mockInspection(page);
  await page.goto("/admin/editorial");
  await page.getByLabel("Identificador del candidato").fill(candidateId);
  await page.getByRole("button", { name: "Buscar candidato" }).click();
  await page.getByRole("link", { name: "Inspeccionar candidato" }).click();

  await expect(page).toHaveURL("/admin/editorial/" + candidateId);
  await expect(page.getByRole("heading", { name: "Inspección editorial B1" })).toBeVisible();
  await expect(page.getByText(candidate.title, { exact: true })).toBeVisible();
  expect(reads.readCount()).toBeGreaterThan(0);
});

test("an incomplete UUID is rejected before loading candidate data", async ({ page }) => {
  const reads = await mockInspection(page);
  await page.goto("/admin/editorial/ca73b0ff-8001-4000-111111111111");

  await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inspección editorial B1" })).toHaveCount(0);
  expect(reads.readCount()).toBe(0);
});

test("a slow first read explains the cold start and an unanswered read can be retried", async ({ page }) => {
  // Every read is slow and unanswered until the Engine "warms up" (StrictMode may issue the first read twice).
  let cold = true;
  await page.route("**" + inspectionPath, async (route) => {
    if (cold) {
      await new Promise((resolve) => setTimeout(resolve, 7000));
      return route.fulfill({ status: 503, json: { code: "WRITE_UNAVAILABLE" } });
    }
    return route.fulfill({ json: candidate });
  });
  await page.goto("/admin/editorial/" + candidateId);
  await expect(page.getByRole("status").filter({ hasText: "Consultando candidatura…" })).toContainText(
    "puede tardar hasta medio minuto",
  );
  // Next.js also renders an empty route-announcer alert, so match ours by text.
  const readAlert = page.getByRole("alert").filter({ hasText: "no ha respondido a tiempo" });
  await expect(readAlert).toHaveText(
    "El servicio editorial no ha respondido a tiempo. Puede estar arrancando: vuelve a intentarlo en unos segundos.",
  );
  await expect(page.getByText("Puedes reintentar con la misma clave")).toHaveCount(0);
  cold = false;
  await page.getByRole("button", { name: "Reintentar lectura" }).click();
  await expect(page.getByText(candidate.title, { exact: true })).toBeVisible();
  await expect(readAlert).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reintentar lectura" })).toHaveCount(0);
});

test("locks the submitted decision until its receipt is confirmed and the candidate refreshed", async ({ page }) => {
  const reads = await mockInspection(page);
  const requests: { key: string; payload: unknown }[] = [];
  let release!: () => void;
  const commandGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**" + inspectionPath + "/commands", async (route) => {
    const request = route.request();
    const key = request.headers()["idempotency-key"];
    requests.push({ key, payload: request.postDataJSON() });
    await commandGate;
    reads.confirm();
    await route.fulfill({ json: receipt(key) });
  });

  await page.goto("/admin/editorial/" + candidateId);
  const action = page.getByLabel("Decisión", { exact: true });
  const reason = page.getByLabel("Motivo obligatorio");
  const url = page.getByLabel("URL oficial verificada (HTTPS, sin query)");
  const category = page.getByLabel("Categoría", { exact: true });
  await action.selectOption("APPROVE");
  await reason.fill("Verificado en la fuente oficial");
  await url.fill("https://example.test/activity");
  await category.selectOption("running");
  const initialReads = reads.readCount();
  await page.getByRole("button", { name: "Confirmar decisión" }).click();

  try {
    await expect.poll(() => requests.length).toBe(1);
    for (const control of [action, reason, url, category]) await expect(control).toBeDisabled();
    await expect(page.getByRole("button", { name: "Validando decisión…" })).toBeDisabled();
    await expect(page.getByText(/Decisión confirmada por Engine/)).toHaveCount(0);
    expect(requests[0].payload).toEqual({
      action: "APPROVE",
      expectedVersion: 1,
      expectedRevision: 0,
      reason: "Verificado en la fuente oficial",
      verificationUrl: "https://example.test/activity",
      category: "running",
    });
  } finally {
    release();
  }

  await expect(page.getByRole("status").filter({ hasText: "Decisión confirmada por Engine:" })).toHaveText(
    "Decisión confirmada por Engine: APPROVED",
  );
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
  await expect(reason).toHaveValue("");
  for (const control of [action, reason, url, category]) await expect(control).toBeEnabled();
  expect(reads.readCount()).toBe(initialReads + 1);
  expect(requests).toHaveLength(1);
});

test("an uncertain outcome can be retried with the same payload and idempotency key", async ({ page }) => {
  const reads = await mockInspection(page, "REJECTED");
  const requests: { key: string; body: string | null }[] = [];
  await page.route("**" + inspectionPath + "/commands", (route) => {
    const request = route.request();
    const key = request.headers()["idempotency-key"];
    requests.push({ key, body: request.postData() });
    if (requests.length > 1) reads.confirm();
    return requests.length === 1
      ? route.fulfill({ status: 503, json: { code: "WRITE_UNAVAILABLE" } })
      : route.fulfill({ json: receipt(key, "REJECTED") });
  });

  await page.goto("/admin/editorial/" + candidateId);
  const action = page.getByLabel("Decisión", { exact: true });
  await page.getByLabel("Motivo obligatorio").fill("Revisión de prueba");
  const initialReads = reads.readCount();
  await page.getByRole("button", { name: "Confirmar decisión" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No se ha podido confirmar la operación" })).toBeVisible();
  await expect(page.getByText(/Decisión confirmada por Engine/)).toHaveCount(0);
  expect(reads.readCount()).toBe(initialReads);

  // Returning to the unchanged payload must retain the key of the uncertain command.
  await action.selectOption("CORRECT_ORGANIZER");
  await action.selectOption("REJECT");
  await page.getByRole("button", { name: "Confirmar decisión" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Decisión confirmada por Engine:" })).toHaveText(
    "Decisión confirmada por Engine: REJECTED",
  );
  await expect(page.getByText("REJECTED", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0].key).toMatch(/^[0-9a-f-]{36}$/);
  expect(requests[1]).toEqual(requests[0]);
  expect(reads.readCount()).toBe(initialReads + 1);
});

const valenciaOrganizerId = "f5225129-1df5-4a37-b12f-41aa27c83943";
const unassigned = withData(
  {
    ...candidate,
    organizerName: null,
    organizers: [...candidate.organizers, { id: valenciaOrganizerId, name: "S.D. Correcaminos" }],
  },
  {
    ...candidate.data,
    organizerId: null,
    locations: [
      candidate.data.locations[0],
      { ...candidate.data.locations[0], pointName: "Eixida en la Plaça Marató", verified: false },
    ],
  },
);

async function mockCorrection(page: Page, initial: EditorialInspection = unassigned) {
  let current: EditorialInspection = initial;
  const commands: { key: string; payload: Record<string, unknown> }[] = [];
  let respond: (count: number) => { status: number; json: unknown } | null = () => null;
  await page.route("**" + inspectionPath, (route) => route.fulfill({ json: current }));
  await page.route("**" + inspectionPath + "/commands", (route) => {
    const key = route.request().headers()["idempotency-key"];
    const payload = route.request().postDataJSON();
    commands.push({ key, payload });
    const override = respond(commands.length);
    if (override) return route.fulfill(override);
    current = withData({ ...current, revision: current.revision + 1 }, payload.correction);
    return route.fulfill({ json: receipt(key, "in_review") });
  });
  return {
    commands,
    respondWith: (fn: typeof respond) => (respond = fn),
    /** Simulates a concurrent change by another editor. */
    advance: () => (current = { ...current, revision: current.revision + 1 }),
  };
}

test("reviews real-shaped details and associates only the organizer without verifying locations", async ({ page }) => {
  const mock = await mockCorrection(page);
  await page.goto("/admin/editorial/" + candidateId);
  await expect(page.getByText("2030-05-01T12:00:00", { exact: true })).toBeVisible();
  await expect(page.getByText(/Parque del Turia/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Revisar convocatoria oficial" })).toHaveAttribute(
    "href",
    "https://example.org/current",
  );
  await page.getByLabel("Decisión", { exact: true }).selectOption("CORRECT_ORGANIZER");
  // Organizer association requires neither a location confirmation nor registration fields.
  await expect(page.getByLabel(/He comprobado/)).toHaveCount(0);
  await expect(page.getByLabel("Enlace de inscripción comprobado")).toHaveCount(0);
  await page.getByLabel("Organizador comprobado").selectOption(valenciaOrganizerId);
  await page.getByLabel("Motivo obligatorio").fill("Organizador contrastado en la convocatoria vigente");
  await page.getByRole("button", { name: "Confirmar decisión" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Decisión confirmada por Engine:" })).toContainText(
    "in_review",
  );
  expect(mock.commands).toHaveLength(1);
  expect(mock.commands[0].payload).toEqual({
    action: "CORRECT",
    expectedVersion: 1,
    expectedRevision: 0,
    reason: "Organizador contrastado en la convocatoria vigente",
    correction: { ...unassigned.data, organizerId: valenciaOrganizerId },
  });
  await expect(page.getByText("Pendiente de verificar")).toHaveCount(2);
});

test("verifies only the location explicitly confirmed by the admin", async ({ page }) => {
  const mock = await mockCorrection(page);
  await page.goto("/admin/editorial/" + candidateId);
  await page.getByLabel("Decisión", { exact: true }).selectOption("VERIFY_LOCATION");
  await expect(page.getByLabel("Organizador comprobado")).toHaveCount(0);
  await page.getByLabel("Motivo obligatorio").fill("Salida comprobada en el reglamento");
  await page.getByRole("button", { name: "Confirmar decisión" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Marca expresamente cada ubicación que hayas comprobado." }),
  ).toBeVisible();
  expect(mock.commands).toHaveLength(0);
  await page.getByLabel(/He comprobado esta ubicación: .*Eixida en la Plaça Marató/).check();
  await page.getByRole("button", { name: "Confirmar decisión" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Decisión confirmada por Engine:" })).toBeVisible();
  expect(mock.commands[0].payload).toEqual({
    action: "CORRECT",
    expectedVersion: 1,
    expectedRevision: 0,
    reason: "Salida comprobada en el reglamento",
    correction: {
      ...unassigned.data,
      locations: [unassigned.data.locations[0], { ...unassigned.data.locations[1], verified: true }],
    },
  });
  await expect(page.getByText("Pendiente de verificar")).toHaveCount(1);
  await expect(page.getByLabel(/He comprobado esta ubicación: .*Eixida/)).toBeDisabled();
});

test("updates only the legacy registration link", async ({ page }) => {
  const mock = await mockCorrection(page);
  await page.goto("/admin/editorial/" + candidateId);
  await page.getByLabel("Decisión", { exact: true }).selectOption("CORRECT_REGISTRATION");
  await expect(page.getByLabel("Organizador comprobado")).toHaveCount(0);
  await page.getByLabel("Enlace de inscripción comprobado").fill("https://example.org/confirmed-booking");
  await page.getByLabel("Motivo obligatorio").fill("Enlace publicado por el organizador");
  await page.getByRole("button", { name: "Confirmar decisión" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Decisión confirmada por Engine:" })).toBeVisible();
  expect(mock.commands[0].payload.correction).toEqual({
    ...unassigned.data,
    registrationUri: "https://example.org/confirmed-booking",
  });
});

test("an organizer correction is retried idempotently and a version conflict resyncs the form", async ({ page }) => {
  const mock = await mockCorrection(page);
  mock.respondWith((count) => {
    if (count === 1) return { status: 503, json: { code: "WRITE_UNAVAILABLE" } };
    if (count !== 3) return null;
    mock.advance();
    return { status: 409, json: { code: "CONFLICT" } };
  });
  await page.goto("/admin/editorial/" + candidateId);
  await page.getByLabel("Decisión", { exact: true }).selectOption("CORRECT_ORGANIZER");
  await page.getByLabel("Organizador comprobado").selectOption(valenciaOrganizerId);
  await page.getByLabel("Motivo obligatorio").fill("Organizador contrastado");
  const submit = page.getByRole("button", { name: "Confirmar decisión" });
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "No se ha podido confirmar la operación" })).toBeVisible();
  await submit.click();
  await expect(page.getByRole("status").filter({ hasText: "Decisión confirmada por Engine:" })).toBeVisible();
  expect(mock.commands[1]).toEqual(mock.commands[0]);

  // Another editor changes the candidate: the 409 reloads it and clears the stale confirmation.
  await page.getByLabel("Decisión", { exact: true }).selectOption("VERIFY_LOCATION");
  const location = page.getByLabel(/He comprobado esta ubicación: .*Parque del Turia/);
  await location.check();
  await page.getByLabel("Motivo obligatorio").fill("Ubicación comprobada");
  await submit.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Se han recargado sus datos: revísalos y confirma de nuevo." }),
  ).toBeVisible();
  expect(mock.commands[2].payload).toMatchObject({ expectedVersion: 1, expectedRevision: 1 });
  await expect(page.getByText("2", { exact: true })).toBeVisible();
  await expect(location).not.toBeChecked();
  await location.check();
  await submit.click();
  await expect(page.getByRole("status").filter({ hasText: "Decisión confirmada por Engine:" })).toBeVisible();
  expect(mock.commands).toHaveLength(4);
  expect(mock.commands[3].payload).toMatchObject({ expectedVersion: 1, expectedRevision: 2 });
  expect(mock.commands[3].key).not.toBe(mock.commands[2].key);
});

test("organizer-only CORRECT preserves the exact Engine registration link", async ({ page }) => {
  for (const registrationUri of ["https://example.org", "https://example.org/a/../booking"]) {
    const raw = { ...inspectionFixture, data: { ...inspectionFixture.data, organizerId: null, registrationUri } };
    const inspection = { ...normalizeInspection(raw, candidateId), organizers: unassigned.organizers };
    expect(inspection.data.registrationUri).not.toBe(registrationUri);
    const mock = await mockCorrection(page, inspection);
    await page.goto("/admin/editorial/" + candidateId);
    await page.getByLabel("Decisión", { exact: true }).selectOption("CORRECT_ORGANIZER");
    await page.getByLabel("Organizador comprobado").selectOption(valenciaOrganizerId);
    await page.getByLabel("Motivo obligatorio").fill("Organizador contrastado");
    await page.getByRole("button", { name: "Confirmar decisión" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Decisión confirmada por Engine:" })).toBeVisible();
    expect(mock.commands[0].payload.correction).toEqual({ ...raw.data, organizerId: valenciaOrganizerId });
    await page.unrouteAll();
  }
});

test("blocks corrections when the Engine registration link cannot be preserved exactly", async ({ page }) => {
  const raw = {
    ...inspectionFixture,
    data: { ...inspectionFixture.data, registrationUri: "https://example.org/book?token=abc" },
  };
  const inspection = normalizeInspection(raw, candidateId);
  expect(inspection.correctionBase).toBeNull();
  const mock = await mockCorrection(page, { ...inspection, organizers: unassigned.organizers });
  await page.goto("/admin/editorial/" + candidateId);
  await page.getByLabel("Decisión", { exact: true }).selectOption("CORRECT_ORGANIZER");
  await expect(page.getByText(/no se puede reenviar con exactitud/)).toBeVisible();
  await page.getByLabel("Organizador comprobado").selectOption(valenciaOrganizerId);
  await page.getByLabel("Motivo obligatorio").fill("Organizador contrastado");
  await page.getByRole("button", { name: "Confirmar decisión" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /no se puede reenviar con exactitud/ })).toBeVisible();
  expect(mock.commands).toHaveLength(0);
  expect(JSON.stringify(inspection)).not.toContain("token=abc");
});

test("rejects re-associating the organizer that is already set", async ({ page }) => {
  const mock = await mockCorrection(page, candidate);
  await page.goto("/admin/editorial/" + candidateId);
  await page.getByLabel("Decisión", { exact: true }).selectOption("CORRECT_ORGANIZER");
  await expect(page.getByLabel("Organizador comprobado")).toHaveValue(candidate.data.organizerId!);
  await page.getByLabel("Motivo obligatorio").fill("Sin cambios");
  await page.getByRole("button", { name: "Confirmar decisión" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "El organizador seleccionado ya está asociado a este candidato." }),
  ).toBeVisible();
  expect(mock.commands).toHaveLength(0);
});

test("shows the known end date for a candidate without scheduled times", async ({ page }) => {
  await page.route("**" + inspectionPath, (route) =>
    route.fulfill({
      json: withData(candidate, {
        ...candidate.data,
        schedule: null,
        calendarDates: { startDate: "2030-05-01", endDate: "2030-05-03", precision: "DATE_ONLY" },
      }),
    }),
  );
  await page.goto("/admin/editorial/" + candidateId);
  await expect(page.getByText("2030-05-01", { exact: true })).toBeVisible();
  await expect(page.getByText("2030-05-03", { exact: true })).toBeVisible();
});

for (const evidenceUrl of ["https://example.org", "https://example.org/", "https://example.org/a/../booking"]) {
  test(`corrects WhatsApp and preserves evidence on refresh: ${evidenceUrl}`, async ({ page }) => {
    let inspection: EditorialInspection = withData(
      { ...candidate, registrationSupported: true },
      { ...candidate.data, registration: null },
    );
    const payloads: Record<string, unknown>[] = [];
    await page.route("**" + inspectionPath, (route) => route.fulfill({ json: inspection }));
    await page.route("**" + inspectionPath + "/commands", (route) => {
      const payload = route.request().postDataJSON();
      payloads.push(payload);
      if (payload.action === "CORRECT") inspection = withData({ ...inspection, revision: 1 }, payload.correction);
      return route.fulfill({ json: receipt(route.request().headers()["idempotency-key"]) });
    });
    await page.goto("/admin/editorial/" + candidateId);
    await page.getByLabel("Decisión", { exact: true }).selectOption("CORRECT_REGISTRATION");
    await page.getByLabel("Motivo obligatorio").fill("Canal y número publicados por el organizador");
    await page.getByLabel("Canal de inscripción", { exact: true }).selectOption("WHATSAPP");
    const destination = page.getByLabel("Destino de inscripción publicado", { exact: true });
    await expect(destination).toHaveAttribute("type", "tel");
    await destination.fill("+34600111222");
    await page.getByLabel("URL de la evidencia de inscripción").fill(evidenceUrl);
    await page
      .getByLabel("El organizador publica este canal y destino para inscripción y autoriza su uso público.")
      .check();
    await page.getByRole("button", { name: "Confirmar decisión" }).click();
    await expect(page.getByText("Inscripción: WHATSAPP", { exact: false })).toBeVisible();
    expect((payloads[0].correction as { registration: unknown }).registration).toEqual({
      method: "WHATSAPP",
      destination: "+34600111222",
      evidenceUrl: evidenceUrl,
      organizerPublished: true,
    });
    // Only the registration changes: organizer, schedule, prices and unverified locations are preserved.
    expect(payloads[0].correction).toEqual({
      ...candidate.data,
      registration: { method: "WHATSAPP", destination: "+34600111222", evidenceUrl, organizerPublished: true },
    });
    expect(JSON.stringify(payloads)).not.toContain("wa.me");
    await expect(page.getByLabel("URL oficial verificada (HTTPS, sin query)")).toHaveCount(0);
    await page.getByLabel("Decisión", { exact: true }).selectOption("APPROVE");
    await expect(page.getByLabel("URL oficial verificada (HTTPS, sin query)")).toHaveValue(evidenceUrl);
    await page.getByLabel("Motivo obligatorio").fill("Verificada la autorización pública ahora");
    await page.getByLabel("Categoría", { exact: true }).selectOption("yoga");
    await page.getByRole("button", { name: "Confirmar decisión" }).click();
    expect(payloads).toHaveLength(1);
    await page
      .getByLabel("He verificado ahora el canal, destino y autorización de publicación del organizador.")
      .check();
    await page.getByRole("button", { name: "Confirmar decisión" }).click();
    await expect.poll(() => payloads.length).toBe(2);
    expect(payloads[1]).toMatchObject({
      action: "APPROVE",
      registrationVerified: true,
      verificationUrl: evidenceUrl,
    });
  });
}

test("initial inspection prefills the exact bare-origin evidence for approval", async ({ page }) => {
  const evidenceUrl = "https://example.org";
  const inspection = {
    ...candidate,
    registrationSupported: true,
    data: {
      ...candidate.data,
      registration: { method: "WHATSAPP", destination: "+34600111222", evidenceUrl, organizerPublished: true },
    },
  };
  const payloads: Record<string, unknown>[] = [];
  await page.route("**" + inspectionPath, (route) => route.fulfill({ json: inspection }));
  await page.route("**" + inspectionPath + "/commands", (route) => {
    payloads.push(route.request().postDataJSON());
    return route.fulfill({ json: receipt(route.request().headers()["idempotency-key"]) });
  });
  await page.goto("/admin/editorial/" + candidateId);
  await page.getByLabel("Decisión", { exact: true }).selectOption("APPROVE");
  await expect(page.getByLabel("URL oficial verificada (HTTPS, sin query)")).toHaveValue(evidenceUrl);
  await page.getByLabel("Motivo obligatorio").fill("Verified the exact organizer evidence");
  await page.getByLabel("Categoría", { exact: true }).selectOption("yoga");
  await page.getByLabel("He verificado ahora el canal, destino y autorización de publicación del organizador.").check();
  await page.getByRole("button", { name: "Confirmar decisión" }).click();
  await expect.poll(() => payloads.length).toBe(1);
  expect(payloads[0]).toMatchObject({ action: "APPROVE", verificationUrl: evidenceUrl, registrationVerified: true });
});
