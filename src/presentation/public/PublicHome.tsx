import type { CatalogResult } from "@/domain/publicCatalog";
import {
  catalogCategories,
  catalogHref,
  catalogLanguages,
  emptyFilters,
  hasFilters,
  type CatalogFilters,
  type CatalogScope,
  type CatalogSelection,
} from "./catalogQuery";
import { CleanGetForm } from "./CleanGetForm";
import { OccurrenceCard } from "./OccurrenceCard";
import { PublicFooter, PublicHeader } from "./PublicChrome";
import { categoryLabel, languageLabel } from "./occurrencePresentation";

const priceFilterLabels = {
  sesion: "Con precio por sesión publicado (EUR)",
  "sin-sesion": "Sin precio por sesión publicado",
};

function activeFilterLabels(filters: CatalogFilters): string[] {
  return [
    filters.categoria && categoryLabel(filters.categoria),
    filters.municipio && `Municipio: ${filters.municipio}`,
    filters.idioma && `Idioma: ${languageLabel(filters.idioma)}`,
    filters.precio && priceFilterLabels[filters.precio],
  ].filter((label): label is string => Boolean(label));
}

function FilterForm({ selection }: { selection: CatalogSelection }) {
  const { filters } = selection;
  const active = activeFilterLabels(filters).length;
  // Collapsed on phones so results start on the first screen; always expanded on wider screens (catalog.css).
  return (
    <details className="public-filter-panel">
      <summary>
        Filtrar actividades
        {active > 0 && <span className="public-filter-count">{active === 1 ? "1 activo" : `${active} activos`}</span>}
      </summary>
      <FilterFields selection={selection} />
    </details>
  );
}

function FilterFields({ selection }: { selection: CatalogSelection }) {
  const { filters } = selection;
  return (
    <CleanGetForm className="public-filters" action="/#activities" aria-label="Filtrar actividades">
      {selection.month && <input type="hidden" name="month" value={selection.month} />}
      {selection.period && <input type="hidden" name="periodo" value={selection.period} />}
      <div>
        <label htmlFor="filter-category">Categoría</label>
        <select id="filter-category" name="categoria" defaultValue={filters.categoria ?? ""}>
          <option value="">Todas</option>
          {catalogCategories.map((category) => (
            <option key={category} value={category}>
              {categoryLabel(category)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="filter-municipality">Municipio</label>
        <input
          id="filter-municipality"
          name="municipio"
          type="text"
          maxLength={100}
          defaultValue={filters.municipio ?? ""}
          placeholder="Ej.: València"
          aria-describedby="filter-municipality-hint"
          autoComplete="off"
        />
        <small id="filter-municipality-hint">
          Nombre exacto, tal como aparece en las fichas. Incluye lugar, salida o punto de encuentro, no el destino.
        </small>
      </div>
      <div>
        <label htmlFor="filter-language">Idioma de la actividad</label>
        <select id="filter-language" name="idioma" defaultValue={filters.idioma ?? ""}>
          <option value="">Cualquiera</option>
          {catalogLanguages.map((language) => (
            <option key={language} value={language}>
              {languageLabel(language)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="filter-price">Precio</label>
        <select
          id="filter-price"
          name="precio"
          defaultValue={filters.precio ?? ""}
          aria-describedby="filter-price-hint"
        >
          <option value="">Cualquiera</option>
          <option value="sesion">{priceFilterLabels.sesion}</option>
          <option value="sin-sesion">{priceFilterLabels["sin-sesion"]}</option>
        </select>
        <small id="filter-price-hint">
          «Sin precio por sesión» no significa gratis: incluye cuotas, donaciones y precios por confirmar.
        </small>
      </div>
      <div className="public-filter-actions">
        <button type="submit">Aplicar filtros</button>
        {hasFilters(filters) && (
          <a href={catalogHref({ month: selection.month, period: selection.period })}>Limpiar filtros</a>
        )}
      </div>
    </CleanGetForm>
  );
}

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
  const filters = selection?.filters ?? emptyFilters;
  const filtered = hasFilters(filters);
  // Period, month and filters travel together so a shared URL reproduces exactly the same search.
  const scope: CatalogScope = { month: selection?.month ?? null, period: selection?.period ?? null, filters };
  const nextPage =
    result.status === "ready" && selection
      ? result.nextCursor
        ? catalogHref(scope, result.nextCursor, selection.at, selection.tail)
        : selection.hasTail && !selection.tail
          ? catalogHref(scope, null, selection.at, true)
          : null
      : null;
  const tab = (period: CatalogSelection["period"]) =>
    selection && !selection.month && selection.period === period ? "page" : undefined;
  return (
    <div className="public-catalog">
      <a className="public-skip" href="#activities">
        Saltar a las actividades
      </a>
      <PublicHeader />
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
              <a href={catalogHref({ period: "hoy", filters })} aria-current={tab("hoy")}>
                Hoy
              </a>
              <a href={catalogHref({ period: "manana", filters })} aria-current={tab("manana")}>
                Mañana
              </a>
              <a href={catalogHref({ period: "finde", filters })} aria-current={tab("finde")}>
                Fin de semana
              </a>
              <a href={catalogHref({ filters })} aria-current={tab(null)}>
                Próximos 7 días
              </a>
              <a
                href={catalogHref({ month: calendarMonth, filters })}
                aria-current={selection?.month ? "page" : undefined}
              >
                Calendario completo
              </a>
            </nav>
          </div>
          {selection && <FilterForm selection={selection} />}
          {selection?.month && (
            <nav className="public-month-nav" aria-label="Mes del calendario">
              {selection.previousMonth ? (
                <a href={catalogHref({ month: selection.previousMonth, filters })}>← Mes anterior</a>
              ) : (
                <span />
              )}
              <form method="get" action="/#activities">
                {Object.entries(filters).map(([name, value]) =>
                  value ? <input key={name} type="hidden" name={name} value={value} /> : null,
                )}
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
              {selection.nextMonth && (
                <a href={catalogHref({ month: selection.nextMonth, filters })}>Mes siguiente →</a>
              )}
            </nav>
          )}
          {filtered && (
            <p className="public-active-filters" aria-label="Filtros activos">
              Filtros activos: {activeFilterLabels(filters).join(" · ")}
            </p>
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
                      : filtered
                        ? "No hay actividades que cumplan estos filtros"
                        : "No hay actividades publicadas para estas fechas"}
                  </h3>
                  <p>
                    {selection?.query.cursor || selection?.tail
                      ? "Puedes volver al inicio del periodo para consultar la agenda actualizada."
                      : filtered
                        ? "Prueba a quitar algún filtro o a consultar otras fechas. Los datos desconocidos no cumplen filtros exactos."
                        : "Estamos actualizando el calendario. Puedes consultar otras fechas para encontrar actividades publicadas."}
                  </p>
                  {filtered && !selection?.query.cursor && !selection?.tail && (
                    <a href={catalogHref({ month: selection?.month ?? null, period: selection?.period ?? null })}>
                      Limpiar filtros
                    </a>
                  )}
                </div>
              )}
              <nav className="public-pagination" aria-label="Paginación de actividades">
                {(selection?.query.cursor || selection?.tail) && (
                  <a href={catalogHref(scope)}>Volver al inicio del periodo</a>
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
                  ? "El periodo, los filtros o la página no son válidos. Vuelve al inicio de la agenda para consultar las próximas actividades."
                  : "Vuelve a consultar la agenda más adelante para ver actividades confirmadas."}
              </p>
              <a href={result.status === "invalid" ? catalogHref(null) : catalogHref(scope)}>
                {result.status === "invalid" ? "Ver próximas actividades" : "Volver a consultar"}
              </a>
            </div>
          )}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
