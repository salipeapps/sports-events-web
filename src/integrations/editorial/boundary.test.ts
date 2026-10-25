import { describe, expect, it, vi } from "vitest";
import type { DiscoveryTokenResult } from "@/integrations/auth/discoveryToken";
import { editorialB1Enabled, editorialConfig, handleEditorialB1, validateEditorialCommand } from "./boundary";

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/auth/supabaseServer", () => ({ createAuthClient: vi.fn() }));

const id = "ca73b0ff-8001-4000-8000-111111111111";
const actor = "20a2a2a2-1111-4000-8000-111111111111";
const key = "11a2a2a2-1111-4000-8000-111111111111";
const origin = "https://sports-events-web-staging.vercel.app";
const engine = "https://editorial.a.run.app";
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "production", APP_ENV: "staging", VERCEL: "1", VERCEL_ENV: "production",
  VERCEL_TARGET_ENV: "production", VERCEL_PROJECT_ID: "prj_MU4pprIXpAdKUGcBPx8uWztULHxb",
  VERCEL_GIT_COMMIT_REF: "develop", APP_ORIGIN: origin,
  NEXT_PUBLIC_SUPABASE_URL: "https://yfytzogjrhwstcnzspdv.supabase.co",
  ADMIN_DEV_AUTH_MODE: "disabled",
  EDITORIAL_B1_ENABLED: "enabled",
  EDITORIAL_ENGINE_REVIEWED_SHA: "ff49e563b6016bdcb5062fde92eef5a2e5894f9a",
  EDITORIAL_ENGINE_STAGING_ORIGIN: engine, EDITORIAL_ENGINE_VERIFIED_ORIGIN: engine,
  EDITORIAL_ENGINE_STAGING_ID_TOKEN_AUDIENCE: engine,
  GCP_EDITORIAL_INVOKER_SERVICE_ACCOUNT_EMAIL: "editorial@offline.iam.gserviceaccount.com",
  GCP_COMMAND_INVOKER_SERVICE_ACCOUNT_EMAIL: "writer@offline.iam.gserviceaccount.com",
  GCP_INVOKER_SERVICE_ACCOUNT_EMAIL: "reader@offline.iam.gserviceaccount.com",
  ENGINE_COMMAND_STAGING_BASE_URL: "https://writer.a.run.app",
  ENGINE_STAGING_BASE_URL: "https://reader.a.run.app",
};
const reject = { action: "REJECT", expectedVersion: 1, expectedRevision: 1, reason: "Expired official listing" };
const approve = {
  action: "APPROVE", expectedVersion: 1, expectedRevision: 1, reason: "Official listing checked",
  verificationUrl: "https://example.org/current", category: "running",
};
const receipt = {
  commandKey: key, candidateIds: [id], publicationId: null, decisionId: id,
  candidateVersion: 1, revision: 2, status: "rejected", recordedAt: "2026-10-25T12:00:00Z",
};
function upstream(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function request(operation: "inspect" | "command" | "import", body: unknown = reject, headers: Record<string,string> = {}) {
  const path = operation === "import" ? "/api/internal/editorial/imports" :
    "/api/internal/editorial/candidates/" + id + (operation === "command" ? "/commands" : "");
  const type = operation === "inspect" ? undefined : operation === "import" ? "text/csv" : "application/json";
  return new Request(origin + path, {
    method: operation === "inspect" ? "GET" : "POST",
    headers: { Host: new URL(origin).host, ...(type ? { Origin: origin, "Content-Type": type, "Idempotency-Key": key } : {}),
      ...headers },
    ...(type ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
}
function setup(role: "admin" | "reviewer" = "admin", deployment: NodeJS.ProcessEnv = { ...env }) {
  const getAccess = vi.fn<() => Promise<DiscoveryTokenResult>>()
    .mockResolvedValue({ status: "authorized", role, subject: actor, accessToken: "private-jwt" });
  const getWorkloadToken = vi.fn(async () => "private-workload-token");
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(upstream(receipt));
  const deps = { env: deployment, getAccess, getWorkloadToken, fetcher };
  const run = (operation: "inspect" | "command" | "import", req = request(operation)) =>
    handleEditorialB1(req, operation, operation === "import" ? null : id, deps);
  return { getAccess, getWorkloadToken, fetcher, run, deps };
}

describe("B1 deployment and request constraints", () => {
  it("fails closed off-staging, with wrong pinned SHA, URL or IAM principal", async () => {
    const disabled = [
      { EDITORIAL_B1_ENABLED: "disabled" }, { APP_ENV: "production" }, { VERCEL_ENV: "preview" },
      { VERCEL_PROJECT_ID: "prod" }, { ADMIN_DEV_AUTH_MODE: "enabled" },
      { EDITORIAL_ENGINE_REVIEWED_SHA: undefined }, { EDITORIAL_ENGINE_VERIFIED_ORIGIN: "https://wrong.a.run.app" },
      { EDITORIAL_ENGINE_STAGING_ORIGIN: "http://editorial.a.run.app" },
      { GCP_EDITORIAL_INVOKER_SERVICE_ACCOUNT_EMAIL: env.GCP_INVOKER_SERVICE_ACCOUNT_EMAIL },
    ];
    for (const change of disabled) {
      const configured = { ...env, ...change };
      const ctx = setup("admin", configured);
      expect((await ctx.run("command")).status).toBe(404);
      expect(ctx.getAccess).not.toHaveBeenCalled();
      expect(ctx.fetcher).not.toHaveBeenCalled();
    }
    expect(editorialB1Enabled({})).toBe(false);
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
    ]) expect((await ctx.run("command", req)).status).not.toBe(200);
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it("never forwards mutations by reviewer when action requires admin", async () => {
    const ctx = setup("reviewer");
    const res = await ctx.run("command", request("command", {
      action: "SUSPEND", expectedVersion: 1, expectedRevision: 1, reason: "Safety",
    }));
    expect(res.status).toBe(403);
    expect(ctx.getWorkloadToken).not.toHaveBeenCalled();
    expect(ctx.fetcher).not.toHaveBeenCalled();
    const approved = await ctx.run("command", request("command", approve));
    expect(approved.status).toBe(200);
    expect(ctx.fetcher).toHaveBeenCalledOnce();
  });

  it("revalidates session and identity after workload-token exchange", async () => {
    const ctx = setup();
    ctx.getAccess.mockResolvedValueOnce({ status: "authorized", role: "admin", subject: actor, accessToken: "old" })
      .mockResolvedValueOnce({ status: "denied", code: "FORBIDDEN" });
    expect((await ctx.run("command")).status).toBe(403);
    expect(ctx.fetcher).not.toHaveBeenCalled();
  });

  it("forwards only dedicated credentials and the exact replay key, without redirects", async () => {
    const ctx = setup();
    const response = await ctx.run("command");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(receipt);
    expect(ctx.fetcher).toHaveBeenCalledWith(engine + "/api/editorial/v1/candidates/" + id + "/commands",
      expect.objectContaining({
        method: "POST", redirect: "error", cache: "no-store", body: JSON.stringify(reject),
        headers: expect.objectContaining({
          Authorization: "Bearer private-jwt", "X-Serverless-Authorization": "Bearer private-workload-token",
          "Idempotency-Key": key,
        }),
      }));
    expect(JSON.stringify(await response.text())).not.toContain("private-jwt");
  });

  it("strips private inspection payload and rejects malformed upstream response", async () => {
    const ctx = setup("reviewer");
    ctx.fetcher.mockResolvedValueOnce(upstream({
      candidateId: id, candidateVersion: 1, revision: 2, status: "in_review",
      data: { title: "Sport in Valencia", privateEvidence: "do not expose" },
      conflicts: [{ id, fieldPath: "schedule", sourceUrl: "https://private.example" }],
      moreConflicts: false, injectedAccessToken: "secret",
    }));
    const response = await ctx.run("inspect");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      candidateId: id, candidateVersion: 1, revision: 2, status: "in_review",
      title: "Sport in Valencia", conflictCount: 1, moreConflicts: false,
    });
    ctx.fetcher.mockResolvedValueOnce(upstream({ x: "unexpected" }));
    expect((await ctx.run("inspect")).status).toBe(503);
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
    const payload = "sourceId,externalId,sourceUrl,title,observedAt\n" +
      id + ",case,https://example.org,Running,2026-10-05T12:00:00Z\n";
    const reviewer = setup("reviewer");
    expect((await reviewer.run("import", request("import", payload, { "X-Editorial-Reason": "Manual review" }))).status).toBe(403);
    expect(reviewer.fetcher).not.toHaveBeenCalled();
    const admin = setup();
    const response = await admin.run("import", request("import", payload, { "X-Editorial-Reason": "Manual review" }));
    expect(response.status).toBe(200);
    expect(admin.fetcher).toHaveBeenCalledWith(engine + "/api/editorial/v1/imports",
      expect.objectContaining({ body: payload,
        headers: expect.objectContaining({ "X-Editorial-Reason": "Manual review", "Idempotency-Key": key }) }));
  });

  it("enforces action shape, category and candidate version", () => {
    expect(validateEditorialCommand(approve).action).toBe("APPROVE");
    for (const payload of [{ ...reject, actor: actor }, { ...approve, verificationUrl: "http://example.org" },
      { ...reject, expectedVersion: 0 }, { ...reject, reason: "" },
      { ...approve, category: "other;DROP TABLE" }]) expect(() => validateEditorialCommand(payload)).toThrow();
  });
});
