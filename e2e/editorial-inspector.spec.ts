import { expect, test, type Page } from "@playwright/test";
import { inspectionFixture } from "../src/integrations/editorial/inspection.fixture";
import { normalizeInspection } from "../src/integrations/editorial/inspection";

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
  await action.selectOption("CORRECT");
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

test("reviews real-shaped details and completes missing organizer/location through CORRECT", async ({ page }) => {
  let current = { ...candidate, organizerName: null, data: { ...candidate.data, organizerId: null } };
  await page.route("**" + inspectionPath, (route) => route.fulfill({ json: current }));
  let payload: Record<string, unknown> | undefined;
  await page.route("**" + inspectionPath + "/commands", (route) => {
    payload = route.request().postDataJSON();
    current = { ...current, revision: 1 };
    return route.fulfill({ json: receipt(route.request().headers()["idempotency-key"], "in_review") });
  });
  await page.goto("/admin/editorial/" + candidateId);
  await expect(page.getByText("2030-05-01T12:00:00", { exact: true })).toBeVisible();
  await expect(page.getByText(/Parque del Turia/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Revisar convocatoria oficial" })).toHaveAttribute(
    "href",
    "https://example.org/current",
  );
  await page.getByLabel("Decisión", { exact: true }).selectOption("CORRECT");
  await page.getByLabel("Organizador comprobado").selectOption(inspectionFixture.organizers[0].id);
  await page.getByLabel("Enlace de inscripción comprobado").fill("https://example.org/confirmed-booking");
  await page.getByLabel("He comprobado todas las ubicaciones mostradas en la convocatoria oficial.").check();
  await page.getByLabel("Motivo obligatorio").fill("Organizador y ubicación contrastados en la convocatoria vigente");
  await page.getByRole("button", { name: "Confirmar decisión" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Decisión confirmada por Engine:" })).toContainText(
    "in_review",
  );
  expect(payload).toMatchObject({
    action: "CORRECT",
    expectedVersion: 1,
    expectedRevision: 0,
    correction: {
      organizerId: inspectionFixture.organizers[0].id,
      registrationUri: "https://example.org/confirmed-booking",
      locations: [{ verified: true }],
    },
  });
  expect(payload).not.toHaveProperty("actor");
  expect(payload).not.toHaveProperty("role");
});

test("shows the known end date for a candidate without scheduled times", async ({ page }) => {
  await page.route("**" + inspectionPath, (route) =>
    route.fulfill({
      json: {
        ...candidate,
        data: {
          ...candidate.data,
          schedule: null,
          calendarDates: { startDate: "2030-05-01", endDate: "2030-05-03", precision: "DATE_ONLY" },
        },
      },
    }),
  );
  await page.goto("/admin/editorial/" + candidateId);
  await expect(page.getByText("2030-05-01", { exact: true })).toBeVisible();
  await expect(page.getByText("2030-05-03", { exact: true })).toBeVisible();
});
