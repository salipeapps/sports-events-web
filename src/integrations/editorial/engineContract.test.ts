import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { normalizeInspection } from "./inspection";
import { decodeCatalogPage } from "@/integrations/catalog/supabaseCatalog";

vi.mock("server-only", () => ({}));

// Opt-in cross-repository check of actual PG17/Java/RPC output. No STAGING writes.
// First run Engine EditorialCommandsIT, then set this path for vitest.
if (process.env.EDITORIAL_ENGINE_CONTRACT_FILE) {
  it("consumes unmodified Java inspection and public RPC bytes before/after suspension", () => {
    const captured = JSON.parse(readFileSync(process.env.EDITORIAL_ENGINE_CONTRACT_FILE!, "utf8"));
    const inspection = normalizeInspection(captured.inspection, captured.inspection.candidateId);
    expect(inspection.publicationId).toBe(captured.publicationId);
    expect(inspection.publicationStatus).toBe("published");
    expect(inspection.data.locations[0].verified).toBe(true);
    const query = { ...captured.query, cursor: null };
    const now = new Date(captured.query.desde);
    const published = decodeCatalogPage(captured.published, query, now);
    expect(published.items.filter((item) => item.id === captured.publicationId)).toHaveLength(1);
    expect(published.items.find((item) => item.id === captured.publicationId)?.organizerName).toBe("Offline organizer");
    const suspended = decodeCatalogPage(captured.suspended, query, now);
    expect(suspended.items.some((item) => item.id === captured.publicationId)).toBe(false);
  });
} else {
  it("requires the full inspection contract rather than accepting title-only legacy data", () => {
    expect(() => normalizeInspection({ data: { title: "Incomplete" } }, "missing")).toThrow();
  });
}

if (process.env.REGISTRATION_ENGINE_CONTRACT_DIR) {
  it.each(["WEB", "WHATSAPP", "PHONE", "EMAIL"])("consumes the actual PG17 v2 %s projection", (method) => {
    const file = process.env.REGISTRATION_ENGINE_CONTRACT_DIR + "/" + method + ".json";
    const captured = JSON.parse(readFileSync(file, "utf8"));
    const item = captured.item;
    const query = {
      desde: new Date(Date.parse(item.startInstant) - 1000).toISOString(),
      hasta: new Date(Date.parse(item.startInstant) + 3600000).toISOString(),
      cursor: null,
      limit: 24,
    };
    const page = decodeCatalogPage(
      { contractVersion: 2, items: [item], nextCursor: null },
      query,
      new Date(item.lastVerifiedAt),
      2,
    );
    expect(page.items[0].registration?.method).toBe(method);
    expect(JSON.stringify(page)).not.toMatch(/evidenceUrl|organizerPublished|wa[.]me/);
  });
}
