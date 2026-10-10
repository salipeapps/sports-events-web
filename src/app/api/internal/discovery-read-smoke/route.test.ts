import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/auth/discoveryToken", () => ({ getDiscoveryAccessToken: vi.fn() }));
vi.mock("@/integrations/discovery/readApi", () => ({
  isStagingSmokeEnabled: vi.fn(),
  getStagingSmokeDiscoveryRepository: vi.fn(),
  DiscoveryReadError: class DiscoveryReadError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));

import { getDiscoveryAccessToken } from "@/integrations/auth/discoveryToken";
import {
  DiscoveryReadError,
  getStagingSmokeDiscoveryRepository,
  isStagingSmokeEnabled,
  type DiscoveryReadRepository,
} from "@/integrations/discovery/readApi";
import { GET, VALENCIA_SMOKE_EXECUTION_ID } from "./route";

function request(origin = "https://staging.example.test", site = "same-origin") {
  return new Request(origin + "/api/internal/discovery-read-smoke", {
    headers: {
      host: new URL(origin).host,
      "sec-fetch-site": site,
    },
  });
}

function repository() {
  const observations = Array.from({ length: 10 }, (_, index) => ({
    candidateId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    knownSourceId: null,
  }));
  const candidates = observations.map((item, index) => ({
    id: item.candidateId,
    classification: { kind: index === 9 ? "AMBIGUOUS_REVIEW_REQUIRED" : "UNSUPPORTED_REVIEWABLE" },
  }));
  return {
    execution: vi.fn().mockResolvedValue({ status: "SUCCEEDED" }),
    executionObservations: vi.fn().mockResolvedValue({ items: observations, nextCursor: null }),
    candidates: vi.fn().mockResolvedValue({ items: candidates, nextCursor: null }),
  };
}

beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "https://staging.example.test");
  vi.mocked(isStagingSmokeEnabled).mockReturnValue(true);
  vi.mocked(getDiscoveryAccessToken).mockResolvedValue({
    status: "authorized",
    accessToken: "never-serialize-me",
    role: "admin",
    subject: "00000000-0000-4000-a000-000000000001",
  });
  vi.mocked(getStagingSmokeDiscoveryRepository).mockReturnValue(
    repository() as unknown as DiscoveryReadRepository,
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("temporary read-only Vercel-side discovery smoke", () => {
  it.each(["admin", "reviewer"] as const)("returns only safe aggregate acceptance evidence for %s", async (role) => {
    vi.mocked(getDiscoveryAccessToken).mockResolvedValue({
      status: "authorized",
      accessToken: "never-serialize-me",
      role,
      subject: "00000000-0000-4000-a000-000000000001",
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const payload = await response.json();
    expect(payload).toMatchObject({
      code: "SMOKE_OK",
      role,
      candidates: 10,
      observations: 10,
      classificationCounts: { UNSUPPORTED_REVIEWABLE: 9, AMBIGUOUS_REVIEW_REQUIRED: 1 },
    });
    expect(JSON.stringify(payload)).not.toContain("never-serialize-me");
    const repo = vi.mocked(getStagingSmokeDiscoveryRepository).mock.results[0].value as DiscoveryReadRepository;
    expect(repo.execution).toHaveBeenCalledWith(VALENCIA_SMOKE_EXECUTION_ID);
    expect(repo.executionObservations).toHaveBeenCalledWith(VALENCIA_SMOKE_EXECUTION_ID, { limit: 100 });
    expect(repo.candidates).toHaveBeenCalledWith({ executionId: VALENCIA_SMOKE_EXECUTION_ID, limit: 100 });
  });

  it("rejects without touching identity or engine when the environment gate is closed", async () => {
    vi.mocked(isStagingSmokeEnabled).mockReturnValue(false);
    expect((await GET(request())).status).toBe(404);
    expect(getDiscoveryAccessToken).not.toHaveBeenCalled();
    expect(getStagingSmokeDiscoveryRepository).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong origin", "https://generic-preview.example.test", "same-origin"],
    ["cross-site request", "https://staging.example.test", "cross-site"],
  ])("rejects %s before opening workload identity", async (_name, origin, site) => {
    expect((await GET(request(origin, site))).status).toBe(404);
    expect(getDiscoveryAccessToken).not.toHaveBeenCalled();
    expect(getStagingSmokeDiscoveryRepository).not.toHaveBeenCalled();
  });

  it.each([
    ["UNAUTHENTICATED", 401],
    ["FORBIDDEN", 403],
  ] as const)("rejects %s before attempting a Cloud Run read", async (code, status) => {
    vi.mocked(getDiscoveryAccessToken).mockResolvedValue({ status: "denied", code });
    expect((await GET(request())).status).toBe(status);
    expect(getStagingSmokeDiscoveryRepository).not.toHaveBeenCalled();
  });

  it("fails without claiming success when historic counts differ", async () => {
    const repo = repository();
    repo.candidates.mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(getStagingSmokeDiscoveryRepository).mockReturnValue(repo as unknown as DiscoveryReadRepository);
    const response = await GET(request());
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("SMOKE_MISMATCH");
  });

  it("redacts service exceptions and does not leak upstream data", async () => {
    const repo = repository();
    repo.execution.mockRejectedValue(new DiscoveryReadError("FORBIDDEN"));
    vi.mocked(getStagingSmokeDiscoveryRepository).mockReturnValue(repo as unknown as DiscoveryReadRepository);
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "FORBIDDEN" });
  });
});
