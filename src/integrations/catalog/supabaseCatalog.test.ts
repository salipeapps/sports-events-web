import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { decodeCatalogPage, SupabasePublicCatalogRepository, validateCatalogQuery } from "./supabaseCatalog";
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
  it.each([
    { contractVersion: 2 },
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
