import type { PublicOccurrence, PublicPrice } from "@/domain/publicCatalog";

const startFormatter = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short" });
const scopes = { session: "por sesión", month: "al mes", year: "al año", unknown: "periodicidad por confirmar" };

export function priceLabel(price: PublicPrice): string {
  if (price.type === "unknown") return "Precio por confirmar";
  if (price.type === "free") return `Gratis · ${scopes[price.scope]}`;
  const amount = new Intl.NumberFormat("es-ES", { style: "currency", currency: price.currency ?? "EUR" }).format(
    price.amount ?? 0,
  );
  return `${price.type === "from" ? "Desde " : ""}${amount} · ${scopes[price.scope]}`;
}

export function OccurrenceCard({ occurrence }: { occurrence: PublicOccurrence }) {
  const start = new Date(occurrence.startInstant);
  const language = occurrence.activityLanguage
    ? ({ es: "Español", en: "Inglés", ca: "Valenciano" }[occurrence.activityLanguage] ?? occurrence.activityLanguage)
    : "Idioma por confirmar";
  return (
    <article className="public-occurrence" aria-labelledby={`activity-${occurrence.id}`}>
      <div className="public-card-top">
        <span>{occurrence.category ?? "Categoría por confirmar"}</span>
        <span className="public-freshness">Próxima</span>
      </div>
      <h3 id={`activity-${occurrence.id}`}>{occurrence.title}</h3>
      <p className="public-organizer">{occurrence.organizerName ?? "Organizador por confirmar"}</p>
      <time className="public-start" dateTime={occurrence.startInstant}>
        {startFormatter.format(start)} h
      </time>
      <p className="public-timezone">Hora local · Europe/Madrid</p>
      <dl className="public-card-facts">
        {occurrence.locations.length ? (
          occurrence.locations.map((location, index) => (
            <div key={index}>
              <dt>{{ venue: "Lugar", departure: "Salida", destination: "Destino" }[location.role]}</dt>
              <dd>
                {[location.pointName, location.address, location.neighborhood, location.municipality]
                  .filter(Boolean)
                  .join(" · ") || "Lugar por confirmar"}
              </dd>
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
            {occurrence.prices.length
              ? occurrence.prices.map((price, index) => (
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
            {language} · {occurrence.level ?? "Nivel por confirmar"}
          </dd>
        </div>
      </dl>
      <div className="public-card-footer">
        <small>
          Ficha actualizada{" "}
          <time dateTime={occurrence.updatedAt}>{dateFormatter.format(new Date(occurrence.updatedAt))}</time>
        </small>
        {occurrence.registrationUrl && (
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
