import type { AdminRole } from "@/domain/adminAccess";
import type { EditorialData } from "@/domain/editorial";
import type { OrganizerRegistration } from "@/domain/registration";

/**
 * Independent editorial operations. All of them are sent to Engine as a single `CORRECT`
 * command whose `correction` is the fresh `candidate.data` with only the confirmed fields changed.
 */
export const correctionActions = ["CORRECT_ORGANIZER", "CORRECT_REGISTRATION", "VERIFY_LOCATION"] as const;
export type CorrectionAction = (typeof correctionActions)[number];
export type EditorialAction = "APPROVE" | "REJECT" | "PUBLISH" | "SUSPEND" | CorrectionAction;

export type CorrectionChange =
  | { kind: "ORGANIZER"; organizerId: string }
  | { kind: "REGISTRATION"; registration: OrganizerRegistration }
  | { kind: "REGISTRATION_URI"; registrationUri: string }
  | { kind: "LOCATIONS"; verifiedIndexes: readonly number[] };

export function isCorrectionAction(action: string): action is CorrectionAction {
  return (correctionActions as readonly string[]).includes(action);
}

/** Mirrors the BFF and Engine: reviewers may only approve or reject. */
export function canSubmitAction(role: AdminRole, action: EditorialAction): boolean {
  return role === "admin" || action === "APPROVE" || action === "REJECT";
}

export function commandAction(action: EditorialAction): "APPROVE" | "REJECT" | "PUBLISH" | "SUSPEND" | "CORRECT" {
  return isCorrectionAction(action) ? "CORRECT" : action;
}

/**
 * Builds the complete `correction` from the current snapshot, changing exclusively the confirmed fields.
 * Returns `null` when the change is empty, invalid or would not modify anything.
 * Never marks a location as verified unless its index was explicitly confirmed.
 */
export function buildCorrection(data: EditorialData, change: CorrectionChange): EditorialData | null {
  const correction = structuredClone(data);
  switch (change.kind) {
    case "ORGANIZER":
      if (!change.organizerId || change.organizerId === data.organizerId) return null;
      correction.organizerId = change.organizerId;
      return correction;
    case "REGISTRATION": {
      if (!Object.hasOwn(data, "registration")) return null;
      const registration = { ...change.registration };
      const current = data.registration;
      if (
        current &&
        current.method === registration.method &&
        current.destination === registration.destination &&
        current.evidenceUrl === registration.evidenceUrl &&
        current.organizerPublished === registration.organizerPublished
      )
        return null;
      correction.registration = registration;
      return correction;
    }
    case "REGISTRATION_URI":
      if (Object.hasOwn(data, "registration")) return null;
      if (!change.registrationUri || change.registrationUri === data.registrationUri) return null;
      correction.registrationUri = change.registrationUri;
      return correction;
    case "LOCATIONS": {
      const indexes = new Set(change.verifiedIndexes);
      if (indexes.size === 0) return null;
      for (const index of indexes)
        if (!Number.isInteger(index) || index < 0 || index >= data.locations.length || data.locations[index].verified)
          return null;
      for (const index of indexes) correction.locations[index].verified = true;
      return correction;
    }
  }
}

export function describeLocation(location: EditorialData["locations"][number]): string {
  return (
    [location.municipality, location.neighborhood, location.pointName, location.address].filter(Boolean).join(" · ") ||
    "Por confirmar"
  );
}
