import type { CSSProperties } from "react";
import Link from "next/link";

import type { DashboardSummary, EditorialStatus, FieldValue } from "@/domain/admin";
import { categoryLabels, statusLabels } from "./adminPresentation";

function numberValue(field: FieldValue<number>): string {
  return field.state === "known" ? new Intl.NumberFormat("es-ES").format(field.value) : "—";
}

function metricHint(field: FieldValue<unknown>): string {
  return field.state === "known" ? "Dato del adaptador" : (field.note ?? "No verificado");
}

function countFor(summary: DashboardSummary, status: EditorialStatus): number {
  return summary.statusDistribution.find((item) => item.status === status)?.count ?? 0;
}

function urgentLabel(kind: DashboardSummary["urgentItems"][number]["kind"]): string {
  switch (kind) {
    case "conflict":
      return "Revisar";
    case "incomplete":
      return "Completar";
    case "duplicate":
      return "Duplicado";
    case "source_incident":
      return "Incidencia";
    case "change":
      return "Cambio";
  }
}

export function AdminDashboard({ summary }: { summary: DashboardSummary }) {
  const coverage = summary.metrics.coverageNext14Days;
  const statusTotal = summary.statusDistribution.reduce((total, item) => total + item.count, 0);
  const publishedCount = countFor(summary, "published");
  const publishedPercent = statusTotal > 0 ? Math.round((publishedCount / statusTotal) * 100) : 0;
  const ringStyle = { "--admin-published-percent": `${publishedPercent}%` } as CSSProperties;

  const metrics = [
    {
      label: "Actividades publicadas",
      value: numberValue(summary.metrics.publishedActivities),
      hint: metricHint(summary.metrics.publishedActivities),
    },
    {
      label: "Candidatos pendientes",
      value: numberValue(summary.metrics.pendingCandidates),
      hint: metricHint(summary.metrics.pendingCandidates),
    },
    {
      label: "Conflictos",
      value: numberValue(summary.metrics.conflicts),
      hint: metricHint(summary.metrics.conflicts),
    },
    {
      label: "Fuentes activas",
      value: numberValue(summary.metrics.activeSources),
      hint: metricHint(summary.metrics.activeSources),
    },
    {
      label: "Ejecuciones hoy",
      value: numberValue(summary.metrics.runsToday),
      hint: metricHint(summary.metrics.runsToday),
    },
    {
      label: "Cobertura 14 días",
      value: coverage.state === "known" ? `${coverage.value.percent}%` : "—",
      hint:
        coverage.state === "known"
          ? `${coverage.value.published} de ${coverage.value.target}`
          : (coverage.note ?? "No verificada"),
    },
  ];

  const categories = [...summary.categoryCoverage]
    .sort((a, b) => b.publishedCount + b.candidateCount - (a.publishedCount + a.candidateCount))
    .slice(0, 6);

  return (
    <main className="admin-page admin-dashboard-page">
      <header className="admin-page-header">
        <h1>Resumen</h1>
        <p>Visión general del estado de la plataforma y su actividad en Valencia.</p>
      </header>

      <section className="admin-metrics-grid" aria-label="Métricas operativas">
        {metrics.map((metric) => (
          <article className="admin-metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.hint}</small>
          </article>
        ))}
      </section>

      <section className="admin-dashboard-grid">
        <article className="admin-dashboard-card admin-dashboard-card-wide">
          <h2>Evolución de la cobertura del catálogo</h2>
          {summary.coverageTrend.state === "known" && summary.coverageTrend.value.length > 0 ? (
            <div className="admin-coverage-bars" aria-label="Evolución de cobertura">
              {summary.coverageTrend.value.map((point) => {
                const total = point.published + point.candidates;
                return (
                  <div className="admin-coverage-bar-item" key={point.date}>
                    <div
                      className="admin-coverage-bar"
                      style={{ height: `${Math.max(18, Math.min(total * 8, 132))}px` }}
                      title={`${point.date}: ${total}`}
                    />
                    <span>{point.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="admin-panel-empty">
              <strong>Sin histórico verificable</strong>
              <p>
                {summary.coverageTrend.state === "unknown"
                  ? (summary.coverageTrend.note ?? "Todavía no hay una serie temporal disponible.")
                  : "Todavía no hay una serie temporal disponible."}
              </p>
            </div>
          )}
        </article>

        <article className="admin-dashboard-card">
          <h2>Estado de las actividades</h2>
          <div className="admin-status-overview">
            <div className="admin-status-ring" style={ringStyle}>
              <strong>{statusTotal}</strong>
            </div>
            <ul className="admin-status-list">
              {summary.statusDistribution.map((item) => (
                <li key={item.status}>
                  <span>{statusLabels[item.status]}</span>
                  <strong>
                    {item.count} · {statusTotal > 0 ? Math.round((item.count / statusTotal) * 100) : 0}%
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="admin-dashboard-card">
          <h2>Cobertura del catálogo</h2>
          {categories.length > 0 ? (
            <div className="admin-category-coverage">
              {categories.map((item) => {
                const observed = item.publishedCount + item.candidateCount;
                const percent =
                  item.target.state === "known" && item.target.value > 0
                    ? Math.min(100, Math.round((item.publishedCount / item.target.value) * 100))
                    : null;
                return (
                  <div className="admin-category-row" key={item.category}>
                    <strong>{categoryLabels[item.category]}</strong>
                    <span>{observed}</span>
                    <span>{percent === null ? "—" : `${percent}%`}</span>
                    <div className="admin-progress-track" aria-hidden="true">
                      <span style={{ width: percent === null ? "0%" : `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="admin-panel-empty">
              <strong>Sin cobertura observada</strong>
              <p>El adaptador todavía no ha aportado categorías al catálogo.</p>
            </div>
          )}
        </article>

        <article className="admin-dashboard-card">
          <div className="admin-card-heading-with-count">
            <h2>Elementos urgentes a revisar</h2>
            <span>{summary.urgentItems.length}</span>
          </div>
          {summary.urgentItems.length > 0 ? (
            <ul className="admin-urgent-list">
              {summary.urgentItems.slice(0, 6).map((item) => {
                const href = item.candidateId.state === "known" ? `/admin/candidates/${item.candidateId.value}` : null;
                const content = (
                  <>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.reason}</small>
                    </span>
                    <em>{urgentLabel(item.kind)}</em>
                  </>
                );
                return <li key={item.id}>{href ? <Link href={href}>{content}</Link> : <div>{content}</div>}</li>;
              })}
            </ul>
          ) : (
            <div className="admin-panel-empty">
              <strong>Sin elementos urgentes</strong>
              <p>No hay conflictos, duplicados o cambios pendientes en este momento.</p>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
