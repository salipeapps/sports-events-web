import { generateKeyPairSync, sign } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { verifyDiscoveryAccessToken } from "./discoveryToken";

vi.mock("server-only", () => ({}));
vi.mock("./supabaseServer", () => ({ createAuthClient: vi.fn() }));
const subject = "00000000-0000-4000-a000-000000000026";
const issuer = "https://yfytzogjrhwstcnzspdv.supabase.co/auth/v1";
function fixture(role = "admin", overrides: Record<string, unknown> = {}) {
  const claims = {
    sub: subject,
    iss: issuer,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: false,
    iat: Math.floor(Date.now() / 1000) - 10,
    exp: Math.floor(Date.now() / 1000) + 300,
    app_metadata: { discovery_role: role },
    user_metadata: { discovery_role: "admin" },
    ...overrides,
  };
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: subject, is_anonymous: false } }, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: { role, is_active: true }, error: null });
  const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: "opaque-bearer" } }, error: null });
  const getClaims = vi.fn().mockResolvedValue({ data: { claims, header: { alg: "ES256" } }, error: null });
  const client = {
    auth: { getUser, getSession, getClaims },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
  };
  return { client: client as unknown as SupabaseClient, getUser, getSession, getClaims, maybeSingle };
}
describe("server discovery bearer boundary", () => {
  it.each(["admin", "reviewer"])("forwards a verified matching %s bearer", async (role) => {
    const f = fixture(role);
    expect(await verifyDiscoveryAccessToken(f.client, issuer)).toEqual({
      status: "authorized",
      accessToken: "opaque-bearer",
      subject,
      role,
    });
    expect(f.getClaims).toHaveBeenCalledWith("opaque-bearer");
    expect(f.getUser).toHaveBeenNthCalledWith(2, "opaque-bearer");
    expect(f.getUser.mock.invocationCallOrder[0]).toBeLessThan(f.maybeSingle.mock.invocationCallOrder[0]);
    expect(f.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(f.getSession.mock.invocationCallOrder[0]);
  });
  it.each([null, { role: "admin", is_active: false }, { role: "owner", is_active: true }])(
    "denies invalid membership %j before retrieving tokens",
    async (data) => {
      const f = fixture();
      f.maybeSingle.mockResolvedValue({ data, error: null });
      expect(await verifyDiscoveryAccessToken(f.client, issuer)).toEqual({ status: "denied", code: "FORBIDDEN" });
      expect(f.getSession).not.toHaveBeenCalled();
    },
  );
  it.each([
    { app_metadata: {} },
    { app_metadata: { discovery_role: "reviewer" } },
    { app_metadata: { discovery_role: "owner" } },
  ])("rejects missing/stale roles despite editable metadata %j", async (claims) => {
    expect(await verifyDiscoveryAccessToken(fixture("admin", claims).client, issuer)).toEqual({
      status: "denied",
      code: "FORBIDDEN",
    });
  });
  it.each([
    { exp: 1 },
    { iat: 9999999999 },
    { iss: "https://other.test/auth/v1" },
    { aud: "service_role" },
    { role: "service_role" },
    { sub: "00000000-0000-4000-a000-000000000027" },
    { is_anonymous: true },
    { exp: undefined },
    { iat: undefined },
    { nbf: 9999999999 },
  ])("rejects incompatible JWT claims %j", async (claims) => {
    expect(await verifyDiscoveryAccessToken(fixture("admin", claims).client, issuer)).toEqual({
      status: "denied",
      code: "UNAUTHENTICATED",
    });
  });
  it("denies HS256 even if Auth accepts it", async () => {
    const f = fixture();
    f.getClaims.mockResolvedValue({ data: { claims: {}, header: { alg: "HS256" } }, error: null });
    expect((await verifyDiscoveryAccessToken(f.client, issuer)).status).toBe("denied");
  });
  it("denies invalid identity before membership lookup", async () => {
    const f = fixture();
    f.getUser.mockResolvedValue({ data: { user: null }, error: new Error("secret") });
    expect(await verifyDiscoveryAccessToken(f.client, issuer)).toEqual({ status: "denied", code: "UNAUTHENTICATED" });
    expect(f.maybeSingle).not.toHaveBeenCalled();
  });
  it("denies revoked/refreshed bearer identity and safely handles provider errors", async () => {
    const f = fixture();
    f.getUser
      .mockResolvedValueOnce({ data: { user: { id: subject } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: new Error("token secret") });
    expect(await verifyDiscoveryAccessToken(f.client, issuer)).toEqual({ status: "denied", code: "UNAUTHENTICATED" });
    f.getUser.mockRejectedValue(new Error("database credential secret"));
    expect(JSON.stringify(await verifyDiscoveryAccessToken(f.client, issuer))).not.toContain("secret");
  });
  it.each(["RS256", "ES256"])("verifies real %s signatures with Supabase SDK and rejects tampering", async (alg) => {
    const { privateKey, publicKey } =
      alg === "RS256"
        ? generateKeyPairSync("rsa", { modulusLength: 2048 })
        : generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const kid = `offline-${alg}`;
    const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg, use: "sig" };
    const sdk = createClient("https://offline.supabase.co", "sb_publishable_fixture_only", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async () =>
          new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json" } }),
      },
    });
    const f = fixture();
    const payload = f.getClaims.getMockImplementation()!;
    const claims = (await payload()).data.claims;
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const body = `${encode({ alg, kid, typ: "JWT" })}.${encode(claims)}`;
    const token = `${body}.${sign("sha256", Buffer.from(body), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
    f.client.auth.getClaims = sdk.auth.getClaims.bind(sdk.auth);
    f.getSession.mockResolvedValue({ data: { session: { access_token: token } }, error: null });
    expect((await verifyDiscoveryAccessToken(f.client, issuer)).status).toBe("authorized");
    f.getSession.mockResolvedValue({
      data: { session: { access_token: `${body}.${Buffer.alloc(256).toString("base64url")}` } },
      error: null,
    });
    expect(await verifyDiscoveryAccessToken(f.client, issuer)).toEqual({ status: "denied", code: "UNAUTHENTICATED" });
  });
});
