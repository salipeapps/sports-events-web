import { describe, expect, it } from "vitest";

import type { EditorialData } from "@/domain/editorial";
import { inspectionFixture } from "@/integrations/editorial/inspection.fixture";
import { normalizeInspection } from "@/integrations/editorial/inspection";
import { buildCorrection, canSubmitAction, commandAction, correctionActions } from "./editorialCorrection";

const organizerId = "f5225129-1df5-4a37-b12f-41aa27c83943";
const base = normalizeInspection(inspectionFixture, inspectionFixture.candidateId).data;
const unassigned: EditorialData = {
  ...base,
  organizerId: null,
  priceOptions: [
    {
      type: "FIXED",
      scope: "PER_SESSION",
      money: { amount: 4500, currency: "EUR" },
      conditions: null,
      validFrom: null,
      validTo: null,
      transportCost: "UNKNOWN",
    },
  ],
  locations: [
    { ...base.locations[0], verified: false },
    { ...base.locations[0], pointName: "Meta", verified: false },
  ],
};
const withRegistration: EditorialData = {
  ...unassigned,
  registration: {
    method: "WEB",
    destination: "https://example.org/book",
    evidenceUrl: "https://example.org/rules",
    organizerPublished: true,
  },
};

describe("buildCorrection", () => {
  it("changes only organizerId and never verifies locations", () => {
    for (const data of [unassigned, withRegistration]) {
      const snapshot = structuredClone(data);
      const correction = buildCorrection(data, { kind: "ORGANIZER", organizerId });
      expect(correction).toEqual({ ...snapshot, organizerId });
      expect(correction?.locations.every((location) => location.verified === false)).toBe(true);
      expect(data).toEqual(snapshot);
      expect(Object.hasOwn(correction!, "registration")).toBe(Object.hasOwn(data, "registration"));
    }
  });

  it("rejects an empty or unchanged organizer", () => {
    expect(buildCorrection(unassigned, { kind: "ORGANIZER", organizerId: "" })).toBeNull();
    expect(buildCorrection({ ...unassigned, organizerId }, { kind: "ORGANIZER", organizerId })).toBeNull();
  });

  it("verifies only the explicitly confirmed location", () => {
    const correction = buildCorrection(unassigned, { kind: "LOCATIONS", verifiedIndexes: [1] });
    expect(correction).toEqual({
      ...unassigned,
      locations: [unassigned.locations[0], { ...unassigned.locations[1], verified: true }],
    });
    expect(unassigned.locations[1].verified).toBe(false);
  });

  it("rejects empty, out-of-range or already verified location confirmations", () => {
    const verified = { ...unassigned, locations: [{ ...unassigned.locations[0], verified: true }] };
    for (const [data, verifiedIndexes] of [
      [unassigned, []],
      [unassigned, [2]],
      [unassigned, [-1]],
      [unassigned, [0.5]],
      [verified, [0]],
    ] as const)
      expect(buildCorrection(data, { kind: "LOCATIONS", verifiedIndexes })).toBeNull();
  });

  it("updates only the registration channel", () => {
    const registration = {
      method: "WHATSAPP" as const,
      destination: "+34600111222",
      evidenceUrl: "https://example.org/rules",
      organizerPublished: true,
    };
    expect(buildCorrection(withRegistration, { kind: "REGISTRATION", registration })).toEqual({
      ...withRegistration,
      registration,
    });
    expect(
      buildCorrection(withRegistration, { kind: "REGISTRATION", registration: withRegistration.registration! }),
    ).toBeNull();
    expect(buildCorrection(unassigned, { kind: "REGISTRATION", registration })).toBeNull();
  });

  it("updates only the legacy registration link", () => {
    const registrationUri = "https://example.org/confirmed-booking";
    expect(buildCorrection(unassigned, { kind: "REGISTRATION_URI", registrationUri })).toEqual({
      ...unassigned,
      registrationUri,
    });
    expect(
      buildCorrection(unassigned, { kind: "REGISTRATION_URI", registrationUri: unassigned.registrationUri! }),
    ).toBeNull();
    expect(buildCorrection(withRegistration, { kind: "REGISTRATION_URI", registrationUri })).toBeNull();
  });
});

describe("editorial action mapping", () => {
  it("sends every separated operation as the single CORRECT command", () => {
    for (const action of correctionActions) expect(commandAction(action)).toBe("CORRECT");
    expect(commandAction("APPROVE")).toBe("APPROVE");
  });

  it("denies corrections to reviewers", () => {
    for (const action of correctionActions) {
      expect(canSubmitAction("reviewer", action)).toBe(false);
      expect(canSubmitAction("admin", action)).toBe(true);
    }
    expect(canSubmitAction("reviewer", "REJECT")).toBe(true);
    expect(canSubmitAction("reviewer", "PUBLISH")).toBe(false);
  });
});
