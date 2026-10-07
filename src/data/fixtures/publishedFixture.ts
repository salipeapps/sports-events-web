import { known, unknown, type PublishedOccurrence } from "@/domain/admin";
import { eventDetails, leTarotExtracted, systemActor } from "./candidateFixtureBase";

export const publishedOccurrenceFixtures: PublishedOccurrence[] = [
  {
    id: "pub-fixture-E023-web-1900",
    sourceRecordIds: ["E023"],
    organizerId: "O022",
    editorialStatus: "published",
    temporalStatus: "upcoming",
    publishedAt: "2026-10-05T13:00:00.000Z",
    lastCheckedAt: "2026-10-05T12:00:00.000Z",
    event: eventDetails({
      ...leTarotExtracted,
      startLocal: known("2026-10-07T19:00:00"),
      endLocal: unknown("not_observed"),
    }),
    evidenceIds: ["ev-E023-website"],
    protectedCorrections: [],
    history: [
      {
        id: "hist-pub-E023",
        action: "published",
        at: "2026-10-05T13:00:00.000Z",
        actor: systemActor,
        reason: known("Fixture-only published snapshot used to exercise change-proposal contracts."),
      },
    ],
  },
];
