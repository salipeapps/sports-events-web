import type { CatalogResult } from "@/domain/publicCatalog";
import Link from "next/link";
import { catalogHref, type CatalogSelection } from "./catalogQuery";
import { OccurrenceCard } from "./OccurrenceCard";

export function PublicHome({
  result,
  selection,
  demo = false,
}: {
  result: CatalogResult | { status: "loading" };
  selection: CatalogSelection | null;
  demo?: boolean;
}) {
  const calendarMonth = selection?.month ?? selection?.currentMonth ?? null;
  const nextPage =
    result.status === "ready" && selection
      ? result.nextCursor
        ? catalogHref(selection.month, result.nextCursor, selection.at, selection.tail)
        : selection.hasTail && !selection.tail
          ? catalogHref(selection.month, null, selection.at, true)
          : null
      : null;
  return (
    <div className="public-catalog">
      <a className="public-skip" href="#activities">
        Saltar a las actividades
      </a>
      <header className="public-header">
        <Link className="public-brand" href="/" prefetch={false} aria-label="Sports Events, inicio">
          <span aria-hidden="true" className="public-brand-mark">
            ↗
          </span>{" "}
          Sports Events
        </Link>
        <span className="public-header-note">Deporte para participar</span>
      </header>
      <main>
        <section className="public-hero" aria-labelledby="public-title">
          <div className="public-hero-inner">
            <p className="public-eyebrow">Valencia y alrededores · Agenda deportiva</p>
            <h1 id="public-title">
              Tu próximo plan
              <br />
              empieza aquí.
            </h1>
            <p>
              Encuentra actividades deportivas a las que puedes apuntarte. Compara horarios, lugares y precios, y elige
              cómo moverte.
            </p>
            <a className="public-primary-link" href="#activities">
              Explorar actividades <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="public-hero-aside" aria-hidden="true">
            <span>
              Sal.
              <br />
              Muévete.
              <br />
              Comparte.
            </span>
            <span className="public-hero-orbit" />
          </div>
        </section>
        <section className="public-listing" id="activities" aria-labelledby="activities-title" tabIndex={-1}>
          {demo && (
            <p className="public-demo" role="status">
              Datos de prueba locales · No son actividades reales.
            </p>
          )}
          <div className="public-list-heading">
            <div>
              <p className="public-eyebrow">Tu agenda, a tu ritmo</p>
              <h2 id="activities-title">{selection?.label ?? "Actividades deportivas"}</h2>
            </div>
            <nav className="public-tabs" aria-label="Periodo del catálogo">
              <a href={catalogHref(null)} aria-current={selection && !selection.month ? "page" : undefined}>
                Próximos 7 días
              </a>
              <a href={catalogHref(calendarMonth)} aria-current={selection?.month ? "page" : undefined}>
                Calendario completo
              </a>
            </nav>
          </div>
          {selection?.month && (
            <nav className="public-month-nav" aria-label="Mes del calendario">
              {selection.previousMonth ? <a href={catalogHref(selection.previousMonth)}>← Mes anterior</a> : <span />}
              <form method="get" action="/#activities">
                <label htmlFor="catalog-month">Elegir mes</label>
                <input
                  id="catalog-month"
                  name="month"
                  type="month"
                  defaultValue={selection.month}
                  min={selection.currentMonth}
                  max="2099-12"
                  required
                />
                <button type="submit">Ver mes</button>
              </form>
              {selection.nextMonth && <a href={catalogHref(selection.nextMonth)}>Mes siguiente →</a>}
            </nav>
          )}
          {result.status === "loading" ? (
            <div className="public-empty" role="status" aria-busy="true">
              <span aria-hidden="true">○</span>
              <h3>Consultando las próximas actividades</h3>
              <p>Estamos cargando el calendario. Enseguida podrás consultar las actividades publicadas.</p>
            </div>
          ) : result.status === "ready" ? (
            <>
              <p className="public-result-note">
                {result.items.length}{" "}
                {result.items.length === 1 ? "actividad en esta página" : "actividades en esta página"} · Ordenadas por
                inicio
              </p>
              {result.items.length ? (
                <div className="public-cards">
                  {result.items.map((item) => (
                    <OccurrenceCard key={item.id} occurrence={item} />
                  ))}
                </div>
              ) : (
                <div className="public-empty" role="status">
                  <span aria-hidden="true">○</span>
                  <h3>
                    {selection?.query.cursor || selection?.tail
                      ? "No hay actividades publicadas en esta página"
                      : "No hay actividades publicadas para estas fechas"}
                  </h3>
                  <p>
                    {selection?.query.cursor || selection?.tail
                      ? "Puedes volver al inicio del periodo para consultar la agenda actualizada."
                      : "Estamos actualizando el calendario. Puedes consultar otras fechas para encontrar actividades publicadas."}
                  </p>
                </div>
              )}
              <nav className="public-pagination" aria-label="Paginación de actividades">
                {(selection?.query.cursor || selection?.tail) && (
                  <a href={catalogHref(selection.month)}>Volver al inicio del periodo</a>
                )}
                {nextPage && <a href={nextPage}>Ver más actividades →</a>}
              </nav>
            </>
          ) : (
            <div className="public-empty" role="status">
              <span aria-hidden="true">○</span>
              <h3>
                {result.status === "invalid"
                  ? "No podemos mostrar esta búsqueda"
                  : "El catálogo no está disponible ahora"}
              </h3>
              <p>
                {result.status === "invalid"
                  ? "El periodo o la página no son válidos. Vuelve al inicio de la agenda para consultar las próximas actividades."
                  : "Vuelve a consultar la agenda más adelante para ver actividades confirmadas."}
              </p>
              <a href={result.status === "invalid" ? catalogHref(null) : catalogHref(selection?.month ?? null)}>
                {result.status === "invalid" ? "Ver próximas actividades" : "Volver a consultar"}
              </a>
            </div>
          )}
        </section>
      </main>
      <footer className="public-footer">
        <strong>Sports Events</strong>
        <span>Valencia y alrededores · Horarios en Europe/Madrid</span>
      </footer>
    </div>
  );
}
