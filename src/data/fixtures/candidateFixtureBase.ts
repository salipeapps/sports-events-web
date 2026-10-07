import {
  known,
  unknown,
  type EventDetails,
} from "@/domain/admin";

export const systemActor = { id: "fixture-import", role: "system", displayName: "Dataset v0.1 import" } as const;

export const unknownDescription = unknown<string>("not_observed", "The research dataset does not provide a normalized description.");
export const unknownDeparture = unknown<string>("not_applicable");
export const unknownDestination = unknown<string>("not_applicable");
export const unknownLanguage = unknown<string[]>("not_verified", "The observed text does not confirm the actual session language.");
export const unknownLevel = unknown<string>("not_verified");

export function eventDetails(overrides: Partial<EventDetails>): EventDetails {
  return {
    title: unknown("not_observed"),
    description: unknownDescription,
    category: unknown("not_observed"),
    startLocal: unknown("not_observed"),
    endLocal: unknown("not_observed"),
    timezone: known("Europe/Madrid"),
    location: unknown("not_observed"),
    departureCity: unknownDeparture,
    destination: unknownDestination,
    organizerId: unknown("not_observed"),
    price: unknown("not_observed"),
    languages: unknownLanguage,
    level: unknownLevel,
    registrationUrl: unknown("not_observed"),
    individualAccess: unknown("not_verified"),
    ...overrides,
  };
}

export const buenoTournamentExtracted = eventDetails({
  title: known("Bueno Beach Volleyball Tournament"),
  category: known("beach_sports"),
  startLocal: known("2026-10-24T16:00:00"),
  endLocal: known("2026-10-24T19:00:00"),
  location: known("Playa de las Arenas"),
  organizerId: known("O017"),
  price: known({
    kind: "fixed",
    options: [{ amount: 12, currency: "EUR" }],
    perSessionComparable: true,
  }),
  level: known("all"),
  registrationUrl: known("https://docs.google.com/forms/d/e/1FAIpQLSdETKAEIpVLo2aNgOMqV4xoxFSKEiEy34UY5W4E13hZ73C2bQ/viewform"),
  individualAccess: known(true),
});

export const lasArenasExtracted = eventDetails({
  title: known("Volley training Las Arenas"),
  category: known("beach_sports"),
  startLocal: known("2026-10-06T18:30:00"),
  endLocal: known("2026-10-06T20:30:00"),
  location: known("Playa de las Arenas, Monument Antoni Ferrandis"),
  organizerId: known("O033"),
  price: known({
    kind: "payment_variant",
    options: [
      { amount: 8, currency: "EUR", paymentMethod: "cash" },
      { amount: 9, currency: "EUR", paymentMethod: "Bizum" },
    ],
    perSessionComparable: true,
    note: "Payment method changes the price; this is one session, not two events.",
  }),
  registrationUrl: known("https://www.lasarenasvolley.es/"),
  individualAccess: known(true),
});

export const leTarotExtracted = eventDetails({
  title: known("Tarot Yoga afternoon"),
  category: known("yoga"),
  startLocal: known("2026-10-07T18:30:00"),
  endLocal: known("2026-10-07T19:30:00"),
  location: known("Turia, Alameda / Pont del Real"),
  organizerId: known("O022"),
  price: known({
    kind: "fixed",
    options: [{ amount: 10, currency: "EUR", paymentMethod: "cash" }],
    perSessionComparable: true,
  }),
  languages: known(["EN"]),
  level: known("all"),
  registrationUrl: known("https://www.meetup.com/es-es/le-tarot-yoga-vlc-yoga-community/"),
  individualAccess: known(true),
});

export const leTarotFinal = eventDetails({
  ...leTarotExtracted,
  startLocal: unknown("conflict", "Website says Wednesday 19:00 while Meetup says 18:30."),
  endLocal: unknown("conflict"),
});

export const penyagolosaExtracted = eventDetails({
  title: known("Ascent Penyagolosa"),
  category: known("hiking"),
  startLocal: known("2026-10-11T08:30:00"),
  endLocal: unknown("not_observed"),
  location: known("Parking Mestalla (salida)"),
  departureCity: known("Valencia"),
  destination: known("Ascent Penyagolosa"),
  organizerId: known("O036"),
  price: known({
    kind: "transport_included",
    options: [
      { amount: 54, currency: "EUR", label: "with transport" },
      { amount: 18, currency: "EUR", label: "hike only", condition: "without transport" },
    ],
    perSessionComparable: false,
  }),
  registrationUrl: known("https://valenciamountainenthusiasts.com/day-hikes/"),
  individualAccess: known(true),
});

export const penyagolosaFinal = eventDetails({
  ...penyagolosaExtracted,
  price: unknown("conflict", "Summary shows 49 EUR while description shows 54 EUR with transport; 18 EUR is a distinct hike-only modality."),
});

export const cyclingAnnouncement = eventDetails({
  title: known("Cicloturismo social"),
  category: known("cycling"),
  organizerId: known("O053"),
  startLocal: unknown("not_observed", "The source explicitly says to ignore the header date/time; it is a community announcement."),
  endLocal: unknown("not_observed"),
  location: unknown("not_observed"),
  registrationUrl: known("https://www.amigosvalencia.com/evento/grupo-de-cicloturismo-social-valencia/22134"),
  individualAccess: unknown("not_verified"),
});
