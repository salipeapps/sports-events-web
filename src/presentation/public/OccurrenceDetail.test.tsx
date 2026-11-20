import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicOccurrence } from "@/domain/publicCatalog";
import { OccurrenceCard } from "./OccurrenceCard";
import { OccurrenceDetail, occurrenceStructuredData, serializeStructuredData } from "./OccurrenceDetail";

type Detail = PublicOccurrence & { status: "upcoming" | "in_progress" };
const base: Detail = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "TEST · Excursión a la sierra",
  organizerName: "TEST · Club de montaña",
  startInstant: "2026-10-25T06:30:00Z",
  endInstant: "2026-10-25T14:00:00Z",
  status: "upcoming",
  registrationUrl: null,
  activityLanguage: "es",
  category: "hiking",
  level: { es: "Intermedio", en: null },
  requirements: { es: null, en: null },
  titleTranslations: { es: "TEST · Excursión a la sierra", en: null },
  lastVerifiedAt: "2026-10-20T10:00:00Z",
  verifiedUntil: "2026-10-26T10:00:00Z",
  locations: [
    {
      role: "destination",
      municipality: "Serra",
      neighborhood: null,
      pointName: "TEST · Pico",
      address: null,
      latitude: null,
      longitude: null,
    },
    {
      role: "departure",
      municipality: "València",
      neighborhood: "Benimaclet",
      pointName: "TEST · Plaza",
      address: null,
      latitude: null,
      longitude: null,
    },
  ],
  prices: [],
  updatedAt: "2026-10-20T10:00:00Z",
};

describe("public occurrence detail (#52)", () => {
  // 25/10/2026 is the autumn DST change in Madrid: 06:30Z is 07:30 CET, not 08:30.
  it("shows Madrid interval on the DST day, salida before destino and honest unknowns", () => {
    const html = renderToStaticMarkup(<OccurrenceDetail occurrence={base} />);
    for (const text of [
      "07:30",
      "15:00",
      "Europe/Madrid",
      "Senderismo",
      "Intermedio",
      "Español",
      "Precio por confirmar",
      "no significa que sea gratuita",
      "Requisitos por confirmar",
      "El destino de la excursión no es el punto de encuentro",
      "no reserva plazas",
    ])
      expect(html).toContain(text);
    expect(html.indexOf("Salida")).toBeLessThan(html.indexOf("Destino"));
    expect(html).toContain("El organizador no ha publicado una vía de inscripción verificada.");
    expect(html).not.toMatch(/Reservar|Gratis|plazas disponibles/);
    expect(html).not.toContain("href=");
  });
  it("labels a v1 HTTPS link as a consultation, never as a booking", () => {
    const html = renderToStaticMarkup(
      <OccurrenceDetail occurrence={{ ...base, registrationUrl: "https://example.org/inscripcion" }} />,
    );
    expect(html).toContain('href="https://example.org/inscripcion"');
    expect(html).toContain("Consultar inscripción");
    expect(html).not.toContain("Reservar");
  });
  it("renders v2 phone/email channels and the organiser source separately", () => {
    const html = renderToStaticMarkup(
      <OccurrenceDetail
        occurrence={{
          ...base,
          sourceUrl: "https://example.org/convocatoria",
          registration: { method: "EMAIL", destination: "reservas@example.org", action: "COMPOSE_EMAIL" },
        }}
      />,
    );
    expect(html).toContain('href="mailto:reservas@example.org"');
    expect(html).toContain('href="https://example.org/convocatoria"');
    expect(html).toContain("Ver convocatoria original del organizador");
  });
  it("shows in-progress, transport and same-day end correctly", () => {
    const html = renderToStaticMarkup(
      <OccurrenceDetail
        occurrence={{
          ...base,
          status: "in_progress",
          prices: [
            {
              type: "fixed",
              scope: "per_session",
              amount: 12,
              currency: "EUR",
              conditions: null,
              validFrom: null,
              validTo: null,
              transportCost: "included",
            },
          ],
        }}
      />,
    );
    expect(html).toContain("En curso");
    expect(html).toContain("12,00");
    expect(html).toContain("Transporte incluido");
  });
  it("clarifies WhatsApp meeting-point details in card and detail without inventing an address", () => {
    const approximate: Detail = {
      ...base,
      title: "Yoga y cuencos tibetanos",
      registration: { method: "WHATSAPP", destination: "+34627546891", action: "COPY_NUMBER" },
      locations: [
        {
          role: "activity",
          municipality: "València",
          neighborhood: null,
          pointName: "Jardín del Turia · Tramo VIII",
          address: null,
          latitude: null,
          longitude: null,
        },
      ],
    };
    const reminder = "Confirma con el organizador por WhatsApp el punto de encuentro exacto antes de acudir.";
    const detail = renderToStaticMarkup(<OccurrenceDetail occurrence={approximate} />);
    const card = renderToStaticMarkup(<OccurrenceCard occurrence={approximate} />);

    expect(detail).toContain("Jardín del Turia");
    expect(card).toContain("Jardín del Turia");
    expect(detail).toContain(reminder);
    expect(card).toContain(reminder);
    expect(detail).not.toContain("dirección exacta verificada");
    expect(card).not.toContain("dirección exacta verificada");

    const email: Detail = {
      ...approximate,
      registration: { method: "EMAIL", destination: "info@example.org", action: "COMPOSE_EMAIL" },
    };
    expect(renderToStaticMarkup(<OccurrenceDetail occurrence={email} />)).not.toContain(reminder);
    expect(renderToStaticMarkup(<OccurrenceCard occurrence={email} />)).not.toContain(reminder);

    const withStreet: Detail = {
      ...approximate,
      locations: [{ ...approximate.locations[0], address: "Calle de ejemplo, 1" }],
    };
    expect(renderToStaticMarkup(<OccurrenceDetail occurrence={withStreet} />)).not.toContain(reminder);
    expect(renderToStaticMarkup(<OccurrenceCard occurrence={withStreet} />)).not.toContain(reminder);
  });

  it("builds structured data without offers or availability and escapes markup", () => {
    const data = occurrenceStructuredData({ ...base, title: "TEST </script><b>" });
    expect(data).not.toHaveProperty("offers");
    expect(JSON.stringify(data)).not.toMatch(/availability|InStock|remaining/i);
    expect(data).toMatchObject({
      "@type": "Event",
      startDate: base.startInstant,
      location: { name: "TEST · Plaza", address: { addressLocality: "València" } },
      organizer: { name: "TEST · Club de montaña" },
    });
    const serialized = serializeStructuredData(data);
    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized).name).toBe("TEST </script><b>");
  });
});
