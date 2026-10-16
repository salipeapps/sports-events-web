import { expect, test, type Page } from "@playwright/test";
import { candidate as sample } from "./fixtures/discovery-ui/candidate";
import type { FixtureState } from "./fixtures/discovery-ui/main";

const detailPath = `/admin/discovery/results/${sample.id}`;
const requestId = "43ade75d-0216-4cfd-a515-f1bcfdf062ef";
const reviewId = "3afeef88-1111-4000-8000-111111111111";
const sourceId = "11a2a2a2-1111-4000-8000-111111111111";
function state(role: "admin" | "reviewer" = "admin"): FixtureState {
  return {
    candidate: structuredClone(sample),
    access: {
      subject: role,
      canReject: true,
      canPromote: role === "admin",
      rejectionEnabled: true,
      promotionEnabled: true,
    },
  };
}
async function mount(page: Page, data: FixtureState) {
  await page.route("**/fixture/state", (route) => route.fulfill({ json: data }));
  await page.goto(detailPath);
  await expect(page.getByRole("heading", { name: "Decisión editorial" })).toBeVisible();
}
async function prepareRejection(page: Page) {
  await page.getByRole("button", { name: "Rechazar con motivo", exact: true }).click();
  await page.getByLabel("Motivo obligatorio").selectOption("OUT_OF_SCOPE");
  await page.getByRole("button", { name: "Revisar decisión", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function reject(page: Page) {
  await prepareRejection(page);
  await page.getByRole("button", { name: "Confirmar rechazo", exact: true }).click();
}
function rejected(data: FixtureState) {
  data.candidate.reviewStatus = "REJECTED";
  data.candidate.latestReviewId = reviewId;
  data.candidate.latestReview = {
    id: reviewId,
    decision: "REJECTED",
    reasonCode: "OUT_OF_SCOPE",
    reviewerRef: data.access!.subject,
    reviewedAt: "2026-10-15T10:00:00Z",
  };
  return {
    candidateId: sample.id,
    reviewId,
    reviewStatus: "REJECTED",
    reasonCode: "OUT_OF_SCOPE",
    reviewerRef: data.access!.subject,
    reviewedAt: "2026-10-15T10:00:00Z",
  };
}

test("reviewer confirms required reason, persists history and cannot promote", async ({ page }) => {
  const data = state("reviewer");
  let commands = 0;
  await page.route("**/api/internal/discovery/candidates/**", (route) => {
    commands++;
    expect(route.request().postDataJSON()).toEqual({ reasonCode: "OUT_OF_SCOPE" });
    expect(route.request().url()).toContain("/rejection");
    return route.fulfill({ json: rejected(data), headers: { "x-request-id": requestId } });
  });
  await mount(page, data);
  await expect(page.getByRole("button", { name: "Aprobar y promover a B2" })).toHaveCount(0);
  await page.getByRole("button", { name: "Rechazar con motivo" }).click();
  await page.getByRole("button", { name: "Revisar decisión", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(commands).toBe(0);
  await page.getByLabel("Motivo obligatorio").selectOption("OUT_OF_SCOPE");
  await page.getByRole("button", { name: "Revisar decisión", exact: true }).click();
  expect(commands).toBe(0);
  await page.getByRole("button", { name: "Confirmar rechazo", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Rechazo registrado");
  await expect(page.getByText("Rechazada", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Revisiones", exact: true }).locator("..")).toContainText(
    "Fuera de alcance",
  );
  await expect(page.getByRole("heading", { name: "Revisiones", exact: true }).locator("..")).toContainText(
    "actor reviewer",
  );
  expect(commands).toBe(1);
});

test("admin promotion confirms adapter/domain/version and shows disabled UNTRUSTED B2", async ({ page }) => {
  const data = state();
  await page.route("**/api/internal/discovery/candidates/**", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      expectedReviewStatus: "PENDING_REVIEW",
      expectedClassificationVersion: 1,
      sourceName: "Offline studio",
      sourceKind: "BOOKING_PLATFORM",
      canonicalSourceUrl: sample.canonicalUrl,
      adapterKey: "momoyoga",
      allowedDomain: "www.momoyoga.com",
      requestBudget: 1,
    });
    data.candidate.reviewStatus = "APPROVED";
    data.candidate.linkedSourceId = sourceId;
    data.candidate.source = { id: sourceId, status: "UNTRUSTED", enabled: false, adapterKey: "momoyoga" };
    return route.fulfill({
      json: { candidateId: sample.id, reviewId, sourceId, reusedSource: false, promotedAt: "2026-10-15T10:00:00Z" },
      headers: { "x-request-id": requestId },
    });
  });
  await mount(page, data);
  await page.getByRole("button", { name: "Aprobar y promover a B2" }).click();
  await page.getByLabel("Nombre de la fuente").fill(" Offline studio ");
  await page.getByRole("button", { name: "Revisar decisión", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("momoyoga · www.momoyoga.com");
  await expect(page.getByRole("dialog")).toContainText("solo manual");
  await page.getByRole("button", { name: "Confirmar promoción B2", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Promoción B2 registrada");
  await expect(page.getByText("UNTRUSTED · momoyoga · deshabilitada", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar y promover a B2" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(sourceId, { exact: true })).toBeVisible();
});

test("historical nine unsupported plus one ambiguous never offer promotion", async ({ page }) => {
  const data = state();
  data.queue = Array.from({ length: 10 }, (_, i) => ({
    ...structuredClone(sample),
    id: `ca73b0ff-8001-4000-8000-${String(i).padStart(12, "0")}`,
    classification: {
      ...sample.classification!,
      kind: i < 9 ? "UNSUPPORTED_REVIEWABLE" : "AMBIGUOUS_REVIEW_REQUIRED",
      proposedAdapterKey: null,
    },
  }));
  await mount(page, { ...data, queue: undefined, candidate: data.queue[0] });
  await expect(page.getByRole("button", { name: "Aprobar y promover a B2" })).toHaveCount(0);
  await page.unroute("**/fixture/state");
  await page.route("**/fixture/state", (route) => route.fulfill({ json: data }));
  await page.reload();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(10);
  await expect(page.getByText("Promoción B2 disponible en el detalle")).toHaveCount(0);
  for (const item of data.queue) {
    await page.unroute("**/fixture/state");
    await page.route("**/fixture/state", (route) => route.fulfill({ json: { candidate: item, access: data.access } }));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Decisión editorial" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Aprobar y promover a B2" })).toHaveCount(0);
    await expect(page.getByText("Conservar como pendiente / requiere adaptador.")).toBeVisible();
  }
});

for (const [name, feedback] of [
  ["  \u00a0  ", "no puede estar vacío ni contener solo espacios"],
  ["Studio\u200b", "no puede contener caracteres de control ni caracteres invisibles"],
] as const) {
  test(`invalid source name cannot create an intent or dispatch a promotion: ${JSON.stringify(name)}`, async ({
    page,
  }) => {
    let requests = 0;
    await page.route("**/api/internal/discovery/candidates/**", (route) => {
      requests++;
      return route.abort();
    });
    await mount(page, state());
    await page.getByRole("button", { name: "Aprobar y promover a B2" }).click();
    await page.getByLabel("Nombre de la fuente").fill(name);
    await page.getByRole("button", { name: "Revisar decisión", exact: true }).click();
    await expect(page.getByRole("status").first()).toContainText(feedback);
    await expect(page.getByLabel("Nombre de la fuente")).toBeFocused();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(
      await page.evaluate(
        () => Object.keys(sessionStorage).filter((key) => key.startsWith("discovery-review-v1:")).length,
      ),
    ).toBe(0);
    expect(requests).toBe(0);
  });
}

test("disabled gates render no operational form and keep inspection/history", async ({ page }) => {
  const data = state();
  data.access!.rejectionEnabled = false;
  data.access!.promotionEnabled = false;
  let writes = 0;
  await page.route("**/api/internal/discovery/**", (route) => {
    writes++;
    return route.abort();
  });
  await mount(page, data);
  await expect(page.getByText("Modo de solo lectura.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Observaciones y procedencia" })).toBeVisible();
  expect(writes).toBe(0);
});

test("503 after commit survives reload and replays exact key/payload despite fresh decided state", async ({ page }) => {
  const data = state();
  const attempts: { key: string | undefined; body: string | null }[] = [];
  await page.route("**/api/internal/discovery/candidates/**", (route) => {
    const request = route.request();
    attempts.push({ key: request.headers()["idempotency-key"], body: request.postData() });
    const receipt = rejected(data);
    return attempts.length === 1
      ? route.fulfill({
          status: 503,
          json: { code: "WRITE_UNAVAILABLE", requestId },
          headers: { "x-request-id": requestId },
        })
      : route.fulfill({ json: receipt, headers: { "x-request-id": requestId } });
  });
  await mount(page, data);
  await reject(page);
  await expect(page.getByRole("status").first()).toContainText("No se puede confirmar");
  await page.reload();
  await expect(page.getByText("Rechazada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reintentar misma decisión" }).click();
  await page.getByRole("button", { name: "Confirmar rechazo", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Rechazo registrado");
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
});

for (const [code, httpStatus] of [
  ["NOT_CONFIGURED", 404],
  ["FORBIDDEN", 403],
] as const) {
  test(`uncertain receipt survives ${code}, disabled gates and subsequent reactivation`, async ({ page }) => {
    const data = state();
    const attempts: { key?: string; body: string | null }[] = [];
    await page.route("**/api/internal/discovery/candidates/**", (route) => {
      attempts.push({ key: route.request().headers()["idempotency-key"], body: route.request().postData() });
      const receipt = rejected(data);
      if (attempts.length === 1) return route.fulfill({ status: 503, json: { code: "WRITE_UNAVAILABLE", requestId } });
      if (attempts.length === 2) {
        data.access!.rejectionEnabled = false;
        data.access!.promotionEnabled = false;
        return route.fulfill({ status: httpStatus, json: { code, requestId } });
      }
      return route.fulfill({ json: receipt, headers: { "x-request-id": requestId } });
    });
    await mount(page, data);
    await reject(page);
    await expect(page.getByRole("status").first()).toContainText("No se puede confirmar");
    await page.getByRole("button", { name: "Reintentar misma decisión" }).click();
    await page.getByRole("button", { name: "Confirmar rechazo", exact: true }).click();
    await expect(page.getByText("Modo de solo lectura.", { exact: false })).toBeVisible();
    expect(
      await page.evaluate(
        () => Object.keys(sessionStorage).filter((key) => key.startsWith("discovery-review-v1:")).length,
      ),
    ).toBe(1);
    data.access!.rejectionEnabled = true;
    data.access!.promotionEnabled = true;
    await page.reload();
    await page.getByRole("button", { name: "Reintentar misma decisión" }).click();
    await page.getByRole("button", { name: "Confirmar rechazo", exact: true }).click();
    await expect(page.getByRole("status").first()).toContainText("Rechazo registrado");
    expect(attempts).toHaveLength(3);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[2]).toEqual(attempts[0]);
  });
}

test("denied replay keeps its key but locks retry until the candidate is reopened", async ({ page }) => {
  const data = state();
  const attempts: { key?: string; body: string | null }[] = [];
  await page.route("**/api/internal/discovery/candidates/**", (route) => {
    attempts.push({ key: route.request().headers()["idempotency-key"], body: route.request().postData() });
    if (attempts.length === 1) return route.fulfill({ status: 503, json: { code: "WRITE_UNAVAILABLE", requestId } });
    if (attempts.length === 2) return route.fulfill({ status: 403, json: { code: "FORBIDDEN", requestId } });
    return route.fulfill({ json: rejected(data), headers: { "x-request-id": requestId } });
  });
  await mount(page, data);
  await reject(page);
  await expect(page.getByRole("status").first()).toContainText("No se puede confirmar");
  await page.getByRole("button", { name: "Reintentar misma decisión" }).click();
  await page.getByRole("button", { name: "Confirmar rechazo", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("ya no tiene permiso");
  await expect(page.getByRole("button", { name: "Reintentar misma decisión" })).toBeDisabled();
  await page.getByRole("button", { name: "Consultar estado actualizado" }).click();
  await expect(page.getByRole("button", { name: "Reintentar misma decisión" })).toBeDisabled();
  expect(attempts).toHaveLength(2);
  await page.getByRole("link", { name: "Abrir de nuevo el candidato" }).click();
  await page.getByRole("button", { name: "Reintentar misma decisión" }).click();
  await page.getByRole("button", { name: "Confirmar rechazo", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Rechazo registrado");
  expect(attempts).toHaveLength(3);
  expect(attempts[2]).toEqual(attempts[0]);
});

test("409 refreshes concurrent state without an automatic retry", async ({ page }) => {
  const data = state();
  let attempts = 0;
  await page.route("**/api/internal/discovery/candidates/**", (route) => {
    attempts++;
    rejected(data);
    return route.fulfill({ status: 409, json: { code: "REJECTION_CONFLICT", requestId } });
  });
  await mount(page, data);
  await reject(page);
  await expect(page.getByRole("status").first()).toContainText("Otra decisión");
  await expect(page.getByText("Rechazada", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar misma decisión" })).toHaveCount(0);
  expect(attempts).toBe(1);
});

for (const [code, status, text] of [
  ["UNAUTHENTICATED", 401, "verificar la sesión"],
  ["FORBIDDEN", 403, "ya no tiene permiso"],
  ["INVALID_REJECTION_REASON", 422, "motivo de rechazo no está admitido"],
  ["RATE_LIMITED", 429, "Espera un minuto"],
] as const) {
  test(`safe ${status} feedback preserves the page and hides provider text`, async ({ page }) => {
    const data = state("reviewer");
    await page.route("**/api/internal/discovery/candidates/**", (route) =>
      route.fulfill({
        status,
        json: { code, requestId, detail: "SQL secret <script>provider</script>" },
        headers: { "x-request-id": requestId },
      }),
    );
    await mount(page, data);
    await reject(page);
    await expect(page.getByRole("status").first()).toContainText(text);
    await expect(page.getByRole("status").first()).toContainText(requestId);
    await expect(page.locator("body")).not.toContainText("SQL secret");
    await expect(page).toHaveURL(new RegExp(sample.id));
    if (status === 422) {
      await expect(page.getByLabel("Motivo obligatorio")).toBeVisible();
      await page.getByLabel("Motivo obligatorio").selectOption("INVALID_SOURCE");
    }
  });
}

for (const [status, code] of [
  [429, "RATE_LIMITED"],
  [503, "WRITE_UNAVAILABLE"],
] as const) {
  test(`shared quota ${status} preserves exact intent across reload and explicit retry`, async ({ page }) => {
    const data = state();
    const attempts: { key?: string; body: string | null }[] = [];
    await page.route("**/api/internal/discovery/candidates/**", (route) => {
      attempts.push({ key: route.request().headers()["idempotency-key"], body: route.request().postData() });
      if (attempts.length === 1)
        return route.fulfill({ status, json: { code, requestId }, headers: { "retry-after": "60" } });
      return route.fulfill({ json: rejected(data), headers: { "x-request-id": requestId } });
    });
    await mount(page, data);
    await reject(page);
    await expect(page.getByRole("status").first()).toContainText(
      status === 429 ? "Espera un minuto" : "No se puede confirmar",
    );
    expect(attempts).toHaveLength(1);
    await page.reload();
    await page.getByRole("button", { name: "Reintentar misma decisión" }).click();
    await page.getByRole("button", { name: "Confirmar rechazo", exact: true }).click();
    await expect(page.getByRole("status").first()).toContainText("Rechazo registrado");
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(attempts[1]);
  });
}

test("double click cannot send twice and a network failure retains the intent", async ({ page }) => {
  let attempts = 0;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/internal/discovery/candidates/**", async (route) => {
    attempts++;
    await hold;
    await route.abort("failed");
  });
  await mount(page, state());
  await prepareRejection(page);
  await page.getByRole("button", { name: "Confirmar rechazo", exact: true }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole("button", { name: "Confirmar rechazo", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Volver sin enviar" })).toBeDisabled();
  release();
  await expect(page.getByRole("button", { name: "Reintentar misma decisión" })).toBeVisible();
  expect(attempts).toBe(1);
});

test("mobile dialog traps keyboard focus, Escape restores focus, cancel sends nothing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, state());
  await prepareRejection(page);
  await expect(page.getByRole("button", { name: "Volver sin enviar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Confirmar rechazo", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Volver sin enviar" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/discovery-review-mobile.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Revisar decisión", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Cancelar edición" }).click();
  await expect(page.getByLabel("Motivo obligatorio")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rechazar con motivo" })).toBeFocused();
});

test("approval without linked source never claims promotion; provider text stays escaped", async ({ page }) => {
  const data = state();
  data.candidate.reviewStatus = "APPROVED";
  data.candidate.canonicalUrl = "https://example.test/<script>provider</script>";
  await mount(page, data);
  await expect(page.getByText(/todavía no consta una fuente B2 vinculada/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar y promover a B2" })).toHaveCount(0);
  await expect(page.locator("main script")).toHaveCount(0);
});

test("revoked permissions are reflected on refresh after a denied command", async ({ page }) => {
  const data = state("reviewer");
  await page.route("**/api/internal/discovery/candidates/**", (route) => {
    data.access!.canReject = false;
    data.access!.canPromote = false;
    return route.fulfill({ status: 403, json: { code: "FORBIDDEN", requestId } });
  });
  await mount(page, data);
  await reject(page);
  await expect(page.getByText("Modo de solo lectura.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Revisiones", exact: true })).toBeVisible();
});

test("blocked browser storage prevents dispatch", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage blocked");
    };
  });
  let requests = 0;
  await page.route("**/api/internal/discovery/candidates/**", (route) => {
    requests++;
    return route.abort();
  });
  await mount(page, state());
  await reject(page);
  await expect(page.getByRole("status").first()).toContainText("No se ha enviado la decisión");
  expect(requests).toBe(0);
});

test("uncertain promotion preserves configuration/version across fresh classification", async ({ page }) => {
  const data = state();
  const attempts: { key?: string; body: unknown }[] = [];
  await page.route("**/api/internal/discovery/candidates/**", (route) => {
    attempts.push({ key: route.request().headers()["idempotency-key"], body: route.request().postDataJSON() });
    data.candidate.classification!.ruleVersion = 2;
    return attempts.length === 1
      ? route.fulfill({ status: 503, json: { code: "WRITE_UNAVAILABLE", requestId } })
      : route.fulfill({ status: 409, json: { code: "PROMOTION_CONFLICT", requestId } });
  });
  await mount(page, data);
  await page.getByRole("button", { name: "Aprobar y promover a B2" }).click();
  await page.getByLabel("Nombre de la fuente").fill("Original studio");
  await page.getByRole("button", { name: "Revisar decisión", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar promoción B2", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("No se puede confirmar");
  await page.reload();
  await page.getByRole("button", { name: "Reintentar misma decisión" }).click();
  await expect(page.getByRole("dialog")).toContainText("Original studio");
  await page.getByRole("button", { name: "Confirmar promoción B2", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Otra decisión");
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[1].body).toMatchObject({ expectedClassificationVersion: 1 });
});
