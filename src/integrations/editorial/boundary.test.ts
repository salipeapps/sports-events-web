import { describe, expect, it, vi } from "vitest";
import type { DiscoveryTokenResult } from "@/integrations/auth/discoveryToken";
import {
  editorialB1Enabled,
  editorialConfig,
  handleEditorialB1,
  upstreamTimeoutMs,
  validateEditorialCommand,
} from "./boundary";
import { inspectionFixture } from "./inspection.fixture";
import { normalizeInspection } from "./inspection";

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/auth/supabaseServer", () => ({ createAuthClient: vi.fn() }));

const id = "ca73b0ff-8001-4000-8000-111111111111";
const actor = "20a2a2a2-1111-4000-8000-111111111111";
const key = "11a2a2a2-1111-4000-8000-111111111111";
const origin = "https://sports-events-web-staging.vercel.app";
const engine = "https://editorial-staging.example.org";
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  APP_ENV: "staging",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_TARGET_ENV: "production",
  VERCEL_PROJECT_ID: "prj_MU4pprIXpAdKUGcBPx8uWztULHxb",
  VERCEL_GIT_COMMIT_REF: "develop",
  APP_ORIGIN: origin,
  NEXT_PUBLIC_SUPABASE_URL: "https://yfytzogjrhwstcnzspdv.supabase.co",
  ADMIN_DEV_AUTH_MODE: "disabled",
  EDITORIAL_B1_ENABLED: "enabled",
  EDITORIAL_ENGINE_REVIEWED_SHA: "eb4f4f5604a27ec410cdb5342ea5ef89a8b4378c",
  EDITORIAL_ENGINE_STAGING_ORIGIN: engine,
  EDITORIAL_ENGINE_VERIFIED_ORIGIN: engine,
  ENGINE_COMMAND_STAGING_BASE_URL: "https://writer.a.run.app",
  ENGINE_STAGING_BASE_URL: "https://reader.a.run.app",
};
const reject = { action: "REJECT", expectedVersion: 1, expectedRevision: 1, reason: "Expired official listing" };
const approve = {
  action: "APPROVE",
  expectedVersion: 1,
  expectedRevision: 1,
  reason: "Official listing checked",
  verificationUrl: "https://example.org/current",
  category: "running",
};
const receipt = {
  commandKey: key,
  candidateIds: [id],
  publicationId: null,
  decisionId: id,
  candidateVersion: 1,
  revision: 2,
  status: "rejected",
  recordedAt: "2026-10-25T12:00:00Z",
};
function upstream(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function request(
  operation: "inspect" | "command" | "import",
  body: unknown = reject,
  headers: Record<string, string> = {},
) {
  const path =
    operation === "import"
      ? "/api/internal/editorial/imports"
      : "/api/internal/editorial/candidates/" + id + (operation === "command" ? "/commands" : "");
  const type = operation === "inspect" ? undefined : operation === "import" ? "text/csv" : "application/json";
  return new Request(origin + path, {
    method: operation === "inspect" ? "GET" : "POST",
    headers: {
      Host: new URL(origin).host,
      ...(type ? { Origin: origin, "Content-Type": type, "Idempotency-Key": key } : {}),
      ...headers,
    },
    ...(type ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
}
function setup(role: "admin" | "reviewer" = "admin", deployment: NodeJS.ProcessEnv = { ...env }) {
  const getAccess = vi
    .fn<() => Promise<DiscoveryTokenResult>>()
    .mockResolvedValue({ status: "authorized", role, subject: actor, accessToken: "private-jwt" });
  const getWorkloadToken = vi.fn(async () => "private-workload-token");
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(upstream(receipt));
  const deps = { env: deployment, getAccess, getWorkloadToken, fetcher };
  const run = (operation: "inspect" | "command" | "import", req = request(operation)) =>
    handleEditorialB1(req, operation, operation === "import" ? null : id, deps);
  return { getAccess, getWorkloadToken, fetcher, run, deps };
}

describe("B1 deployment and request constraints", () => {
  it("fails closed off-staging, with wrong pinned SHA or unverified origin", async () => {
    const disabled = [
      { EDITORIAL_B1_ENABLED: "disabled" },
      { APP_ENV: "production" },
      { VERCEL_ENV: "preview" },
      { VERCEL_PROJECT_ID: "prod" },
      { ADMIN_DEV_AUTH_MODE: "enabled" },
      { EDITORIAL_ENGINE_REVIEWED_SHA: undefined },
      { EDITORIAL_ENGINE_REVIEWED_SHA: "ae31d25a274a811ad75a93fa81ecc5aaeec07ea6" },
      { EDITORIAL_ENGINE_VERIFIED_ORIGIN: "https://wrong.a.run.app" },
      { EDITORIAL_ENGINE_STAGING_ORIGIN: "http://editorial.a.run.app" },
      { EDITORIAL_ENGINE_STAGING_ORIGIN: "https://127.0.0.1" },
      { EDITORIAL_ENGINE_STAGING_ORIGIN: "https://localhost" },
      { EDITORIAL_ENGINE_STAGING_ORIGIN: env.ENGINE_STAGING_BASE_URL },
    ];
    for (const change of disabled) {
      const configured = { ...env, ...change };
      const ctx = setup("admin", configured);
      expect((await ctx.run("command")).status).toBe(404);
      expect(ctx.getAccess).not.toHaveBeenCalled();
      expect(ctx.fetcher).not.toHaveBeenCalled();
    }
    expect(editorialB1Enabled({ NODE_ENV: "test" })).toBe(false);
    expect(editorialConfig(env).origin).toBe(engine);
  });

  it("enforces same-origin POST, valid UUID and idempotency key before user access", async () => {
    const ctx = setup();
    for (const req of [
      request("command", reject, { Origin: "https://evil.example" }),
      request("command", reject, { "Sec-Fetch-Site": "cross-site" }),
      request("command", reject, { "Idempotency-Key": "attacker" }),
      request("command", { ...reject, actorId: actor }),
      request("command", { ...reject, expectedVersion: 1.5 }),
    ])
      expect((await ctx.run("command", req)).status).not.toBe(200);
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it("never forwards mutations by reviewer when action requires admin", async () => {
    const ctx = setup("reviewer");
    const res = await ctx.run(
      "command",
      request("command", {
        action: "SUSPEND",
        expectedVersion: 1,
        expectedRevision: 1,
        reason: "Safety",
      }),
    );
    expect(res.status).toBe(403);
    expect(ctx.getWorkloadToken).not.toHaveBeenCalled();
    expect(ctx.fetcher).not.toHaveBeenCalled();
    const approved = await ctx.run("command", request("command", approve));
    expect(approved.status).toBe(200);
    expect(ctx.fetcher).toHaveBeenCalledOnce();
  });

  it("revalidates session and identity before HTTPS dispatch", async () => {
    const ctx = setup();
    ctx.getAccess
      .mockResolvedValueOnce({ status: "authorized", role: "admin", subject: actor, accessToken: "old" })
      .mockResolvedValueOnce({ status: "denied", code: "FORBIDDEN" });
    expect((await ctx.run("command")).status).toBe(403);
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it("uses the verified user bearer without legacy IAM and preserves the replay key", async () => {
    const ctx = setup();
    const response = await ctx.run("command");
    expect(response.status).toBe(200);
    const result = await response.text();
    expect(JSON.parse(result)).toEqual(receipt);
    expect(result).not.toContain("private-jwt");
    expect(ctx.fetcher).toHaveBeenCalledWith(
      engine + "/api/editorial/v1/candidates/" + id + "/commands",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        cache: "no-store",
        body: JSON.stringify(reject),
        headers: expect.objectContaining({
          Authorization: "Bearer private-jwt",
          "Idempotency-Key": key,
        }),
      }),
    );
    expect(ctx.getWorkloadToken).not.toHaveBeenCalled();
    expect(ctx.fetcher.mock.calls[0][1]?.headers).not.toHaveProperty("X-Serverless-Authorization");
  });

  it("strips private inspection payload and rejects malformed upstream response", async () => {
    const ctx = setup("reviewer");
    ctx.fetcher.mockResolvedValueOnce(
      upstream({
        ...inspectionFixture,
        revision: 2,
        data: { ...inspectionFixture.data, privateEvidence: "do not expose" },
        conflicts: [
          {
            id,
            fieldPath: "schedule",
            sourceUrl: "https://example.org/conflict",
            observedAt: "2026-10-25T12:00:00Z",
            valueSnapshot: "PRIVATE",
          },
        ],
        injectedAccessToken: "secret",
      }),
    );
    const response = await ctx.run("inspect");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      title: "Sport in Valencia",
      revision: 2,
      conflictCount: 1,
      organizerName: "Organizer",
      source: { name: "Official source" },
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|do not expose|injectedAccessToken|protectedPaths/);
    ctx.fetcher.mockResolvedValueOnce(upstream({ x: "unexpected" }));
    expect((await ctx.run("inspect")).status).toBe(503);
  });

  it("rejects unsafe evidence navigation and malformed domain fields", () => {
    const sample = structuredClone(inspectionFixture);
    sample.source.url = "https://example.org/current?token=private";
    expect(normalizeInspection(sample, id).source.url).toBeNull();
    for (const change of [
      { data: { ...sample.data, locations: [{}] } },
      { data: { ...sample.data, schedule: { ...sample.data.schedule, zoneId: "UTC" } } },
      { source: { ...sample.source, observedAt: "2026-02-30T00:00:00Z" } },
      { publicationId: "not-a-uuid" },
    ])
      expect(() => normalizeInspection({ ...sample, ...change }, id)).toThrow();
  });

  it("maps genuine 409 without a fake success, fails closed on 500", async () => {
    const ctx = setup();
    ctx.fetcher.mockResolvedValueOnce(upstream({ code: "CONFLICT" }, 409));
    const conflict = await ctx.run("command");
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ code: "CONFLICT" });
    ctx.fetcher.mockResolvedValueOnce(upstream({ code: "WRITE_UNAVAILABLE" }, 500));
    expect((await ctx.run("command")).status).toBe(503);
  });

  it("rejects import with reviewer and accepts exact normalized import for admin", async () => {
    const payload =
      "sourceId,externalId,sourceUrl,title,observedAt\n" +
      id +
      ",case,https://example.org,Running,2026-10-05T12:00:00Z\n";
    const reviewer = setup("reviewer");
    expect(
      (await reviewer.run("import", request("import", payload, { "X-Editorial-Reason": "Manual review" }))).status,
    ).toBe(403);
    expect(reviewer.fetcher).not.toHaveBeenCalled();
    const admin = setup();
    const response = await admin.run("import", request("import", payload, { "X-Editorial-Reason": "Manual review" }));
    expect(response.status).toBe(200);
    expect(admin.fetcher).toHaveBeenCalledWith(
      engine + "/api/editorial/v1/imports",
      expect.objectContaining({
        body: payload,
        headers: expect.objectContaining({ "X-Editorial-Reason": "Manual review", "Idempotency-Key": key }),
      }),
    );
  });

  it("enforces action shape, category and candidate version", () => {
    expect(validateEditorialCommand(approve).action).toBe("APPROVE");
    for (const payload of [
      { ...reject, actor: actor },
      { ...approve, verificationUrl: "http://example.org" },
      { ...reject, expectedVersion: 0 },
      { ...reject, reason: "" },
      { ...approve, category: "other;DROP TABLE" },
    ])
      expect(() => validateEditorialCommand(payload)).toThrow();
  });
});

it("requires a boolean explicit registration attestation when present", () => {
  expect(validateEditorialCommand({ ...approve, registrationVerified: true })).toMatchObject({
    registrationVerified: true,
  });
  for (const registrationVerified of [false, "true", null, 1])
    expect(() => validateEditorialCommand({ ...approve, registrationVerified })).toThrow();
  const raw = {
    ...inspectionFixture,
    data: {
      ...inspectionFixture.data,
      registration: {
        method: "WHATSAPP",
        destination: "+34600111222",
        evidenceUrl: "https://example.org/current",
        organizerPublished: true,
      },
    },
  };
  expect(normalizeInspection(raw, id)).toMatchObject({
    registrationSupported: true,
    data: { registration: { method: "WHATSAPP" } },
  });
  expect(() =>
    normalizeInspection(
      { ...raw, data: { ...raw.data, registration: { ...raw.data.registration, destination: "600111222" } } },
      id,
    ),
  ).toThrow();
});

it("rejects multichannel opt-in when only the legacy Engine SHA is pinned", async () => {
  expect(editorialB1Enabled(env)).toBe(true);
  expect(editorialB1Enabled({ ...env, EDITORIAL_REGISTRATION_ENABLED: "disabled" })).toBe(true);

  const mispaired = { ...env, EDITORIAL_REGISTRATION_ENABLED: "enabled" };
  expect(editorialB1Enabled(mispaired)).toBe(false);
  const ctx = setup("admin", mispaired);
  expect((await ctx.run("inspect")).status).toBe(404);
  expect(ctx.getAccess).not.toHaveBeenCalled();
  expect(ctx.fetcher).not.toHaveBeenCalled();
});

it("requires the exact coordinated Engine SHA and explicit registration gate", () => {
  const proposed = { ...env, EDITORIAL_ENGINE_REVIEWED_SHA: "fd593be3d44c48080fd211c2b390e0a055133e3a" };
  expect(editorialB1Enabled(proposed)).toBe(false);
  expect(editorialB1Enabled({ ...proposed, EDITORIAL_REGISTRATION_ENABLED: "enabled" })).toBe(true);
  expect(editorialB1Enabled({ ...proposed, EDITORIAL_REGISTRATION_ENABLED: "enabled", APP_ENV: "production" })).toBe(
    false,
  );
  expect(
    editorialB1Enabled({
      ...proposed,
      EDITORIAL_REGISTRATION_ENABLED: "enabled",
      EDITORIAL_ENGINE_REVIEWED_SHA: "unreviewed",
    }),
  ).toBe(false);
});

it("requires registration opt-in and every STAGING gate for the deployed Engine commit", () => {
  const current = { ...env, EDITORIAL_ENGINE_REVIEWED_SHA: "36480eea25d392a90050cf49466cf55dd478e392" };
  expect(editorialB1Enabled(current)).toBe(false);
  const optedIn = { ...current, EDITORIAL_REGISTRATION_ENABLED: "enabled" };
  expect(editorialB1Enabled(optedIn)).toBe(true);
  for (const change of [
    { APP_ENV: "production" },
    { EDITORIAL_B1_ENABLED: "disabled" },
    { DISCOVERY_STAGING_SMOKE_ENABLED: "enabled" },
    { EDITORIAL_ENGINE_REVIEWED_SHA: "36480eea25d392a90050cf49466cf55dd478e391" },
  ])
    expect(editorialB1Enabled({ ...optedIn, ...change })).toBe(false);
});

it("requires the explicit multichannel contract with the deployed Engine commit", async () => {
  const ctx = setup("admin", {
    ...env,
    EDITORIAL_REGISTRATION_ENABLED: "enabled",
    EDITORIAL_ENGINE_REVIEWED_SHA: "36480eea25d392a90050cf49466cf55dd478e392",
  });
  expect((await ctx.run("command", request("command", approve))).status).toBe(400);
  expect(
    (await ctx.run("command", request("command", { ...reject, action: "CORRECT", correction: inspectionFixture.data })))
      .status,
  ).toBe(400);
  expect(ctx.fetcher).not.toHaveBeenCalled();
  ctx.fetcher.mockResolvedValue(upstream(inspectionFixture));
  expect((await ctx.run("inspect")).status).toBe(503);
});

it("forwards revalidation only for admins, including with the existing staging configuration", async () => {
  const reverify = {
    ...reject,
    action: "REVERIFY",
    verificationUrl: approve.verificationUrl,
    registrationVerified: true,
  };
  for (const payload of [
    { ...reverify, registrationVerified: undefined },
    { ...reverify, registrationVerified: false },
    { ...reverify, category: "running" },
    { ...reverify, verificationUrl: "https://example.org/current?extra=1" },
  ]) {
    expect(() => validateEditorialCommand(JSON.parse(JSON.stringify(payload)))).toThrow();
  }

  const reviewer = setup("reviewer");
  expect((await reviewer.run("command", request("command", reverify))).status).toBe(403);
  expect(reviewer.fetcher).not.toHaveBeenCalled();

  const admin = setup();
  expect((await admin.run("command", request("command", reverify))).status).toBe(200);
  expect(admin.fetcher).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ body: JSON.stringify(reverify) }),
  );
});

it("never downgrades the explicitly selected registration contract to a legacy Engine", async () => {
  const deployment = {
    ...env,
    EDITORIAL_REGISTRATION_ENABLED: "enabled",
    EDITORIAL_ENGINE_REVIEWED_SHA: "fd593be3d44c48080fd211c2b390e0a055133e3a",
  };
  const ctx = setup("admin", deployment);
  expect((await ctx.run("command", request("command", approve))).status).toBe(400);
  expect(
    (await ctx.run("command", request("command", { ...reject, action: "CORRECT", correction: inspectionFixture.data })))
      .status,
  ).toBe(400);
  expect(ctx.fetcher).not.toHaveBeenCalled();
  ctx.fetcher.mockResolvedValue(upstream(inspectionFixture));
  expect((await ctx.run("inspect")).status).toBe(503);
  ctx.fetcher.mockResolvedValue(
    upstream({ ...inspectionFixture, data: { ...inspectionFixture.data, registration: null } }),
  );
  expect((await ctx.run("inspect")).status).toBe(200);
});

describe("registration approval preserves the saved evidence URI", () => {
  it.each(["https://example.org", "https://example.org/", "https://EXAMPLE.org", "https://example.org/a/../booking"])(
    "forwards the exact inspected evidence URL: %s",
    async (evidenceUrl) => {
      const ctx = setup("reviewer", {
        ...env,
        EDITORIAL_REGISTRATION_ENABLED: "enabled",
        EDITORIAL_ENGINE_REVIEWED_SHA: "fd593be3d44c48080fd211c2b390e0a055133e3a",
      });
      ctx.fetcher.mockResolvedValueOnce(
        upstream({
          ...inspectionFixture,
          data: {
            ...inspectionFixture.data,
            registration: { method: "WHATSAPP", destination: "+34600111222", evidenceUrl, organizerPublished: true },
          },
        }),
      );
      const inspectionResponse = await ctx.run("inspect");
      expect(inspectionResponse.status).toBe(200);
      const inspection = await inspectionResponse.json();
      expect(inspection.data.registration.evidenceUrl).toBe(evidenceUrl);
      const payload = {
        ...approve,
        registrationVerified: true,
        verificationUrl: inspection.data.registration.evidenceUrl,
      };
      const response = await ctx.run("command", request("command", payload));
      expect(response.status).toBe(200);
      // Java compares verificationUrl with the stored evidence URI: do not normalize either payload or replay.
      expect(ctx.fetcher.mock.calls[1][1]?.body).toBe(JSON.stringify(payload));
      expect(JSON.parse(ctx.fetcher.mock.calls[1][1]?.body as string).verificationUrl).toBe(evidenceUrl);
    },
  );

  it.each([
    "http://example.org/",
    "https://user:pass@example.org/",
    "https://example.org:443/",
    "https://example.org/?tracking=yes",
    "https://example.org/#fragment",
    "https://127.0.0.1/",
    "https://999.999.999.999/",
    "https://example.123/",
    "https://example.internal/",
    "https://example.org/%2e%2e/",
    "https://example.org/123456789",
    "https://example.org/abcdefghijklmnopqrstuvwxyz0123456789",
    "https://example.org/token",
  ])("rejects unsafe attested evidence before dispatch: %s", async (verificationUrl) => {
    const ctx = setup();
    expect(
      (await ctx.run("command", request("command", { ...approve, registrationVerified: true, verificationUrl })))
        .status,
    ).toBe(400);
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it("retains the legacy canonical URL policy without registration attestation", () => {
    expect(() => validateEditorialCommand({ ...approve, verificationUrl: "https://example.org" })).toThrow(
      "INVALID_REQUEST",
    );
  });
});

it("forwards an organizer-only CORRECT verbatim to admins and never for reviewers", async () => {
  const correction = {
    ...inspectionFixture.data,
    organizerId: "f5225129-1df5-4a37-b12f-41aa27c83943",
  };
  const payload = { ...reject, action: "CORRECT", correction };
  const reviewer = setup("reviewer");
  expect((await reviewer.run("command", request("command", payload))).status).toBe(403);
  expect(reviewer.fetcher).not.toHaveBeenCalled();
  const admin = setup("admin");
  expect((await admin.run("command", request("command", payload))).status).toBe(200);
  const forwarded = JSON.parse(admin.fetcher.mock.calls[0][1]?.body as string);
  expect(forwarded).toEqual(payload);
  expect(forwarded.correction.locations.every((location: { verified: boolean }) => !location.verified)).toBe(true);
});

describe("upstream time budget (#54 cold start)", () => {
  it("gives idempotent reads room for an Engine cold start and keeps commands short", () => {
    expect(upstreamTimeoutMs("inspect")).toBe(45_000);
    expect(upstreamTimeoutMs("command")).toBe(12_000);
    expect(upstreamTimeoutMs("import")).toBe(12_000);
  });

  it("lets the inspector route outlive its upstream read budget within the Hobby limit", async () => {
    const route = await import("@/app/api/internal/editorial/candidates/[id]/route");
    expect(route.maxDuration * 1000).toBeGreaterThanOrEqual(upstreamTimeoutMs("inspect") + 10_000);
    expect(route.maxDuration).toBeLessThanOrEqual(60);
  });
});

describe("Cloud Run invoker IAM (phase P, Engine #125)", () => {
  const idToken = ["fake-header", "fake-payload", "fake-signature"].join("."); // three segments only, not a JWT
  const withAudience = (audience: string | undefined) => ({ ...env, EDITORIAL_ENGINE_ID_TOKEN_AUDIENCE: audience });

  it("sends no Google identity while the Engine does not enforce invoker IAM", async () => {
    for (const deployment of [{ ...env }, withAudience("")]) {
      const ctx = setup("admin", deployment);
      expect((await ctx.run("command")).status).toBe(200);
      expect(ctx.getWorkloadToken).not.toHaveBeenCalled();
      const headers = ctx.fetcher.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers["X-Serverless-Authorization"]).toBeUndefined();
    }
  });

  it("adds the ID token only in X-Serverless-Authorization and keeps the user's JWT in Authorization", async () => {
    for (const operation of ["inspect", "command", "import"] as const) {
      const ctx = setup("admin", withAudience(engine));
      ctx.getWorkloadToken.mockResolvedValue(idToken);
      const body = operation === "import" ? "a,b\n" : reject;
      const response = await ctx.run(
        operation,
        request(operation, body, operation === "import" ? { "X-Editorial-Reason": "Reviewed import" } : {}),
      );
      expect(ctx.getWorkloadToken).toHaveBeenCalledWith(
        expect.objectContaining({ EDITORIAL_ENGINE_ID_TOKEN_AUDIENCE: engine }),
        engine,
      );
      expect(ctx.getWorkloadToken.mock.invocationCallOrder[0]).toBeGreaterThan(
        ctx.getAccess.mock.invocationCallOrder[1],
      );
      const headers = ctx.fetcher.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers["X-Serverless-Authorization"]).toBe("Bearer " + idToken);
      expect(headers.Authorization).toBe("Bearer private-jwt");
      expect(await response.text()).not.toContain(idToken);
    }
  });

  it("fails closed before calling the Engine when the identity cannot be obtained or is malformed", async () => {
    for (const outcome of [
      () => Promise.reject(new Error("sts down")),
      () => Promise.resolve("not-a-jwt"),
      () => Promise.resolve(""),
    ]) {
      const ctx = setup("admin", withAudience(engine));
      ctx.getWorkloadToken.mockImplementation(outcome);
      const response = await ctx.run("command");
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ code: "WRITE_UNAVAILABLE" });
      expect(ctx.fetcher).not.toHaveBeenCalled();
    }
  });

  it("refuses an audience that is not exactly the verified Engine origin", async () => {
    for (const audience of [engine + "/", "https://other.a.run.app", env.ENGINE_STAGING_BASE_URL]) {
      const ctx = setup("admin", withAudience(audience));
      expect((await ctx.run("command")).status).toBe(404);
      expect(ctx.getAccess).not.toHaveBeenCalled();
      expect(ctx.getWorkloadToken).not.toHaveBeenCalled();
      expect(ctx.fetcher).not.toHaveBeenCalled();
    }
    expect(editorialConfig(withAudience(engine)).idTokenAudience).toBe(engine);
    expect(editorialConfig(env).idTokenAudience).toBeNull();
  });
});

describe("Engine call diagnostics (#88)", () => {
  const email = "organizer-private@example.org";
  const correct = {
    ...reject,
    action: "CORRECT",
    reason: "Private reason " + email,
    correction: { registration: { method: "EMAIL", destination: email } },
  };
  function lines(spy: { mock: { calls: unknown[][] } }) {
    return spy.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith("MOUMEET_EDITORIAL_"));
  }
  function capture() {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    return { info, error, restore: () => (info.mockRestore(), error.mockRestore()) };
  }
  function field(line: string, name: string) {
    return line
      .split(" ")
      .find((part) => part.startsWith(name + "="))
      ?.slice(name.length + 1);
  }

  it("traces a command that timed out after it was sent with the response's request ID and its key", async () => {
    const log = capture();
    try {
      const ctx = setup();
      ctx.fetcher.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      const response = await ctx.run("command", request("command", correct));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ code: "WRITE_UNAVAILABLE" });
      const [line] = lines(log.error);
      expect(lines(log.info)).toEqual([]);
      expect(field(line, "request_id")).toBe(response.headers.get("x-request-id"));
      expect(field(line, "op")).toBe("b1.command");
      expect(field(line, "phase")).toBe("fetch");
      expect(field(line, "sent")).toBe("unknown");
      expect(field(line, "outcome")).toBe("timeout");
      expect(field(line, "budget_ms")).toBe("12000");
      expect(field(line, "elapsed_ms")).toMatch(/^\d+$/);
      expect(field(line, "command_key")).toBe(key);
      expect(field(line, "target")).toBe(id);
    } finally {
      log.restore();
    }
  });

  it("names the transport failure code and says nothing was sent when the identity failed first", async () => {
    const log = capture();
    try {
      const reset = setup();
      reset.fetcher.mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }));
      await reset.run("command");
      const noIdentity = setup("admin", { ...env, EDITORIAL_ENGINE_ID_TOKEN_AUDIENCE: engine });
      noIdentity.getWorkloadToken.mockRejectedValue(new Error("sts down"));
      await noIdentity.run("command");
      const [network, identity] = lines(log.error);
      expect([field(network, "outcome"), field(network, "cause"), field(network, "sent")]).toEqual([
        "network_error",
        "ECONNRESET",
        "unknown",
      ]);
      expect([field(identity, "phase"), field(identity, "sent")]).toEqual(["workload_token", "no"]);
      expect(noIdentity.fetcher).not.toHaveBeenCalled();
    } finally {
      log.restore();
    }
  });

  it("separates an Engine 503 or unreadable answer (error) from a receipt or a definite 409 (info)", async () => {
    const log = capture();
    try {
      const unavailable = setup();
      unavailable.fetcher.mockResolvedValue(upstream({ code: "WRITE_UNAVAILABLE" }, 503));
      expect((await unavailable.run("command")).status).toBe(503);
      const html = setup();
      html.fetcher.mockResolvedValue(new Response("<html>", { status: 200, headers: { "Content-Type": "text/html" } }));
      expect((await html.run("command")).status).toBe(503);
      const conflict = setup();
      conflict.fetcher.mockResolvedValue(upstream({ code: "CONFLICT" }, 409));
      expect((await conflict.run("command")).status).toBe(409);
      const ok = setup();
      const response = await ok.run("command");
      expect(response.status).toBe(200);
      const [engine503, unreadable] = lines(log.error);
      expect([field(engine503, "outcome"), field(engine503, "http_status"), field(engine503, "sent")]).toEqual([
        "http_error",
        "503",
        "yes",
      ]);
      expect([field(unreadable, "outcome"), field(unreadable, "cause")]).toEqual(["rejected", "INCOMPATIBLE_CONTRACT"]);
      const [definite, receipt] = lines(log.info);
      expect(field(definite, "http_status")).toBe("409");
      expect([field(receipt, "outcome"), field(receipt, "request_id")]).toEqual([
        "ok",
        response.headers.get("x-request-id"),
      ]);
    } finally {
      log.restore();
    }
  });

  it("writes no token, reason, body, URL or contact data", async () => {
    const log = capture();
    try {
      const ctx = setup("admin", { ...env, EDITORIAL_ENGINE_ID_TOKEN_AUDIENCE: engine });
      ctx.getWorkloadToken.mockResolvedValue("aaa.bbb.ccc");
      await ctx.run("command", request("command", correct));
      ctx.fetcher.mockRejectedValue(new TypeError("fetch failed " + email, { cause: { code: email } }));
      await ctx.run("command", request("command", correct));
      const all = [...lines(log.info), ...lines(log.error)];
      expect(all).toHaveLength(2);
      for (const line of all) {
        for (const secret of ["private-jwt", "aaa.bbb.ccc", email, "Private reason", engine, "registration"])
          expect(line).not.toContain(secret);
        expect(line).toMatch(/^MOUMEET_EDITORIAL_ENGINE_CALL( [a-z_]+=[A-Za-z0-9._-]+)+$/);
      }
    } finally {
      log.restore();
    }
  });
});
