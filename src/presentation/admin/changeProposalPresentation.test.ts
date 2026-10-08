import { describe, expect, it } from "vitest";

import { known, unknown, type ChangeField, type Organizer } from "@/domain/admin";
import { changeFieldLabels, formatChangeFieldValue } from "./changeProposalPresentation";

const organizers: Organizer[] = [];

describe("change proposal presentation", () => {
  it("shows the before and after date separately", () => {
    const change: ChangeField = {
      field: "startLocal",
      before: known("2026-10-07T19:00:00"),
      after: known("2026-10-07T18:30:00"),
      evidenceIds: [],
    };
    expect(changeFieldLabels[change.field]).toBe("Fecha y hora de inicio");
    expect(formatChangeFieldValue(change, "before", organizers)).toContain("19:00");
    expect(formatChangeFieldValue(change, "after", organizers)).toContain("18:30");
  });

  it("preserves unknown states and shows structured values", () => {
    const unknownChange: ChangeField = {
      field: "location",
      before: unknown("not_verified"),
      after: known("Valencia"),
      evidenceIds: [],
    };
    expect(formatChangeFieldValue(unknownChange, "before", organizers)).toBe("No verificado");
    expect(formatChangeFieldValue(unknownChange, "after", organizers)).toBe("Valencia");

    const priceChange: ChangeField = {
      field: "price",
      before: known({ kind: "free", options: [], perSessionComparable: true }),
      after: known({
        kind: "transport_included",
        options: [{ amount: 54, currency: "EUR", label: "with transport" }],
        perSessionComparable: true,
      }),
      evidenceIds: [],
    };
    expect(formatChangeFieldValue(priceChange, "before", organizers)).toBe("Gratis");
    expect(formatChangeFieldValue(priceChange, "after", organizers)).toContain("54 € with transport");
  });
});
