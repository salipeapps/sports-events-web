import type { EngineRun, FieldValue, SourceConfig, SourceStatus } from "@/domain/admin";
import type { AdminSearchParams } from "./adminActivityQuery";
import { displayField, formatCheckedAt, type StatusTone } from "./adminPresentation";

export type SourceOperationalStatus = SourceStatus | "budget_exhausted";

export const sourceStateLabels: Record<SourceOperationalStatus, string> = {
  active: "Activa",
  paused: "Pausada",
  blocked: "Bloqueada",
  proposed: "Pendiente",
  budget_exhausted: "Presupuesto agotado",
};

export const sourcePolicyLabels: Record<SourceConfig["publicationPolicy"], string> = {
  capture_only: "Solo captación",
  capture_and_evaluate: "Captación y evaluación",
  human_review: "Revisión humana",
  auto_publish: "Publicación automática",
};

export const runStateLabels: Record<EngineRun["status"], string> = {
  queued: "En cola",
  running: "En ejecución",
  succeeded: "Completada",
  partial: "Parcial / incidencia",
  failed: "Error",
};

export function effectiveSourceState(source: SourceConfig): SourceOperationalStatus {
  if (source.status !== "active") return source.status;
  return source.budgetStatus === "exhausted" ? "budget_exhausted" : "active";
}

export function sourceStateTone(state: SourceOperationalStatus): StatusTone {
  switch (state) {
    case "active":
      return "success";
    case "paused":
    case "budget_exhausted":
      return "warning";
    case "blocked":
      return "danger";
    case "proposed":
      return "neutral";
  }
}

export function runStateTone(status: EngineRun["status"]): StatusTone {
  switch (status) {
    case "succeeded":
      return "success";
    case "queued":
      return "neutral";
    case "running":
      return "info";
    case "partial":
      return "warning";
    case "failed":
      return "danger";
  }
}

export function formatMoney(field: FieldValue<{ amount: number; currency: "EUR" }>): string {
  return displayField(field, ({ amount, currency }) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount),
  );
}

export function formatDuration(seconds: FieldValue<number>): string {
  return displayField(seconds, (value) => {
    const minutes = Math.floor(value / 60);
    const remainder = Math.floor(value % 60);
    return minutes > 0 ? `${minutes} min ${remainder} s` : `${remainder} s`;
  });
}

export function formatRunDate(value: FieldValue<string>): string {
  return displayField(value, formatCheckedAt);
}

export function sourceBudgetLabel(source: SourceConfig): string {
  if (source.budgetStatus === "exhausted") return "Agotado (escenario)";
  return displayField(source.budget, ({ amount, currency, period }) => {
    const formatted = new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
    return `${formatted} / ${period}`;
  });
}

export interface SourceQuery {
  q?: string;
  status?: string;
}

export interface RunQuery {
  q?: string;
  status?: string;
  source?: string;
}

function firstParam(params: AdminSearchParams, key: string): string {
  const raw = params[key];
  return (Array.isArray(raw) ? raw[0] ?? "" : raw ?? "").trim();
}

export function resolveSourceQuery(params: AdminSearchParams): SourceQuery {
  return { q: firstParam(params, "q"), status: firstParam(params, "status") };
}

export function resolveRunQuery(params: AdminSearchParams): RunQuery {
  return {
    q: firstParam(params, "q"),
    status: firstParam(params, "status"),
    source: firstParam(params, "source"),
  };
}

export function resolveRunCandidatePage(params: AdminSearchParams): number {
  const value = firstParam(params, "page");
  if (!/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

export function filterSources(sources: SourceConfig[], query: SourceQuery): SourceConfig[] {
  const search = query.q?.trim().toLocaleLowerCase("es") ?? "";
  return sources
    .filter((source) => !query.status || effectiveSourceState(source) === query.status)
    .filter(
      (source) =>
        !search ||
        [source.id, source.name, source.type, ...source.coverage].some((value) =>
          value.toLocaleLowerCase("es").includes(search),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function filterRuns(runs: EngineRun[], sources: SourceConfig[], query: RunQuery): EngineRun[] {
  const search = query.q?.trim().toLocaleLowerCase("es") ?? "";
  const sourceNames = new Map(sources.map((source) => [source.id, source.name]));
  return runs
    .filter((run) => run.kind !== "discovery")
    .filter((run) => !query.status || run.status === query.status)
    .filter((run) => !query.source || (run.sourceId.state === "known" && run.sourceId.value === query.source))
    .filter((run) => {
      if (!search) return true;
      const sourceId = run.sourceId.state === "known" ? run.sourceId.value : "";
      return [run.id, sourceId, sourceNames.get(sourceId) ?? ""].some((value) =>
        value.toLocaleLowerCase("es").includes(search),
      );
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
