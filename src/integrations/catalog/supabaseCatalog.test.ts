import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  decodeCatalogDetail,
  decodeCatalogPage,
  SupabasePublicCatalogRepository,
  validateCatalogQuery,
} from "./supabaseCatalog";
import type { CatalogQuery } from "@/domain/publicCatalog";

const now = new Date("2026-10-22T10:00:00Z");
const query: CatalogQuery = { desde: now.toISOString(), hasta: "2026-10-29T10:00:00Z", limit: 24, cursor: null };
function occurrence(extra: Record<string, unknown> = {}) {
  return {
    contractVersion: 1,
    id: "00000000-0000-4000-8000-000000000001",
    title: "TEST · Actividad revisada",
    organizerName: "TEST · Organizador",
    startInstant: "2026-10-22T11:00:00Z",
    endInstant: null,
    status: "upcoming",
    timeZone: "Europe/Madrid",
    registrationUrl: null,
    activityLanguage: null,
    category: "running",
    titleTranslations: { es: "TEST · Actividad revisada", en: null },
    level: { es: null, en: null },
    requirements: { es: null, en: null },
    lastVerifiedAt: "2026-10-21T10:00:00Z",
    verifiedUntil: "2026-10-28T10:00:00Z",
    locations: [],
    prices: [],
    updatedAt: "2026-10-21T10:00:00Z",
    ...extra,
  };
}
const envelope = (items: unknown[] = [occurrence()], nextCursor: unknown = null) => ({
  contractVersion: 1,
  items,
  nextCursor,
});

describe("H2 public RPC adapter (unit fixtures; real PostgREST tested across repositories)", () => {
  it("uses only the fixed anonymous RPC with no session/bearer or cache", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope()));
    const repository = new SupabasePublicCatalogRepository(
      { url: "https://test.supabase.co", key: "sb_publishable_test" },
      request,
      () => now,
    );
    await repository.list(query);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://test.supabase.co/rest/v1/rpc/catalog_occurrences_v1");
    expect(options).toMatchObject({
      method: "POST",
      cache: "no-store",
      redirect: "error",
      body: JSON.stringify(query),
    });
    expect(options?.headers).toEqual({
      apikey: "sb_publishable_test",
      "Content-Type": "application/json",
      "Accept-Profile": "api",
      "Content-Profile": "api",
    });
  });
  it("reconstructs only public fields and preserves unknowns", () => {
    const page = decodeCatalogPage(
      envelope([occurrence({ acceptedCandidateId: "private", evidence: "private", reviewerEmail: "private" })]),
      query,
      now,
    );
    expect(JSON.stringify(page)).not.toContain("private");
    expect(page.items[0]).toMatchObject({
      category: "running",
      level: { es: null, en: null },
      activityLanguage: null,
      prices: [],
      locations: [],
    });
  });
  it("preserves H2 bilingual editorial fields", () => {
    expect(
      decodeCatalogPage(
        envelope([occurrence({ category: "running", level: { es: "Iniciación", en: "Beginner" } })]),
        query,
        now,
      ).items[0],
    ).toMatchObject({ category: "running", level: { es: "Iniciación", en: "Beginner" } });
  });
  it.each(["free", "fixed", "donation", "trial", "early_bird", "from", "membership", "subscription"])(
    "preserves H2 price modality %s",
    (type) => {
      const option = {
        type,
        scope: "per_month",
        amount: type === "free" || type === "donation" ? null : 20,
        currency: type === "free" || type === "donation" ? null : "EUR",
        conditions: null,
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
        transportCost: "excluded",
      };
      expect(decodeCatalogPage(envelope([occurrence({ prices: [option] })]), query, now).items[0].prices[0]).toEqual(
        option,
      );
    },
  );
  it.each(["activity", "meeting_point", "departure", "destination"])("preserves H2 location role %s", (role) => {
    const location = {
      role,
      municipality: "Valencia",
      neighborhood: null,
      pointName: null,
      address: null,
      latitude: null,
      longitude: null,
    };
    expect(
      decodeCatalogPage(envelope([occurrence({ locations: [location] })]), query, now).items[0].locations[0],
    ).toEqual(location);
  });
  it("removes a start that passed while paginating without losing the next cursor", () => {
    const page = decodeCatalogPage(envelope([occurrence()], "next_page"), query, new Date("2026-10-22T12:00:00Z"));
    expect(page).toEqual({ items: [], nextCursor: "next_page" });
  });
  it("includes an activity at exactly the current instant", () => {
    expect(
      decodeCatalogPage(envelope([occurrence({ startInstant: now.toISOString() })]), query, now).items,
    ).toHaveLength(1);
  });
  it("keeps multiple valid occurrences ordered by their actual instant and UUID", () => {
    const later = occurrence({ id: "00000000-0000-4000-8000-000000000002", startInstant: "2026-10-23T11:00:00Z" });
    expect(decodeCatalogPage(envelope([occurrence(), later]), query, now).items.map((item) => item.id)).toEqual([
      occurrence().id,
      later.id,
    ]);
  });
  it.each([
    { status: "in_progress", startInstant: "2026-10-22T10:00:00Z", endInstant: "2026-10-22T12:00:00Z" },
    { lastVerifiedAt: "2026-10-20T10:00:00Z", verifiedUntil: now.toISOString() },
    { lastVerifiedAt: "2026-10-20T10:00:00Z", verifiedUntil: "2026-10-21T10:00:00Z" },
    { lastVerifiedAt: "2026-10-23T10:00:00Z" },
  ])("does not render a started or no-longer-current occurrence: %j", (change) => {
    expect(decodeCatalogPage(envelope([occurrence(change)], "next_page"), query, now)).toEqual({
      items: [],
      nextCursor: "next_page",
    });
  });
  it.each([
    { contractVersion: 2 },
    { status: "draft" },
    { status: "cancelled" },
    { status: "suspended" },
    { status: "conflicting" },
    { status: undefined },
    { lastVerifiedAt: "2026-10-28T10:00:00Z", verifiedUntil: "2026-10-21T10:00:00Z" },
    { timeZone: "UTC" },
    { startInstant: "2026-02-30T11:00:00Z" },
    { startInstant: "2026-10-22T11:00:00" },
    { startInstant: "2026-10-29T10:00:00Z" },
    { startInstant: "2026-10-21T11:00:00Z" },
    { endInstant: "2026-10-22T10:30:00Z" },
    { title: "<script>untrusted</script>" },
    { level: "Iniciación" },
    { level: { es: null } },
    { category: "inferred-category" },
    { registrationUrl: "javascript:alert(1)" },
    { registrationUrl: "https://u:p@example.org/" },
    { registrationUrl: "https://example.org/?access_token=private" },
    { prices: [{ type: "fixed", scope: "month", amount: 20, currency: null, conditions: null }] },
  ])("rejects malformed/nonpublic contract data %j", (change) => {
    expect(() => decodeCatalogPage(envelope([occurrence(change)]), query, now)).toThrow("INCOMPATIBLE_CONTRACT");
  });
  it("rejects unordered, duplicate, oversized pages and nonprogressing cursors", () => {
    const later = occurrence({ id: "00000000-0000-4000-8000-000000000002", startInstant: "2026-10-23T11:00:00Z" });
    for (const value of [
      envelope([later, occurrence()]),
      envelope([occurrence(), occurrence()]),
      envelope(Array.from({ length: 25 }, () => occurrence())),
      envelope([], "next"),
    ]) {
      expect(() => decodeCatalogPage(value, query, now)).toThrow("INCOMPATIBLE_CONTRACT");
    }
    expect(() => decodeCatalogPage(envelope([occurrence()], "same"), { ...query, cursor: "same" }, now)).toThrow(
      "INCOMPATIBLE_CONTRACT",
    );
  });
  it.each([
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { desde: "not a date" },
    { desde: "2026-02-30T11:00:00Z" },
    { hasta: "2026-12-01T10:00:00Z" },
    { hasta: query.desde },
    { cursor: "injection()" },
    { cursor: "base64+MIME/with=padding" },
    { cursor: "base64\nwrapped" },
  ])("rejects unbounded requests before network I/O %j", (change) => {
    expect(() => validateCatalogQuery({ ...query, ...change })).toThrow("INVALID_REQUEST");
  });
  it("rejects privileged keys at the adapter boundary", () => {
    expect(
      () => new SupabasePublicCatalogRepository({ url: "https://test.supabase.co", key: "sb_secret_test" }),
    ).toThrow("READ_UNAVAILABLE");
  });
  it.each([400, 401, 403, 404, 500])("never exposes upstream errors (%s)", async (status) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("private SQL token", { status }));
    await expect(
      new SupabasePublicCatalogRepository(
        { url: "https://test.supabase.co", key: "sb_publishable_test" },
        request,
      ).list(query),
    ).rejects.toThrow(status === 400 ? "INVALID_REQUEST" : "READ_UNAVAILABLE");
  });
  it("limits streamed bytes even without content-length", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1024 * 1024 + 1));
            controller.close();
          },
        }),
      ),
    );
    await expect(
      new SupabasePublicCatalogRepository(
        { url: "https://test.supabase.co", key: "sb_publishable_test" },
        request,
      ).list(query),
    ).rejects.toThrow("READ_UNAVAILABLE");
  });
  it("bounds a hung request and hides network exception messages", async () => {
    vi.useFakeTimers();
    try {
      const request = vi
        .fn<typeof fetch>()
        .mockImplementation(
          (_url, options) =>
            new Promise((_resolve, reject) =>
              options?.signal?.addEventListener("abort", () => reject(new Error("private token"))),
            ),
        );
      const pending = new SupabasePublicCatalogRepository(
        { url: "https://test.supabase.co", key: "sb_publishable_test" },
        request,
      ).list(query);
      const assertion = expect(pending).rejects.toThrow("READ_UNAVAILABLE");
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("verified registration v2", () => {
  const instruction = { method: "WHATSAPP", destination: "+34600111222", action: "COPY_NUMBER" };
  const item = () =>
    occurrence({ contractVersion: 2, registration: instruction, sourceUrl: "https://example.org/activity" });
  it("reads only the explicit v2 endpoint without a fallback", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ contractVersion: 2, items: [item()], nextCursor: null }));
    const repository = new SupabasePublicCatalogRepository(
      { url: "https://test.supabase.co", key: "sb_publishable_test", contractVersion: 2 },
      request,
      () => now,
    );
    expect((await repository.list(query)).items[0]).toMatchObject({
      registration: instruction,
      registrationUrl: null,
      sourceUrl: "https://example.org/activity",
    });
    expect(request.mock.calls[0][0]).toBe("https://test.supabase.co/rest/v1/rpc/catalog_occurrences_v2");
    request.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(repository.list(query)).rejects.toThrow("READ_UNAVAILABLE");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ...instruction, action: "OPEN_HTTPS" },
    { ...instruction, destination: "https://wa.me/34600111222" },
    { ...instruction, destination: "600111222" },
    { ...instruction, evidenceUrl: "https://example.org/private" },
    { method: "WEB", destination: "https://example.org/book?token=private", action: "OPEN_HTTPS" },
    { method: "EMAIL", destination: "person%0d%0a@example.org", action: "COMPOSE_EMAIL" },
  ])("rejects unsafe or mismatched public instructions: %j", (registration) => {
    expect(() =>
      decodeCatalogPage({ contractVersion: 2, items: [{ ...item(), registration }], nextCursor: null }, query, now, 2),
    ).toThrow();
  });
  it("rejects a legacy envelope in v2 and unsafe source navigation", () => {
    expect(() => decodeCatalogPage(envelope(), query, now, 2)).toThrow();
    expect(() =>
      decodeCatalogPage(
        {
          contractVersion: 2,
          items: [{ ...item(), sourceUrl: "https://example.org/?token=private" }],
          nextCursor: null,
        },
        query,
        now,
        2,
      ),
    ).toThrow();
  });
});

describe("public detail RPC (#52)", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const repository = (request: typeof fetch, version: 1 | 2 = 1, clock = () => now) =>
    new SupabasePublicCatalogRepository(
      { url: "https://test.supabase.co", key: "sb_publishable_test", contractVersion: version },
      request,
      clock,
    );
  it("calls only the exact detail RPC anonymously and without cache", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ contractVersion: 1, item: occurrence() }));
    const item = await repository(request).get(id);
    expect(item).toMatchObject({ id, status: "upcoming", title: "TEST · Actividad revisada" });
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://test.supabase.co/rest/v1/rpc/catalog_occurrence_v1");
    expect(options).toMatchObject({
      method: "POST",
      cache: "no-store",
      redirect: "error",
      body: JSON.stringify({ id }),
    });
    expect(options?.headers).not.toHaveProperty("Authorization");
  });
  it("never contacts the backend for a malformed identifier", async () => {
    const request = vi.fn<typeof fetch>();
    for (const value of ["", "abc", `${id}/../x`, "00000000-0000-4000-8000-00000000000g", `${id}?select=*`])
      await expect(repository(request).get(value)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    [404, "NOT_FOUND"],
    [400, "INVALID_REQUEST"],
    [401, "READ_UNAVAILABLE"],
    [403, "READ_UNAVAILABLE"],
    [500, "READ_UNAVAILABLE"],
    [503, "READ_UNAVAILABLE"],
  ])("maps HTTP %s to %s without exposing the upstream body", async (status, code) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ message: "PRIVATE_SQL_DETAIL" }, { status }));
    const error = await repository(request)
      .get(id)
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code });
    expect(String((error as Error).message)).not.toContain("PRIVATE");
  });
  it("fails closed on network errors", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("private socket detail"));
    await expect(repository(request).get(id)).rejects.toMatchObject({ code: "READ_UNAVAILABLE" });
  });
  it("strips private fields and rejects list envelopes, version or identity mismatches", () => {
    const item = decodeCatalogDetail(
      { contractVersion: 1, item: occurrence({ acceptedCandidateId: "private", evidence: "private" }) },
      id,
      now,
    );
    expect(JSON.stringify(item)).not.toContain("private");
    expect(() => decodeCatalogDetail({ contractVersion: 1, items: [occurrence()], nextCursor: null }, id, now)).toThrow(
      "INCOMPATIBLE_CONTRACT",
    );
    expect(() => decodeCatalogDetail({ contractVersion: 2, item: occurrence() }, id, now)).toThrow();
    expect(() =>
      decodeCatalogDetail(
        { contractVersion: 1, item: occurrence({ id: "00000000-0000-4000-8000-000000000002" }) },
        id,
        now,
      ),
    ).toThrow("INCOMPATIBLE_CONTRACT");
    expect(() =>
      decodeCatalogDetail({ contractVersion: 1, item: occurrence({ status: "cancelled" }) }, id, now),
    ).toThrow("INCOMPATIBLE_CONTRACT");
  });
  it("treats expired verification, finished or started-without-end occurrences as not found", () => {
    const detail = (extra: Record<string, unknown>) =>
      decodeCatalogDetail({ contractVersion: 1, item: occurrence(extra) }, id, now);
    expect(() => detail({ verifiedUntil: "2026-10-22T10:00:00Z" })).toThrow("NOT_FOUND");
    expect(() => detail({ lastVerifiedAt: "2026-10-22T10:00:01Z", verifiedUntil: "2026-10-29T10:00:00Z" })).toThrow(
      "NOT_FOUND",
    );
    expect(() => detail({ startInstant: "2026-10-22T09:00:00Z" })).toThrow("NOT_FOUND");
    expect(() =>
      detail({ startInstant: "2026-10-22T08:00:00Z", endInstant: "2026-10-22T09:59:59Z", status: "in_progress" }),
    ).toThrow("NOT_FOUND");
  });
  it("derives in-progress from instants instead of trusting a stale label", () => {
    const item = decodeCatalogDetail(
      {
        contractVersion: 1,
        item: occurrence({ startInstant: "2026-10-22T09:00:00Z", endInstant: "2026-10-22T12:00:00Z" }),
      },
      id,
      now,
    );
    expect(item.status).toBe("in_progress");
  });
  it("reads v2 detail with verified registration and source, without a v1 fallback", async () => {
    const registration = { method: "PHONE", destination: "+34600111333", action: "CALL" };
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        contractVersion: 2,
        item: occurrence({ contractVersion: 2, registration, sourceUrl: "https://example.org/activity" }),
      }),
    );
    expect(await repository(request, 2).get(id)).toMatchObject({
      registration,
      registrationUrl: null,
      sourceUrl: "https://example.org/activity",
    });
    expect(request.mock.calls[0][0]).toBe("https://test.supabase.co/rest/v1/rpc/catalog_occurrence_v2");
    request.mockResolvedValue(Response.json({ contractVersion: 1, item: occurrence() }));
    await expect(repository(request, 2).get(id)).rejects.toMatchObject({ code: "INCOMPATIBLE_CONTRACT" });
  });
});

describe("H2 server-side filters (#51)", () => {
  it("sends only validated filters in the RPC body", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope([])));
    const repository = new SupabasePublicCatalogRepository(
      { url: "https://test.supabase.co", key: "sb_publishable_test" },
      request,
      () => now,
    );
    const filtered = { ...query, categoria: "yoga", municipio: "Valencia", idioma: "es", precioComparable: false };
    await repository.list(filtered);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual(filtered);
  });
  it.each([
    { categoria: "boxeo" },
    { idioma: "de" },
    { municipio: "" },
    { municipio: "a".repeat(101) },
    { municipio: "<b>x</b>" },
    { precioComparable: "true" },
  ])("rejects %j before any request", (extra) => {
    expect(() => validateCatalogQuery({ ...query, ...extra } as CatalogQuery)).toThrow("INVALID_REQUEST");
  });
});
