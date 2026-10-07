import { describe, expect, it } from "vitest";

import { resolveActivityQuery, tabHref } from "./adminActivityQuery";

describe("Admin activity query", () => {
  it("defaults the activities screen to published items", () => {
    const query = resolveActivityQuery({}, "activities");

    expect(query.activeTab).toBe("published");
    expect(query.filters.statuses).toEqual(["published"]);
  });

  it("defaults the candidates shortcut to candidate inventory", () => {
    const query = resolveActivityQuery({}, "candidates");

    expect(query.activeTab).toBe("candidates");
    expect(query.filters.statuses).toEqual(["candidate"]);
  });

  it("combines tab, date, activity, state, source, organizer and search filters", () => {
    const query = resolveActivityQuery(
      {
        tab: "review",
        date: "2026-10-24",
        category: "beach_sports",
        status: "blocked",
        source: "source-meetup",
        organizer: "O018",
        q: "voley",
      },
      "activities",
    );

    expect(query.filters).toMatchObject({
      statuses: ["blocked"],
      dateFrom: "2026-10-24",
      dateTo: "2026-10-24",
      category: "beach_sports",
      sourceId: "source-meetup",
      organizerId: "O018",
      search: "voley",
    });
  });

  it("keeps active filters when changing tabs", () => {
    expect(tabHref("/admin/activities", { q: "yoga", source: "s1", tab: "published" }, "review")).toBe(
      "/admin/activities?q=yoga&source=s1&tab=review",
    );
  });
});
