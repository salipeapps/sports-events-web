import { RegistrationAction } from "./RegistrationAction";
import type { PublicOccurrence } from "@/domain/publicCatalog";
import {
  categoryLabel,
  currentPrices,
  languageLabel,
  locationRoleLabels,
  locationText,
  madridShortDate,
  madridStart,
  occurrenceHref,
  orderedLocations,
  priceLabel,
} from "./occurrencePresentation";

export { priceLabel } from "./occurrencePresentation";

export function OccurrenceCard({ occurrence }: { occurrence: PublicOccurrence }) {
  const start = new Date(occurrence.startInstant);
  const prices = currentPrices(occurrence);
  const href = occurrenceHref(occurrence.id);
  return (
    <article className="public-occurrence" aria-labelledby={`activity-${occurrence.id}`}>
      <div className="public-card-top">
        <span>{categoryLabel(occurrence.category)}</span>
        <span className="public-freshness">Próxima</span>
      </div>
      <h3 id={`activity-${occurrence.id}`}>
        <a className="public-card-title" href={href}>
          {occurrence.title}
        </a>
      </h3>
      <p className="public-organizer">{occurrence.organizerName ?? "Organizador por confirmar"}</p>
      <time className="public-start" dateTime={occurrence.startInstant}>
        {madridStart.format(start)} h
      </time>
      <p className="public-timezone">Hora local · Europe/Madrid</p>
      <dl className="public-card-facts">
        {occurrence.locations.length ? (
          orderedLocations(occurrence.locations).map((location, index) => (
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
        <div>
          <dt>Precio</dt>
          <dd>
            {prices.length
              ? prices.map((price, index) => (
                  <span className="public-price-option" key={index}>
                    {priceLabel(price)}
                    {price.conditions && <small>{price.conditions}</small>}
                  </span>
                ))
              : "Precio por confirmar"}
          </dd>
        </div>
        <div>
          <dt>Idioma / nivel</dt>
          <dd>
            {languageLabel(occurrence.activityLanguage)} · {occurrence.level?.es ?? "Nivel por confirmar"}
          </dd>
        </div>
      </dl>
      <div className="public-card-footer">
        {occurrence.lastVerifiedAt && occurrence.verifiedUntil && (
          <small>
            Verificada{" "}
            <time dateTime={occurrence.lastVerifiedAt}>{madridStart.format(new Date(occurrence.lastVerifiedAt))}</time>
            {" · "}Vigente hasta{" "}
            <time dateTime={occurrence.verifiedUntil}>{madridStart.format(new Date(occurrence.verifiedUntil))}</time>
          </small>
        )}
        <small>
          Ficha actualizada{" "}
          <time dateTime={occurrence.updatedAt}>{madridShortDate.format(new Date(occurrence.updatedAt))}</time>
        </small>
        <a href={href} aria-label={`Ver ficha completa: ${occurrence.title}`}>
          Ver ficha completa <span aria-hidden="true">→</span>
        </a>
        {occurrence.sourceUrl && (
          <a href={occurrence.sourceUrl} rel="noreferrer">
            Ver convocatoria
          </a>
        )}
        {occurrence.registration && (
          <RegistrationAction registration={occurrence.registration} title={occurrence.title} />
        )}
        {!occurrence.registration && occurrence.registrationUrl && (
          <a
            href={occurrence.registrationUrl}
            rel="noreferrer"
            aria-label={`Consultar inscripción: ${occurrence.title}`}
          >
            Consultar inscripción <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    </article>
  );
}
