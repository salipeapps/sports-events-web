/** Private, allowlisted inspection contract. Never used by the public catalogue. */
export interface EditorialData {
  title: string;
  organizerId: string | null;
  schedule: {
    localStart: string;
    localEnd: string | null;
    zoneId: "Europe/Madrid";
    startInstant: string | null;
    endInstant: string | null;
  } | null;
  calendarDates: { startDate: string; endDate: string | null; precision: "DATE_ONLY" | "ALL_DAY" } | null;
  locations: {
    role: string;
    municipality: string | null;
    neighborhood: string | null;
    pointName: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    verified: boolean;
  }[];
  priceOptions: {
    type: string;
    scope: string;
    money: { amount: number; currency: string } | null;
    conditions: string | null;
    validFrom: string | null;
    validTo: string | null;
    transportCost: string;
  }[];
  registrationUri: string | null;
  registration?: import("./registration").OrganizerRegistration | null;
  activityLanguage: string | null;
}

export interface EditorialInspection {
  candidateId: string;
  candidateVersion: number;
  revision: number;
  status: string;
  title: string;
  data: EditorialData;
  /** Exact Engine values to start a CORRECT from; `null` when they cannot be preserved safely. */
  correctionBase: EditorialData | null;
  organizerName: string | null;
  organizers: { id: string; name: string }[];
  moreOrganizers: boolean;
  source: { id: string; name: string; url: string | null; observedAt: string };
  publicationId: string | null;
  publicationStatus: string | null;
  registrationSupported?: boolean;
  conflictCount: number;
  moreConflicts: boolean;
  conflicts: { id: string; fieldPath: string; sourceUrl: string | null; observedAt: string }[];
}
