import { afterEach, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { handleDiscoveryCommand } from "@/integrations/discovery/commandBoundary";
import { POST } from "./route";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/integrations/discovery/commandBoundary", () => ({ handleDiscoveryCommand: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it.each([200, 409, 401, 403, 422, 503])(
  "invalidates list/filter and detail after receipt/conflict only: %s",
  async (status) => {
    const id = "ca73b0ff-8001-4000-8000-111111111111";
    const response = new Response("{}", { status });
    vi.mocked(handleDiscoveryCommand).mockResolvedValue(response);
    expect(
      await POST(new Request("https://example.test"), { params: Promise.resolve({ id, operation: "rejection" }) }),
    ).toBe(response);
    if (status === 200 || status === 409) {
      expect(revalidatePath).toHaveBeenCalledWith("/admin/discovery");
      expect(revalidatePath).toHaveBeenCalledWith(`/admin/discovery/results/${id}`);
    } else expect(revalidatePath).not.toHaveBeenCalled();
  },
);
