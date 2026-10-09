import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DiscoveryReadError, HttpDiscoveryReadRepository, getDiscoveryMode, parseStageConfig } from "./readApi";

const candidate = {
  id: "ca73b0ff-8001-4000-8000-111111111111",
  canonicalUrl: "https://example.org/event",
  firstObservedAt: "2026-10-09T08:00:00Z",
  lastObservedAt: "2026-10-09T08:00:00Z",
  reviewStatus: "PENDING_REVIEW",
  latestReviewId: null,
  linkedSourceId: null,
  classification: {
    kind: "UNSUPPORTED_REVIEWABLE",
    reason: null,
    sourceFamily: null,
    proposedAdapterKey: null,
    knownSourceId: null,
    ruleVersion: 1,
    classifiedAt: "2026-10-09T08:00:00Z",
  },
  observationCount: 1,
  minPosition: null,
  maxPosition: null,
  latestObservation: {
    id: "3afeef88-1111-4000-8000-111111111111",
    candidateId: "ca73b0ff-8001-4000-8000-111111111111",
    knownSourceId: null,
    queryId: "11a2a2a2-1111-4000-8000-111111111111",
    executionId: "20a2a2a2-1111-4000-8000-111111111111",
    providerKey: "serpapi",
    originalUrl: "https://example.org/event",
    observedAt: "2026-10-09T08:00:00Z",
    title: null,
    snippet: null,
    resultPosition: 1,
  },
  source: null,
  latestReview: null,
};

function setup(
  status = 200,
  body: unknown = { items: [candidate], nextCursor: "opaque-keyset" },
  contentType = "application/json",
) {
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } }),
  );
  const getUserToken = vi.fn(async () => "signed-user");
  const getWorkloadToken = vi.fn(async () => "signed-cloud-run");
  const repo = new HttpDiscoveryReadRepository({
    origin: "https://example.a.run.app",
    fetcher: fetcher as unknown as typeof fetch,
    getUserToken,
    getWorkloadToken,
  });
  return { repo, fetcher, getUserToken, getWorkloadToken };
}

describe("private discovery read adapter (offline)", () => {
  it("preserves nullable values and opaque cursors, pushes filters to the engine, and revalidates authorization per read", async () => {
    const { repo, fetcher, getUserToken } = setup();
    const result = await repo.candidates({ classificationKind: "UNSUPPORTED_REVIEWABLE", limit: 1 });
    expect(result.items[0].latestObservation?.title).toBeNull();
    expect(result.items[0].classification?.kind).toBe("UNSUPPORTED_REVIEWABLE");
    expect(result.nextCursor).toBe("opaque-keyset");
    await repo.candidates({ cursor: result.nextCursor!, limit: 1 });
    expect(getUserToken).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.length).toBe(2);
    const url = String(fetcher.mock.calls[0][0]);
    expect(url).toContain("classificationKind=UNSUPPORTED_REVIEWABLE");
    expect(url).toContain("limit=1");
    expect(url).not.toContain("signed-user");
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer signed-user",
      "X-Serverless-Authorization": "Bearer signed-cloud-run",
    });
  });

  it.each([
    [400, "INVALID_REQUEST"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "READ_CONFLICT"],
    [503, "READ_UNAVAILABLE"],
  ] as const)("maps engine %s to %s safely", async (status, code) => {
    const { repo } = setup(status, { code, requestId: "safe" });
    await expect(repo.candidates()).rejects.toMatchObject({ code });
  });

  it("fails closed for a non-JSON upstream, oversized or malformed contract, and invalid page limits", async () => {
    const wrongType = setup(403, "Forbidden", "text/html");
    await expect(wrongType.repo.candidates()).rejects.toMatchObject({ code: "READ_UNAVAILABLE" });
    const invalid = setup(200, { items: [{ ...candidate, observationCount: "1" }], nextCursor: null });
    await expect(invalid.repo.candidates()).rejects.toMatchObject({ code: "INCOMPATIBLE_CONTRACT" });
    await expect(invalid.repo.candidates({ limit: 101 })).rejects.toBeInstanceOf(DiscoveryReadError);
  });

  it("separates known-source observations from new source candidates", async () => {
    const { repo } = setup(200, {
      items: [
        { ...candidate.latestObservation, candidateId: null, knownSourceId: "aa73b0ff-8001-4000-8000-111111111111" },
      ],
      nextCursor: null,
    });
    const result = await repo.executionObservations("20a2a2a2-1111-4000-8000-111111111111");
    expect(result.items[0].knownSourceId).not.toBeNull();
    expect(result.items[0].candidateId).toBeNull();
  });

  it.each([
    ["missing knownSourceId", { candidateId: null, knownSourceId: undefined }],
    ["missing candidateId", { candidateId: undefined, knownSourceId: null }],
    ["both null", { candidateId: null, knownSourceId: null }],
    ["both populated", { candidateId: candidate.id, knownSourceId: candidate.id }],
    ["empty candidateId", { candidateId: "", knownSourceId: null }],
    ["invalid knownSourceId", { candidateId: null, knownSourceId: "not-a-uuid" }],
  ])("rejects %s instead of displaying an observation without identity", async (_name, ids) => {
    const { repo } = setup(200, {
      items: [{ ...candidate.latestObservation, ...ids }],
      nextCursor: null,
    });
    await expect(repo.executionObservations("20a2a2a2-1111-4000-8000-111111111111")).rejects.toMatchObject({
      code: "INCOMPATIBLE_CONTRACT",
    });
  });

  it("rejects malformed or unrelated latest observation identities in candidate pages and details", async () => {
    const missingIdentity = {
      ...candidate,
      latestObservation: { ...candidate.latestObservation, candidateId: null, knownSourceId: undefined },
    };
    const wrongCandidate = {
      ...candidate,
      latestObservation: { ...candidate.latestObservation, candidateId: "aa73b0ff-8001-4000-8000-111111111111" },
    };
    for (const malformed of [missingIdentity, wrongCandidate]) {
      const page = setup(200, { items: [malformed], nextCursor: null });
      await expect(page.repo.candidates()).rejects.toMatchObject({ code: "INCOMPATIBLE_CONTRACT" });
      const detail = setup(200, { candidate: malformed, promotion: null });
      await expect(detail.repo.candidate(candidate.id)).rejects.toMatchObject({ code: "INCOMPATIBLE_CONTRACT" });
    }
  });

  it.each([
    ["providerKey as object", { providerKey: { value: "serpapi" } }],
    ["missing providerKey", { providerKey: undefined }],
    ["missing title", { title: undefined }],
    ["title as object", { title: { text: "Unsafe" } }],
    ["snippet as array", { snippet: ["unexpected"] }],
    ["resultPosition as text", { resultPosition: "1" }],
    ["missing resultPosition", { resultPosition: undefined }],
    ["invalid observedAt", { observedAt: 123 }],
    ["missing queryId", { queryId: undefined }],
    ["invalid executionId", { executionId: "unexpected" }],
    ["missing originalUrl", { originalUrl: undefined }],
  ])("rejects malformed observation %s before rendering", async (_label, fields) => {
    const observation = { ...candidate.latestObservation, ...fields };
    const page = setup(200, { items: [observation], nextCursor: null });
    await expect(page.repo.executionObservations(candidate.latestObservation.executionId)).rejects.toMatchObject({
      code: "INCOMPATIBLE_CONTRACT",
    });

    const latest = setup(200, {
      items: [{ ...candidate, latestObservation: observation }],
      nextCursor: null,
    });
    await expect(latest.repo.candidates()).rejects.toMatchObject({ code: "INCOMPATIBLE_CONTRACT" });
  });

  it("retains nullable observation fields and valid source/candidate provenance", async () => {
    const valid = { ...candidate.latestObservation, title: null, snippet: null, resultPosition: null };
    const page = setup(200, { items: [valid], nextCursor: null });
    const result = await page.repo.candidateObservations(candidate.id);
    expect(result.items[0].title).toBeNull();
    expect(result.items[0].resultPosition).toBeNull();
  });

  it("rejects valid DTO details whose identity does not match the requested UUID", async () => {
    const unrelatedId = "aa73b0ff-8001-4000-8000-111111111111";
    const wrongCandidate = {
      ...candidate,
      id: unrelatedId,
      latestObservation: { ...candidate.latestObservation, candidateId: unrelatedId },
    };
    const detail = setup(200, { candidate: wrongCandidate, promotion: null });
    await expect(detail.repo.candidate(candidate.id)).rejects.toMatchObject({ code: "INCOMPATIBLE_CONTRACT" });

    const execution = {
      id: unrelatedId,
      queryId: candidate.latestObservation.queryId,
      providerKey: "serpapi",
      status: "SUCCEEDED",
      submissionState: null,
      recoveryState: null,
      originalExecutionId: null,
      createdAt: "2026-10-09T08:00:00Z",
      startedAt: null,
      finishedAt: null,
      observed: 1,
      candidatesCreated: 1,
      candidatesReobserved: null,
      knownSources: null,
      invalidResults: null,
      providerFailures: null,
      countersVersion: 1,
      providerRequestCount: null,
      failureCode: null,
      queryExpression: null,
      cost: null,
    };
    const wrongExecution = setup(200, execution);
    await expect(wrongExecution.repo.execution(candidate.latestObservation.executionId)).rejects.toMatchObject({
      code: "INCOMPATIBLE_CONTRACT",
    });
  });

  it("rejects candidate observation pages for another candidate or a known source", async () => {
    const otherId = "aa73b0ff-8001-4000-8000-111111111111";
    for (const observation of [
      { ...candidate.latestObservation, candidateId: otherId },
      { ...candidate.latestObservation, candidateId: null, knownSourceId: otherId },
    ]) {
      const page = setup(200, { items: [observation], nextCursor: null });
      await expect(page.repo.candidateObservations(candidate.id)).rejects.toMatchObject({
        code: "INCOMPATIBLE_CONTRACT",
      });
    }
  });

  it("rejects an execution observation from a different execution even when its identity is valid", async () => {
    const observation = {
      ...candidate.latestObservation,
      executionId: "aa73b0ff-8001-4000-8000-111111111111",
    };
    const page = setup(200, { items: [observation], nextCursor: null });
    await expect(page.repo.executionObservations(candidate.latestObservation.executionId)).rejects.toMatchObject({
      code: "INCOMPATIBLE_CONTRACT",
    });
  });

  it("never activates fixtures in a deployed environment", () => {
    expect(getDiscoveryMode({ NODE_ENV: "production", VERCEL_ENV: "production", DISCOVERY_READ_MODE: "demo" })).toBe(
      "disabled",
    );
    expect(
      getDiscoveryMode({
        NODE_ENV: "production",
        APP_ENV: "staging",
        VERCEL_ENV: "preview",
        VERCEL_TARGET_ENV: "staging",
        DISCOVERY_READ_MODE: "staging",
      }),
    ).toBe("staging");
    expect(getDiscoveryMode({ NODE_ENV: "production", VERCEL_ENV: "preview", DISCOVERY_READ_MODE: "staging" })).toBe(
      "disabled",
    );
    expect(
      getDiscoveryMode({
        NODE_ENV: "production",
        APP_ENV: "staging",
        VERCEL_ENV: "preview",
        VERCEL_TARGET_ENV: "preview",
        DISCOVERY_READ_MODE: "staging",
      }),
    ).toBe("disabled");
    expect(
      getDiscoveryMode({
        NODE_ENV: "production",
        APP_ENV: "staging",
        VERCEL_ENV: "production",
        VERCEL_TARGET_ENV: "staging",
        DISCOVERY_READ_MODE: "staging",
      }),
    ).toBe("disabled");
    expect(
      getDiscoveryMode({
        NODE_ENV: "production",
        APP_ENV: "staging",
        VERCEL_ENV: "preview",
        VERCEL_TARGET_ENV: "staging",
        DISCOVERY_READ_MODE: "staging",
        ADMIN_DEV_AUTH_MODE: "enabled",
      }),
    ).toBe("disabled");
    expect(
      getDiscoveryMode({
        NODE_ENV: "development",
        APP_ENV: "development",
        ADMIN_DEV_AUTH_MODE: "enabled",
        APP_ORIGIN: "http://localhost:3000",
      }),
    ).toBe("demo");
    expect(() => parseStageConfig({ ENGINE_STAGING_BASE_URL: "http://localhost:9000" })).toThrow();
  });
});
