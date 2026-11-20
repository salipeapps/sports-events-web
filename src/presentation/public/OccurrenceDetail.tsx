import { RegistrationAction } from "./RegistrationAction";
import type { PublicOccurrence } from "@/domain/publicCatalog";
import {
  categoryLabel,
  currentPrices,
  languageLabel,
  locationRoleLabels,
  locationText,
  needsWhatsAppMeetingPointConfirmation,
  whatsAppMeetingPointReminder,
  madridShortDate,
  madridStart,
  madridTime,
  orderedLocations,
  priceLabel,
  sameMadridDay,
  transportLabel,
} from "./occurrencePresentation";

type DetailOccurrence = PublicOccurrence & { status: "upcoming" | "in_progress" };

/**
 * schema.org Event built only from verified public fields. It deliberately omits `offers`,
 * availability and capacity: the catalogue never knows or promises real-time places.
 */
export function occurrenceStructuredData(occurrence: DetailOccurrence) {
  const place = orderedLocations(occurrence.locations).find((location) => location.role !== "destination");
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: occurrence.title,
    startDate: occurrence.startInstant,
    ...(occurrence.endInstant ? { endDate: occurrence.endInstant } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(place
      ? {
          location: {
            "@type": "Place",
            name: place.pointName ?? place.municipality ?? locationText(place),
            address: {
              "@type": "PostalAddress",
              ...(place.address ? { streetAddress: place.address } : {}),
              ...(place.municipality ? { addressLocality: place.municipality } : {}),
              addressCountry: "ES",
            },
          },
        }
      : {}),
    ...(occurrence.organizerName ? { organizer: { "@type": "Organization", name: occurrence.organizerName } } : {}),
  };
}

/** JSON inside <script> must not be able to close the element or start markup. */
export function serializeStructuredData(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function Schedule({ occurrence }: { occurrence: DetailOccurrence }) {
  const start = madridStart.format(new Date(occurrence.startInstant));
  if (!occurrence.endInstant) return <>{start} h · Hora de fin por confirmar</>;
  const end = sameMadridDay(occurrence.startInstant, occurrence.endInstant)
    ? madridTime.format(new Date(occurrence.endInstant))
    : madridStart.format(new Date(occurrence.endInstant));
  return (
    <>
      <time dateTime={occurrence.startInstant}>{start}</time> – <time dateTime={occurrence.endInstant}>{end}</time> h
    </>
  );
}

function Registration({ occurrence }: { occurrence: DetailOccurrence }) {
  if (occurrence.registration)
    return <RegistrationAction registration={occurrence.registration} title={occurrence.title} />;
  if (occurrence.registrationUrl)
    return (
      <a href={occurrence.registrationUrl} rel="noreferrer" aria-label={`Consultar inscripción: ${occurrence.title}`}>
        Consultar inscripción <span aria-hidden="true">↗</span>
      </a>
    );
  return <p>El organizador no ha publicado una vía de inscripción verificada.</p>;
}

export function OccurrenceDetail({ occurrence }: { occurrence: DetailOccurrence }) {
  const prices = currentPrices(occurrence);
  const locations = orderedLocations(occurrence.locations);
  const excursion = locations.some((location) => location.role === "destination");
  const english = occurrence.titleTranslations?.en;
  return (
    <article className="public-detail" aria-labelledby="occurrence-title">
      <div className="public-card-top">
        <span>{categoryLabel(occurrence.category)}</span>
        <span className="public-freshness">{occurrence.status === "in_progress" ? "En curso" : "Próxima"}</span>
      </div>
      <h1 id="occurrence-title">{occurrence.title}</h1>
      {english && english !== occurrence.title && (
        <p className="public-detail-translation">
          Título en inglés: <span lang="en">{english}</span>
        </p>
      )}
      <p className="public-organizer">Organiza: {occurrence.organizerName ?? "Organizador por confirmar"}</p>

      <dl className="public-detail-facts">
        <div>
          <dt>Cuándo</dt>
          <dd>
            <Schedule occurrence={occurrence} />
            <small>Hora local · Europe/Madrid</small>
          </dd>
        </div>
        {locations.length ? (
          locations.map((location, index) => (
            <div key={index}>
              <dt>{locationRoleLabels[location.role]}</dt>
              <dd>{locationText(location)}</dd>
            </div>
          ))
        ) : (
          <div>
            <dt>Lugar</dt>
            <dd>Lugar por confirmar</dd>
          </div>
        )}
        {excursion && (
          <div>
            <dt>Salida y destino</dt>
            <dd>El destino de la excursión no es el punto de encuentro: acude a la salida indicada.</dd>
          </div>
        )}
        {needsWhatsAppMeetingPointConfirmation(occurrence) && (
          <div>
            <dt>Punto de encuentro</dt>
            <dd>{whatsAppMeetingPointReminder}</dd>
          </div>
        )}
        <div>
          <dt>Precio</dt>
          <dd>
            {prices.length ? (
              prices.map((price, index) => (
                <span className="public-price-option" key={index}>
                  {priceLabel(price)}
                  {transportLabel(price) && <small>{transportLabel(price)}</small>}
                  {price.conditions && <small>{price.conditions}</small>}
                </span>
              ))
            ) : (
              <>
                Precio por confirmar
                <small>Sin precio publicado no significa que sea gratuita.</small>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Idioma de la actividad</dt>
          <dd>{languageLabel(occurrence.activityLanguage)}</dd>
        </div>
        <div>
          <dt>Nivel</dt>
          <dd>{occurrence.level?.es ?? "Nivel por confirmar"}</dd>
        </div>
        <div>
          <dt>Requisitos</dt>
          <dd>{occurrence.requirements?.es ?? "Requisitos por confirmar con el organizador"}</dd>
        </div>
      </dl>

      <section className="public-detail-section" aria-labelledby="registration-title">
        <h2 id="registration-title">Inscripción</h2>
        <Registration occurrence={occurrence} />
        <p className="public-detail-note">
          La inscripción se gestiona directamente con el organizador. Esta agenda no reserva plazas, no conoce la
          disponibilidad y no confirma inscripciones.
        </p>
      </section>

      <section className="public-detail-section" aria-labelledby="provenance-title">
        <h2 id="provenance-title">Procedencia</h2>
        <p>
          {occurrence.lastVerifiedAt && occurrence.verifiedUntil && (
            <>
              Verificada{" "}
              <time dateTime={occurrence.lastVerifiedAt}>
                {madridStart.format(new Date(occurrence.lastVerifiedAt))}
              </time>
              {" · "}Vigente hasta{" "}
              <time dateTime={occurrence.verifiedUntil}>{madridStart.format(new Date(occurrence.verifiedUntil))}</time>
              {" · "}
            </>
          )}
          Ficha actualizada{" "}
          <time dateTime={occurrence.updatedAt}>{madridShortDate.format(new Date(occurrence.updatedAt))}</time>
        </p>
        {occurrence.sourceUrl && (
          <a href={occurrence.sourceUrl} rel="noreferrer">
            Ver convocatoria original del organizador <span aria-hidden="true">↗</span>
          </a>
        )}
      </section>
    </article>
  );
}
