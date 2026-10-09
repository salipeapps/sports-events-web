import http from "node:http";
const revoked = new Set();
const inactive = new Set();
const issued = new Set();
let refreshCount = 0;
function user(id) {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: `${id}@example.test`,
    app_metadata: {},
    user_metadata: { role: "admin", is_active: true },
    created_at: new Date().toISOString(),
  };
}
function session(id, expired = false) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const result = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, exp: Math.floor(Date.now() / 1000) + (expired ? -10 : 3600), aud: "authenticated", role: "authenticated", session_id: id })}.fixture`,
    refresh_token: id,
    expires_in: expired ? -10 : 3600,
    token_type: "bearer",
    user: user(id),
  };
  issued.add(result.access_token);
  return result;
}
http
  .createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const url = new URL(req.url, "http://127.0.0.1:3201");
    const token = req.headers.authorization?.replace("Bearer ", "");
    let id;
    try {
      id = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
    } catch {
      /* Invalid token. */
    }
    const send = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (url.pathname === "/health") return send(200, {});
    if (url.pathname === "/fixture/stats") return send(200, { refreshCount });
    if (url.pathname === "/fixture/deactivate") {
      inactive.add(body.id);
      return send(200, {});
    }
    if (url.pathname.endsWith("/token")) {
      const subject = body.email?.split("@")[0] ?? body.refresh_token;
      if (body.refresh_token && revoked.has(subject)) return send(401, { msg: "Revoked refresh token" });
      if (body.password !== "Fixture-password-123" && !body.refresh_token)
        return send(400, { code: "invalid_credentials", msg: "Invalid login credentials" });
      revoked.delete(subject);
      inactive.delete(subject);
      if (body.refresh_token) refreshCount += 1;
      return send(200, session(subject, subject === "renewal" && !body.refresh_token));
    }
    if (url.pathname.endsWith("/recover")) return send(200, {});
    if (url.pathname.endsWith("/verify")) {
      if (body.token_hash !== "valid-fixture") return send(403, { msg: "Expired" });
      return send(200, session("admin"));
    }
    if (!id || !issued.has(token) || revoked.has(id) || id === "expired")
      return send(401, { code: "bad_jwt", msg: "Invalid JWT" });
    if (url.pathname.endsWith("/user")) return send(200, user(id));
    if (url.pathname.endsWith("/logout")) {
      revoked.add(id);
      return send(204, null);
    }
    if (url.pathname.endsWith("/admin_memberships"))
      return send(
        200,
        id === "outsider"
          ? null
          : { role: id === "reviewer" ? "reviewer" : "admin", is_active: id !== "inactive" && !inactive.has(id) },
      );
    return send(404, {});
  })
  .listen(3201, "127.0.0.1");
