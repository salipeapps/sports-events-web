import { describe, expect, it } from "vitest";

import { pageHref, resolveActivityQuery, tabHref } from "./adminActivityQuery";

describe("Admin activity query", () => {
  it("defaults the activities screen to published items", () => {
    const query = resolveActivityQuery({}, "activities");

    expect(query.activeTab).toBe("published");
    expect(query.filters.statuses).toEqual(["published"]);
    expect(query.filters.page).toBe(1);
  });

  it("defaults the candidates shortcut to candidate inventory", () => {
    const query = resolveActivityQuery({}, "candidates");

    expect(query.activeTab).toBe("candidates");
    expect(query.filters.statuses).toEqual(["candidate"]);
  });

  it("combines tab, date, activity, state, source, organizer, search and page filters", () => {
    const query = resolveActivityQuery(
      {
        tab: "review",
        date: "2026-10-24",
        category: "beach_sports",
        status: "blocked",
        source: "source-meetup",
        organizer: "O018",
        q: "voley",
        page: "2",
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
      page: 2,
      pageSize: 25,
    });
  });

  it("ignores a status that is incompatible with the active tab", () => {
    const query = resolveActivityQuery({ tab: "candidates", status: "blocked" }, "activities");

    expect(query.filters.statuses).toEqual(["candidate"]);
    expect(query.values.status).toBe("");
  });

  it("exposes rejected candidates through the terminal archived tab", () => {
    const query = resolveActivityQuery({ tab: "archived", status: "rejected" }, "activities");

    expect(query.filters.statuses).toEqual(["rejected"]);
    expect(query.values.status).toBe("rejected");
  });

  it("keeps compatible filters but clears page and status when changing tabs", () => {
    expect(
      tabHref(
        "/admin/activities",
        { q: "yoga", source: "s1", status: "published", page: "3", tab: "published" },
        "review",
      ),
    ).toBe("/admin/activities?q=yoga&source=s1&tab=review");
  });

  it("builds pagination links without losing active filters", () => {
    expect(pageHref("/admin/activities", { tab: "review", q: "yoga", page: "2" }, 3)).toBe(
      "/admin/activities?tab=review&q=yoga&page=3",
    );
  });
});
