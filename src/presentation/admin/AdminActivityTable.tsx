"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ActivityRowViewModel } from "./adminActivityLoader";

export function AdminActivityTable({ rows }: { rows: ActivityRowViewModel[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allSelected = rows.length > 0 && rows.every((row) => selectedSet.has(row.id));

  function toggleRow(id: string) {
    setCopied(false);
    setSelected((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id],
    );
  }

  function toggleAll() {
    setCopied(false);
    setSelected(allSelected ? [] : rows.map((row) => row.id));
  }

  async function copyIds() {
    if (selected.length === 0 || !navigator.clipboard) return;
    await navigator.clipboard.writeText(selected.join("\n"));
    setCopied(true);
  }

  if (rows.length === 0) {
    return (
      <div className="admin-empty-state">
        <strong>No hay resultados con estos filtros</strong>
        <p>
          Prueba a cambiar el estado, la fecha o la búsqueda. No se sustituyen datos ausentes por valores ficticios.
        </p>
      </div>
    );
  }

  return (
    <section className="admin-table-card" aria-label="Listado de actividades">
      <div className="admin-batch-bar">
        <label className="admin-selection-label">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          <strong>{selected.length} seleccionadas</strong>
        </label>

        <details className="admin-batch-actions">
          <summary className={selected.length > 0 ? "admin-primary-button" : "admin-primary-button is-disabled"}>
            Acciones en lote
          </summary>
          {selected.length > 0 ? (
            <div className="admin-batch-menu">
              <button type="button" onClick={copyIds}>
                {copied ? "IDs copiados" : "Copiar IDs"}
              </button>
              <button type="button" onClick={() => setSelected([])}>
                Limpiar selección
              </button>
            </div>
          ) : null}
        </details>
      </div>

      <div className="admin-table-scroll">
        <table className="admin-activities-table">
          <thead>
            <tr>
              <th className="admin-select-column">
                <span className="sr-only">Seleccionar</span>
              </th>
              <th>Título</th>
              <th>Fecha</th>
              <th>Organizador</th>
              <th>Fuente</th>
              <th>Estado</th>
              <th>Última comprobación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.status === "blocked" ? "admin-row-blocked" : undefined}>
                <td className="admin-select-column">
                  <input
                    aria-label={`Seleccionar ${row.title}`}
                    type="checkbox"
                    checked={selectedSet.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                  />
                </td>
                <td>
                  <div className="admin-table-title">
                    {row.detailHref ? <Link href={row.detailHref}>{row.title}</Link> : <strong>{row.title}</strong>}
                    {row.reasonCodes.length > 0 ? (
                      <small>
                        {row.reasonCodes.length} señal{row.reasonCodes.length === 1 ? "" : "es"} de revisión
                      </small>
                    ) : null}
                  </div>
                </td>
                <td>{row.date}</td>
                <td>{row.organizer}</td>
                <td>{row.source}</td>
                <td>
                  <span className={`admin-status-badge admin-status-${row.statusTone}`}>{row.statusLabel}</span>
                </td>
                <td>{row.lastChecked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
