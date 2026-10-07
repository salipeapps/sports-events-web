import Link from "next/link";

import { categoryLabels, statusLabels } from "./adminPresentation";
import { AdminActivityTable } from "./AdminActivityTable";
import type { ActivityCatalogModel } from "./adminActivityLoader";

export function AdminActivityCatalog({ model }: { model: ActivityCatalogModel }) {
  const rowSetKey = `${model.activeTab}:${model.rows.map((row) => row.id).join("|")}`;

  return (
    <main className="admin-page admin-catalog-page">
      <header className="admin-page-header admin-catalog-header">
        <div>
          <h1>{model.title}</h1>
          <p>{model.subtitle}</p>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Estado del catálogo">
        {model.tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={tab.id === model.activeTab ? "admin-tab admin-tab-active" : "admin-tab"}
            aria-current={tab.id === model.activeTab ? "page" : undefined}
          >
            {tab.label} ({tab.count})
          </Link>
        ))}
      </nav>

      <form className="admin-filter-panel" method="get" action={model.basePath}>
        <input type="hidden" name="tab" value={model.activeTab} />

        <label className="admin-filter-field">
          <span>Fecha</span>
          <input type="date" name="date" defaultValue={model.filters.date} />
        </label>

        <label className="admin-filter-field">
          <span>Actividad</span>
          <select name="category" defaultValue={model.filters.category}>
            <option value="">Todas</option>
            {model.categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {categoryLabels[option.value]}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-filter-field">
          <span>Estado</span>
          <select name="status" defaultValue={model.filters.status}>
            <option value="">Todos</option>
            {model.statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {statusLabels[option.value]}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-filter-field">
          <span>Fuente</span>
          <select name="source" defaultValue={model.filters.sourceId}>
            <option value="">Todas</option>
            {model.sourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-filter-field">
          <span>Organizador</span>
          <select name="organizer" defaultValue={model.filters.organizerId}>
            <option value="">Todos</option>
            {model.organizerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-search-field">
          <span className="sr-only">Buscar actividades</span>
          <input name="q" type="search" defaultValue={model.filters.search} placeholder="Buscar actividades..." />
        </label>

        <button className="admin-filter-submit" type="submit">
          Filtrar
        </button>
      </form>

      <p className="admin-results-count">
        {model.total === 0
          ? "0 resultados"
          : `Mostrando ${model.pagination.from}–${model.pagination.to} de ${model.total}`}
      </p>

      <AdminActivityTable key={rowSetKey} rows={model.rows} />

      {model.pagination.totalPages > 1 ? (
        <nav className="admin-pagination" aria-label="Paginación del catálogo">
          {model.pagination.previousHref ? (
            <Link href={model.pagination.previousHref}>← Anterior</Link>
          ) : (
            <span aria-disabled="true">← Anterior</span>
          )}
          <strong>
            Página {model.pagination.page} de {model.pagination.totalPages}
          </strong>
          {model.pagination.nextHref ? (
            <Link href={model.pagination.nextHref}>Siguiente →</Link>
          ) : (
            <span aria-disabled="true">Siguiente →</span>
          )}
        </nav>
      ) : null}
    </main>
  );
}
