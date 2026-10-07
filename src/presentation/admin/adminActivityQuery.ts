import {
  activityCategories,
  editorialStatuses,
  type ActivityCategory,
  type ActivityFilters,
  type EditorialStatus,
} from "@/domain/admin";

export type ActivityCatalogScope = "activities" | "candidates";
export type ActivityTab = "published" | "candidates" | "review" | "cancelled" | "archived";
export type AdminSearchParams = Record<string, string | string[] | undefined>;

export interface ActivityQueryState {
  activeTab: ActivityTab;
  filters: ActivityFilters;
  values: {
    date: string;
    category: string;
    status: string;
    sourceId: string;
    organizerId: string;
    search: string;
  };
}

export const activityTabs: Array<{ id: ActivityTab; label: string; statuses: EditorialStatus[] }> = [
  { id: "published", label: "Publicadas", statuses: ["published"] },
  { id: "candidates", label: "Candidatas", statuses: ["candidate"] },
  { id: "review", label: "Revisión", statuses: ["review", "blocked"] },
  { id: "cancelled", label: "Canceladas", statuses: ["cancelled"] },
  { id: "archived", label: "Archivadas", statuses: ["archived"] },
];

export const candidateTabs = activityTabs.filter((tab) => tab.id === "candidates" || tab.id === "review");

function param(searchParams: AdminSearchParams, key: string): string {
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function validCategory(value: string): value is ActivityCategory {
  return activityCategories.some((category) => category === value);
}

function validStatus(value: string): value is EditorialStatus {
  return editorialStatuses.some((status) => status === value);
}

function resolveTab(scope: ActivityCatalogScope, value: string): ActivityTab {
  const allowedTabs = scope === "activities" ? activityTabs : candidateTabs;
  return allowedTabs.some((tab) => tab.id === value) ? (value as ActivityTab) : scope === "activities" ? "published" : "candidates";
}

export function resolveActivityQuery(
  searchParams: AdminSearchParams,
  scope: ActivityCatalogScope,
): ActivityQueryState {
  const activeTab = resolveTab(scope, param(searchParams, "tab"));
  const tab = activityTabs.find((item) => item.id === activeTab) ?? activityTabs[0];
  const category = param(searchParams, "category");
  const explicitStatus = param(searchParams, "status");
  const date = param(searchParams, "date");
  const sourceId = param(searchParams, "source");
  const organizerId = param(searchParams, "organizer");
  const search = param(searchParams, "q").trim();

  const statuses =
    explicitStatus && validStatus(explicitStatus)
      ? tab.statuses.filter((status) => status === explicitStatus)
      : tab.statuses;

  return {
    activeTab,
    filters: {
      statuses,
      ...(validCategory(category) ? { category } : {}),
      ...(date ? { dateFrom: date, dateTo: date } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(organizerId ? { organizerId } : {}),
      ...(search ? { search } : {}),
      pageSize: 50,
    },
    values: {
      date,
      category: validCategory(category) ? category : "",
      status: validStatus(explicitStatus) ? explicitStatus : "",
      sourceId,
      organizerId,
      search,
    },
  };
}

export function tabHref(
  basePath: string,
  searchParams: AdminSearchParams,
  tab: ActivityTab,
): string {
  const query = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(searchParams)) {
    if (key === "tab" || key === "page") continue;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value) query.set(key, value);
  }

  query.set("tab", tab);
  return `${basePath}?${query.toString()}`;
}
