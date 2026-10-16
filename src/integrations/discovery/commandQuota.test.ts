import { describe, expect, it, vi } from "vitest";
import { SharedCommandAdmission } from "./commandQuota";
import { OfflineCommandQuotaStore } from "./commandQuota.fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/auth/supabaseServer", () => ({ createAuthClient: vi.fn() }));
const secret = "offline-identity-secret-32-bytes-minimum";

describe("shared command quota reference policy", () => {
  it("denies clock rollback and corrupt counters instead of reopening quota", async () => {
    const store = new OfflineCommandQuotaStore();
    const client = new SharedCommandAdmission(store, secret);
    await (await client.acquire("actor", "rejection")).complete();
    store.now--;
    await expect(client.acquire("actor", "rejection")).rejects.toThrow("WRITE_UNAVAILABLE");
    store.now++;
    store.state.dailyCount = -1;
    await expect(client.acquire("actor", "rejection")).rejects.toThrow("WRITE_UNAVAILABLE");
  });
  it("atomically admits only two concurrent writers across instances and a restart", async () => {
    const store = new OfflineCommandQuotaStore();
    const clients = Array.from({ length: 30 }, () => new SharedCommandAdmission(store, secret));
    const results = await Promise.allSettled(clients.map((client, i) => client.acquire(`actor-${i}`, "rejection")));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    store.now += 86400000; // crash/clock advancement must not silently reopen slots
    await expect(new SharedCommandAdmission(store, secret).acquire("new-actor", "promotion")).rejects.toThrow(
      "RATE_LIMITED",
    );
    for (const result of results) if (result.status === "fulfilled") await result.value.complete();
    await expect(new SharedCommandAdmission(store, secret).acquire("new-actor", "promotion")).resolves.toBeDefined();
  });
  it("shares an actor's concurrency slot across rejection and promotion", async () => {
    const store = new OfflineCommandQuotaStore();
    const a = new SharedCommandAdmission(store, secret);
    await a.acquire("same-actor", "rejection");
    await expect(new SharedCommandAdmission(store, secret).acquire("same-actor", "promotion")).rejects.toThrow(
      "RATE_LIMITED",
    );
  });
  it.each([
    ["rejection", 20, 40],
    ["promotion", 5, 10],
  ] as const)(
    "%s has rolling actor/global quotas preserved across restarts",
    async (operation, actorLimit, globalLimit) => {
      const store = new OfflineCommandQuotaStore();
      for (let i = 0; i < globalLimit; i++) {
        const client = new SharedCommandAdmission(store, secret);
        const actor = i < actorLimit ? "one" : `other-${i}`;
        await (await client.acquire(actor, operation)).complete();
        if (i === actorLimit - 1) await expect(client.acquire("one", operation)).rejects.toThrow("RATE_LIMITED");
      }
      const client = new SharedCommandAdmission(store, secret);
      await expect(client.acquire("fresh", operation)).rejects.toThrow("RATE_LIMITED");
      store.now += 59999;
      await expect(client.acquire("fresh", operation)).rejects.toThrow("RATE_LIMITED");
      store.now++;
      await expect(client.acquire("fresh", operation)).resolves.toBeDefined();
    },
  );
  it("bounds daily dispatch cost across operations, without refunding retries", async () => {
    const store = new OfflineCommandQuotaStore();
    for (let i = 0; i < 500; i++) {
      store.now += 60000;
      await (await new SharedCommandAdmission(store, secret).acquire("actor", "rejection")).complete();
    }
    await expect(new SharedCommandAdmission(store, secret).acquire("actor", "promotion")).rejects.toThrow(
      "RATE_LIMITED",
    );
    store.now = 2 * 86400000;
    await expect(new SharedCommandAdmission(store, secret).acquire("actor", "promotion")).resolves.toBeDefined();
  });
  it("rolls back rejected transactions, hides raw identity and fails closed on store errors", async () => {
    const store = new OfflineCommandQuotaStore();
    const client = new SharedCommandAdmission(store, secret);
    await client.acquire("private-actor", "rejection");
    const snapshot = structuredClone(store.state);
    await expect(client.acquire("private-actor", "rejection")).rejects.toThrow("RATE_LIMITED");
    expect(store.state).toEqual(snapshot);
    expect(JSON.stringify(store.state)).not.toContain("private-actor");
    store.available = false;
    await expect(client.acquire("other", "rejection")).rejects.toThrow("WRITE_UNAVAILABLE");
    expect(store.state).toEqual(snapshot);
  });
});
