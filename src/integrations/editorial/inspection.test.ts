import { describe, expect, it } from "vitest";

import { buildCorrection } from "@/presentation/admin/editorialCorrection";
import { inspectionFixture } from "./inspection.fixture";
import { normalizeInspection } from "./inspection";

const id = inspectionFixture.candidateId;
const organizerId = "f5225129-1df5-4a37-b12f-41aa27c83943";
const engine = (registrationUri: string | null) => ({
  ...inspectionFixture,
  data: { ...inspectionFixture.data, organizerId: null, registrationUri },
});

describe("exact CORRECT snapshot", () => {
  it.each(["https://example.org", "https://example.org/a/../booking", "https://example.org/book", null])(
    "an organizer-only correction preserves the Engine registrationUri %s byte for byte",
    (registrationUri) => {
      const raw = engine(registrationUri);
      const inspection = normalizeInspection(raw, id);
      expect(inspection.correctionBase).not.toBeNull();
      const correction = buildCorrection(inspection.correctionBase!, { kind: "ORGANIZER", organizerId });
      expect(correction).toEqual({ ...raw.data, organizerId });
    },
  );

  it("keeps canonical safe links for display only", () => {
    const inspection = normalizeInspection(engine("https://example.org"), id);
    expect(inspection.data.registrationUri).toBe("https://example.org/");
    expect(inspection.correctionBase?.registrationUri).toBe("https://example.org");
  });

  it.each(["https://example.org/book?token=abc", "http://example.org/book", "https://user:pass@example.org/"])(
    "offers no snapshot and never exposes a filtered link: %s",
    (registrationUri) => {
      const inspection = normalizeInspection(engine(registrationUri), id);
      expect(inspection.data.registrationUri).toBeNull();
      expect(inspection.correctionBase).toBeNull();
      expect(JSON.stringify(inspection)).not.toContain(registrationUri);
    },
  );
});
