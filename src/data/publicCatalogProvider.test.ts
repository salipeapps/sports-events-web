import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/config/publicCatalog", () => ({ getPublicCatalogConfig: vi.fn() }));
vi.mock("@/integrations/catalog/supabaseCatalog", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/integrations/catalog/supabaseCatalog")>();
  return {
    ...original,
    SupabasePublicCatalogRepository: class {
      list = list;
    },
  };
});
const list = vi.hoisted(() => vi.fn());
import { getPublicCatalogConfig } from "@/config/publicCatalog";
import { CatalogReadError } from "@/integrations/catalog/supabaseCatalog";
import { loadPublicCatalog } from "./publicCatalogProvider";

const query = { desde: "2026-10-22T10:00:00Z", hasta: "2026-10-29T10:00:00Z", cursor: null, limit: 24 };
afterEach(() => vi.resetAllMocks());
describe("public repository composition", () => {
  it("does not contact any backend for a disabled or invalid request", async () => {
    vi.mocked(getPublicCatalogConfig).mockReturnValue(null);
    expect(await loadPublicCatalog(query)).toEqual({ status: "disabled" });
    expect(await loadPublicCatalog(null)).toEqual({ status: "invalid" });
    expect(list).not.toHaveBeenCalled();
  });
  it("distinguishes a successful empty projection from service failure", async () => {
    vi.mocked(getPublicCatalogConfig).mockReturnValue({
      url: "http://localhost:54321",
      key: "sb_publishable_test",
      origin: "http://localhost:3000",
    });
    list.mockResolvedValueOnce({ items: [], nextCursor: null });
    expect(await loadPublicCatalog(query)).toEqual({ status: "ready", items: [], nextCursor: null });
    list.mockRejectedValueOnce(new Error("private details"));
    expect(await loadPublicCatalog(query)).toEqual({ status: "unavailable" });
    list.mockRejectedValueOnce(new CatalogReadError("INVALID_REQUEST"));
    expect(await loadPublicCatalog(query)).toEqual({ status: "invalid" });
  });
});
