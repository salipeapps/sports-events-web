import type { AdminRepository } from "@/data/adminRepository";
import type { ActivityCategory, EditorialStatus } from "@/domain/admin";
import {
  candidateTabs,
  activityTabs,
  pageHref,
  resolveActivityQuery,
  tabHref,
  type ActivityCatalogScope,
  type ActivityTab,
  type AdminSearchParams,
} from "./adminActivityQuery";
import {
  categoryLabels,
  displayField,
  formatCheckedAt,
  formatLocalDateTime,
  statusLabels,
  statusTone,
  type StatusTone,
} from "./adminPresentation";

export interface ActivityRowViewModel {
  id: string;
  title: string;
  date: string;
  organizer: string;
  source: string;
  status: EditorialStatus;
  statusLabel: string;
  statusTone: StatusTone;
  lastChecked: string;
  detailHref?: string;
  reasonCodes: string[];
}

export interface ActivityCatalogModel {
  scope: ActivityCatalogScope;
  title: string;
  subtitle: string;
  basePath: string;
  activeTab: ActivityTab;
  tabs: Array<{ id: ActivityTab; label: string; count: number; href: string }>;
  filters: {
    date: string;
    category: string;
    status: string;
    sourceId: string;
    organizerId: string;
    search: string;
  };
  categoryOptions: Array<{ value: ActivityCategory; label: string }>;
  statusOptions: Array<{ value: EditorialStatus; label: string }>;
  sourceOptions: Array<{ value: string; label: string }>;
  organizerOptions: Array<{ value: string; label: string }>;
  rows: ActivityRowViewModel[];
  total: number;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    from: number;
    to: number;
    previousHref: string | null;
    nextHref: string | null;
  };
}

function statusCount(
  distribution: Array<{ status: EditorialStatus; count: number }>,
  statuses: EditorialStatus[],
): number {
  return statuses.reduce(
    (total, status) => total + (distribution.find((item) => item.status === status)?.count ?? 0),
    0,
  );
}

export async function loadActivityCatalog(
  repository: AdminRepository,
  searchParams: AdminSearchParams,
  scope: ActivityCatalogScope,
): Promise<ActivityCatalogModel> {
  const query = resolveActivityQuery(searchParams, scope);
  const listMethod =
    scope === "candidates" ? repository.listCandidates.bind(repository) : repository.listActivities.bind(repository);

  const [page, sources, organizers, summary] = await Promise.all([
    listMethod(query.filters),
    repository.listSources(),
    repository.listOrganizers(),
    repository.getDashboardSummary(),
  ]);

  const basePath = scope === "activities" ? "/admin/activities" : "/admin/candidates";
  const tabs = scope === "activities" ? activityTabs : candidateTabs;
  const activeTabConfig = activityTabs.find((tab) => tab.id === query.activeTab) ?? activityTabs[0];
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.page * page.pageSize, page.total);

  return {
    scope,
    title: scope === "activities" ? "Actividades" : "Candidatos",
    subtitle:
      scope === "activities"
        ? "Gestiona las actividades deportivas y de comunidad en Valencia."
        : "Revisa las candidaturas captadas antes de incorporarlas al catálogo.",
    basePath,
    activeTab: query.activeTab,
    tabs: tabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      count: statusCount(summary.statusDistribution, tab.statuses),
      href: tabHref(basePath, searchParams, tab.id),
    })),
    filters: query.values,
    categoryOptions: Object.entries(categoryLabels).map(([value, label]) => ({
      value: value as ActivityCategory,
      label,
    })),
    statusOptions: activeTabConfig.statuses.map((status) => ({
      value: status,
      label: statusLabels[status],
    })),
    sourceOptions: sources.map((source) => ({ value: source.id, label: source.name })),
    organizerOptions: organizers.map((organizer) => ({ value: organizer.id, label: organizer.name })),
    rows: page.items.map((item) => ({
      id: item.id,
      title: displayField(item.title),
      date: displayField(item.startLocal, formatLocalDateTime),
      organizer: displayField(item.organizerName),
      source: displayField(item.sourceName),
      status: item.editorialStatus,
      statusLabel: statusLabels[item.editorialStatus],
      statusTone: statusTone(item.editorialStatus),
      lastChecked: formatCheckedAt(item.lastCheckedAt),
      ...(item.kind === "candidate" ? { detailHref: `/admin/candidates/${item.id}` } : {}),
      reasonCodes: item.reasonCodes,
    })),
    total: page.total,
    pagination: {
      page: page.page,
      pageSize: page.pageSize,
      totalPages,
      from,
      to,
      previousHref: page.page > 1 ? pageHref(basePath, searchParams, page.page - 1) : null,
      nextHref: page.page < totalPages ? pageHref(basePath, searchParams, page.page + 1) : null,
    },
  };
}
