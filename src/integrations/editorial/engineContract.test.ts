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
