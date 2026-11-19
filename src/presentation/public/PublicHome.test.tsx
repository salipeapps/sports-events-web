import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicOccurrence } from "@/domain/publicCatalog";
import { selectCatalog } from "./catalogQuery";
import { PublicHome } from "./PublicHome";
import { OccurrenceCard } from "./OccurrenceCard";

const item: PublicOccurrence = {
  id: "test-occurrence",
  title: "TEST · Salida deportiva",
  organizerName: "TEST · Club local",
  startInstant: "2026-10-25T08:00:00Z",
  endInstant: null,
  registrationUrl: null,
  activityLanguage: null,
  category: null,
  level: null,
  locations: [
    {
      role: "departure",
      municipality: "Alboraia",
      neighborhood: "Patacona",
      pointName: null,
      address: null,
      latitude: null,
      longitude: null,
    },
  ],
  prices: [],
  updatedAt: "2026-10-20T10:00:00Z",
};
const selection = selectCatalog({}, new Date("2026-10-22T10:00:00Z"))!;

describe("public cards and availability", () => {
  it("renders Madrid local time, departure municipality and honest unknowns", () => {
    const html = renderToStaticMarkup(<OccurrenceCard occurrence={item} />);
    for (const text of [
      "09:00",
      "Europe/Madrid",
      "Salida",
      "Patacona",
      "Alboraia",
      "Precio por confirmar",
      "Idioma por confirmar",
      "Nivel por confirmar",
      "Categoría por confirmar",
      "Próxima",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("Gratis");
    // Only the internal detail page is linked: no registration or external link is invented.
    expect(new Set(html.match(/href="[^"]*"/g))).toEqual(new Set(['href="/actividades/test-occurrence"']));
    expect(html).not.toContain("Verificada");
  });
  it("keeps monthly, per-session, free and unknown prices distinct", () => {
    const html = renderToStaticMarkup(
      <OccurrenceCard
        occurrence={{
          ...item,
          prices: [
            {
              type: "subscription",
              scope: "per_month",
              amount: 25,
              currency: "EUR",
              conditions: "Solo socios",
              validFrom: null,
              validTo: null,
              transportCost: "unknown",
            },
            {
              type: "from",
              scope: "per_session",
              amount: 8,
              currency: "EUR",
              conditions: null,
              validFrom: null,
              validTo: null,
              transportCost: "unknown",
            },
            {
              type: "free",
              scope: "per_session",
              amount: null,
              currency: null,
              conditions: null,
              validFrom: null,
              validTo: null,
              transportCost: "unknown",
            },
            {
              type: "unknown",
              scope: "unknown",
              amount: null,
              currency: null,
              conditions: null,
              validFrom: null,
              validTo: null,
              transportCost: "unknown",
            },
            {
              type: "donation",
              scope: "per_session",
              amount: null,
              currency: null,
              conditions: null,
              validFrom: null,
              validTo: null,
              transportCost: "unknown",
            },
          ],
        }}
      />,
    );
    for (const text of [
      "al mes",
      "por sesión",
      "Desde",
      "Gratis",
      "Precio por confirmar",
      "Solo socios",
      "Suscripción",
      "Donación voluntaria",
    ])
      expect(html).toContain(text);
  });
  it("renders an empty successful catalogue without demo inventory or fake links", () => {
    const html = renderToStaticMarkup(
      <PublicHome selection={selection} result={{ status: "ready", items: [], nextCursor: null }} />,
    );
    expect(html).toContain("0 actividades en esta página");
    expect(html).toContain("No hay actividades publicadas");
    expect(html).not.toContain("TEST");
    expect(html).not.toContain("Consultar inscripción");
    expect(html).not.toContain("Ver más actividades");
  });
  it("shows loading without claiming there are zero events or a service failure", () => {
    const html = renderToStaticMarkup(<PublicHome selection={null} result={{ status: "loading" }} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Consultando las próximas actividades");
    expect(html).not.toContain("0 actividades");
    expect(html).not.toContain("No hay actividades");
    expect(html).not.toContain("no está disponible");
    // Route-level loading has no searchParams yet. Do not expose links without
    // the visitor's existing filters: clicking one would silently clear them.
    expect(html).not.toContain('aria-label="Periodo del catálogo"');
    expect(html).not.toContain("periodo=hoy");
  });
  it("offers a fresh period request after an upstream failure", () => {
    const html = renderToStaticMarkup(<PublicHome selection={selection} result={{ status: "unavailable" }} />);
    expect(html).toContain("Volver a consultar");
    expect(html).not.toContain("cursor=");
    expect(html).not.toContain("at=");
  });
  it("uses the Madrid activity date for price validity across midnight and DST", () => {
    const option = {
      type: "free",
      scope: "per_session",
      amount: null,
      currency: null,
      conditions: null,
      validFrom: "2026-10-26",
      validTo: "2026-10-26",
      transportCost: "not_applicable",
    } as const;
    const html = renderToStaticMarkup(
      <OccurrenceCard occurrence={{ ...item, startInstant: "2026-10-25T23:30:00Z", prices: [option] }} />,
    );
    expect(html).toContain("00:30");
    expect(html).toContain("Gratis");
    const expired = renderToStaticMarkup(
      <OccurrenceCard occurrence={{ ...item, startInstant: "2026-10-26T23:30:00Z", prices: [option] }} />,
    );
    expect(expired).toContain("Precio por confirmar");
    expect(expired).not.toContain("Gratis");
  });
  it("displays the actual verification separately from the source update", () => {
    const html = renderToStaticMarkup(
      <OccurrenceCard
        occurrence={{ ...item, lastVerifiedAt: "2026-10-24T10:00:00Z", verifiedUntil: "2026-10-25T10:00:00Z" }}
      />,
    );
    expect(html).toContain("Verificada");
    expect(html).toContain("Vigente hasta");
    expect(html).toContain('dateTime="2026-10-24T10:00:00Z"');
    expect(html).toContain('dateTime="2026-10-20T10:00:00Z"');
  });
  it.each(["disabled", "unavailable", "invalid"] as const)("does not disguise %s as an empty database", (status) => {
    const html = renderToStaticMarkup(<PublicHome selection={selection} result={{ status }} />);
    expect(html).not.toContain("0 actividades");
    expect(html).not.toContain("No hay actividades publicadas");
  });
  it("labels local test inventory and carries the range in pagination links", () => {
    const html = renderToStaticMarkup(
      <PublicHome selection={selection} demo result={{ status: "ready", items: [item], nextCursor: "page_2" }} />,
    );
    expect(html).toContain("No son actividades reales");
    expect(html).toContain("cursor=page_2");
    expect(html).toContain("at=2026-10-22T10%3A00%3A00.000Z");
  });
  it("provides a continuation for the extra DST day even without an RPC cursor", () => {
    const month = selectCatalog({ month: "2026-10" }, new Date("2026-09-15T10:00:00Z"))!;
    const html = renderToStaticMarkup(
      <PublicHome selection={month} result={{ status: "ready", items: [], nextCursor: null }} />,
    );
    expect(html).toContain("tail=1");
    expect(html).toContain("Ver más actividades");
  });
});
