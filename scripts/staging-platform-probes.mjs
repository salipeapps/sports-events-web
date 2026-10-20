// #94 — STAGING-only service-health probes. Never invoked by CI or deployments.
// Offline by default. No owner/service_role, no database DDL, no secrets in reports.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const STAGING_REF = "yfytzogjrhwstcnzspdv";
export const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

export function parseArgs(argv) {
  const allowed = new Set(["--execute", "--phase=before", "--phase=after", "--refresh", "--storage-write", "--pooler"]);
  for (const arg of argv) assert(allowed.has(arg), "UNKNOWN_OPTION");
  const phase = argv.includes("--phase=before") ? "before" : argv.includes("--phase=after") ? "after" : null;
  assert(!(argv.includes("--phase=before") && argv.includes("--phase=after")), "AMBIGUOUS_PHASE");
  const execute = argv.includes("--execute");
  assert(!execute || phase, "PHASE_REQUIRED");
  assert(!argv.includes("--storage-write") || execute, "LIVE_REQUIRED_FOR_STORAGE");
  assert(!argv.includes("--pooler") || execute, "LIVE_REQUIRED_FOR_POOLER");
  return {
    execute,
    phase,
    refresh: argv.includes("--refresh"),
    storageWrite: argv.includes("--storage-write"),
    pooler: argv.includes("--pooler"),
  };
}

export function validateTarget(env) {
  assert.equal(env.STAGING_PROBE_SUPABASE_URL, STAGING_URL, "WRONG_SUPABASE_TARGET");
  assert.match(env.STAGING_PROBE_PUBLISHABLE_KEY ?? "", /^sb_publishable_[a-zA-Z0-9_-]+$/, "PUBLISHABLE_KEY_REQUIRED");
  assert.equal(env.STAGING_PLATFORM_PROBE_APPROVED, "yes", "APPROVAL_REQUIRED");
  assert.match(env.STAGING_PLATFORM_PROBE_TICKET ?? "", /^[A-Za-z0-9][A-Za-z0-9._-]{5,100}$/, "CHANGE_TICKET_REQUIRED");
  assert.match(env.STAGING_PROBE_EMAIL ?? "", /^[^@\s]+@[^@\s]+\.[^@\s]+$/, "INVITED_TEST_ACCOUNT_REQUIRED");
  assert.ok((env.STAGING_PROBE_PASSWORD ?? "").length >= 12, "TEST_PASSWORD_REQUIRED");
  assert.match(
    env.STAGING_PROBE_EXPECTED_USER_UUID ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "PINNED_AUTH_SUBJECT_REQUIRED",
  );
}

export function validatePooler(env) {
  assert.match(env.STAGING_POOLER_HOST ?? "", /^[a-z0-9-]+\.pooler\.supabase\.com$/, "INVALID_POOLER_HOST");
  assert.equal(env.STAGING_POOLER_PORT, "5432", "SESSION_POOLER_PORT_REQUIRED");
  assert.equal(env.STAGING_POOLER_USER, `engine_discovery_reader.${STAGING_REF}`, "READER_LOGIN_REQUIRED");
  assert.ok((env.STAGING_POOLER_PASSWORD ?? "").length > 0, "POOLER_PASSWORD_REQUIRED");
  assert.ok(env.STAGING_POOLER_CA && existsSync(env.STAGING_POOLER_CA), "TLS_CA_FILE_REQUIRED");
}

function clientFor(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }) },
  });
}

async function timebox(task, ms = 14000) {
  let timer;
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("TEST_TIMEOUT")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function realtimeBroadcast(client, token, runId) {
  client.realtime.setAuth(token);
  const topic = `staging-acl-smoke-${runId}`;
  const event = "temp_acl_probe";
  let received;
  const incoming = new Promise((resolve) => {
    received = resolve;
  });
  const channel = client
    .channel(topic, { config: { broadcast: { self: true, ack: true } } })
    .on("broadcast", { event }, ({ payload }) => {
      if (payload?.nonce === runId) received(true);
    });
  try {
    await timebox(
      new Promise((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
            reject(new Error("REALTIME_SUBSCRIBE_FAILED"));
        });
      }),
    );
    assert.equal(
      await timebox(channel.send({ type: "broadcast", event, payload: { nonce: runId } })),
      "ok",
      "REALTIME_SEND_FAILED",
    );
    assert.equal(await timebox(incoming), true, "REALTIME_RECEIVE_FAILED");
  } finally {
    await timebox(client.removeChannel(channel), 4000).catch(() => {});
    client.realtime.disconnect();
  }
}

async function readStorage(client, env) {
  const bucket = env.STAGING_STORAGE_BUCKET;
  const object = env.STAGING_STORAGE_OBJECT;
  assert.ok(bucket && object && !object.startsWith("/") && !object.includes(".."), "APPROVED_STORAGE_FIXTURE_REQUIRED");
  const lastSlash = object.lastIndexOf("/");
  const prefix = lastSlash < 0 ? "" : object.slice(0, lastSlash);
  const name = object.slice(lastSlash + 1);
  let found = false;
  // Search on the server first; paginate for folders containing many fixtures.
  for (let offset = 0; offset < 2000; offset += 100) {
    const { data: list, error: listError } = await client.storage.from(bucket).list(prefix, {
      search: name,
      limit: 100,
      offset,
    });
    assert.ifError(listError);
    if (list?.some((entry) => entry.name === name)) {
      found = true;
      break;
    }
    if (!list || list.length < 100) break;
  }
  assert.ok(found, "STORAGE_FIXTURE_NOT_LISTED");
  const { data, error } = await client.storage.from(bucket).download(object);
  assert.ifError(error);
  assert.ok(data && data.size > 0, "STORAGE_FIXTURE_EMPTY");
}

async function writeStorageFixture(client, env, runId) {
  assert.equal(env.STAGING_STORAGE_WRITE_APPROVED, "yes", "STORAGE_WRITE_APPROVAL_REQUIRED");
  const bucket = env.STAGING_STORAGE_BUCKET;
  assert.ok(bucket, "APPROVED_STORAGE_BUCKET_REQUIRED");
  const name = `__staging-acl-smoke__/${runId}.txt`;
  let uploadAttempted = false;
  let cleanupOk = false;
  try {
    // A timed-out upload may still have succeeded; cleanup must not depend on its acknowledgement.
    uploadAttempted = true;
    const { error } = await client.storage.from(bucket).upload(name, new TextEncoder().encode("staging-ACL-smoke\n"), {
      contentType: "text/plain",
      upsert: false,
    });
    assert.ifError(error);
    const downloaded = await client.storage.from(bucket).download(name);
    assert.ifError(downloaded.error);
    assert.ok(downloaded.data && downloaded.data.size > 0, "STORAGE_WRITE_READBACK_FAILED");
  } finally {
    if (uploadAttempted) {
      try {
        const result = await timebox(client.storage.from(bucket).remove([name]), 12000);
        cleanupOk = !result.error;
      } catch {
        cleanupOk = false;
      }
    }
    assert.ok(cleanupOk, "STORAGE_CLEANUP_UNVERIFIED");
  }
}

// These are stable error categories only; raw psql stderr is NEVER logged or returned.
export function classifyPoolerFailure(stderr) {
  const message = String(stderr ?? "");
  if (/service file.*not found/i.test(message)) return "POOLER_SERVICE_FILE_ERROR";
  if (/tenant.*not found|no tenant|invalid tenant|unknown tenant|user not found/i.test(message))
    return "POOLER_USER_OR_TENANT";
  if (/password authentication failed|authentication failed|invalid password|SASL.*failed|SCRAM.*failed/i.test(message))
    return "POOLER_AUTH_REJECTED";
  if (
    /server certificate.*does not match|hostname mismatch|certificate verify failed|root certificate|SSL error.*certif/i.test(
      message,
    )
  )
    return "POOLER_TLS_ERROR";
  if (
    /unsupported startup|unsupported parameter|invalid option|invalid startup|invalid configuration parameter/i.test(
      message,
    )
  )
    return "POOLER_STARTUP_OPTION_REJECTED";
  if (/could not translate host name|name or service not known|no such host/i.test(message)) return "POOLER_DNS_ERROR";
  if (
    /timed out|timeout|connection refused|network is unreachable|no route to host|could not connect to server/i.test(
      message,
    )
  )
    return "POOLER_NETWORK_ERROR";
  return "POOLER_CONNECTION_FAILED";
}

// Match the independently successful Cloud Shell Session Pooler probe.
// libpq may treat PGSERVICEFILE="" as a filename and fail before contacting
// PostgreSQL. Unset service-file configuration rather than passing empty values.
// Supavisor can reject PGOPTIONS startup parameters: enforce read-only in SQL
// and bound the psql process instead. Keep verify-full TLS and disable GSSAPI.
export function poolerPsqlEnv(env, ambient = process.env) {
  const settings = {
    ...ambient,
    PGHOST: env.STAGING_POOLER_HOST,
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: env.STAGING_POOLER_USER,
    PGPASSWORD: env.STAGING_POOLER_PASSWORD,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: env.STAGING_POOLER_CA,
    PGCONNECT_TIMEOUT: "5",
    PGGSSENCMODE: "disable",
  };
  delete settings.PGSERVICE;
  delete settings.PGSERVICEFILE;
  delete settings.PGOPTIONS;
  return settings;
}

export const POOLER_READ_ONLY_SQL =
  "BEGIN TRANSACTION READ ONLY; SELECT current_database(),current_user,session_user,has_database_privilege(current_user,current_database(),'TEMPORARY'),has_database_privilege(current_user,current_database(),'CREATE'); ROLLBACK;";

async function checkPooler(env, phase) {
  validatePooler(env);
  const sql = POOLER_READ_ONLY_SQL;
  const settings = poolerPsqlEnv(env);
  const out = await timebox(
    new Promise((resolve, reject) => {
      const child = spawn("psql", ["-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
        env: settings,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk.toString().slice(0, 512);
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        // In memory only, bounded and never serialized to stdout/report.
        if (stderr.length < 1024) stderr += chunk.toString().slice(0, 1024 - stderr.length);
      });
      const killOnTimeout = setTimeout(() => child.kill("SIGKILL"), 10000);
      child.on("error", () => {
        clearTimeout(killOnTimeout);
        reject(new Error("PSQL_UNAVAILABLE"));
      });
      child.on("close", (code) => {
        clearTimeout(killOnTimeout);
        if (code === 0) resolve(output);
        else reject(new Error(classifyPoolerFailure(stderr)));
      });
    }),
    12000,
  );
  const record = out.split(/\r?\n/).find((line) => line.startsWith("postgres|"));
  assert.equal(
    record,
    `postgres|engine_discovery_reader|engine_discovery_reader|${phase === "before" ? "t" : "f"}|f`,
    "POOLER_ROLE_OR_PRIVILEGE_MISMATCH",
  );
}

export function blockedAuthenticatedProbes(storageWrite) {
  const names = ["Data API own-row RLS", "Storage list and download", "Realtime subscribe and self-broadcast"];
  if (storageWrite) names.push("Storage approved upload/download/delete");
  return names.map((name) => ({ name, status: "BLOCKED" }));
}

export async function run(argv, env = process.env) {
  const args = parseArgs(argv);
  if (!args.execute)
    return {
      mode: "OFFLINE",
      tests: ["Auth", "Data API/RLS", "Storage read", "Realtime", "Supavisor", "private reader via Vercel"],
      result: "NOT_RUN",
    };
  validateTarget(env);
  if (args.storageWrite) assert.equal(env.STAGING_STORAGE_WRITE_APPROVED, "yes", "STORAGE_WRITE_APPROVAL_REQUIRED");
  if (args.pooler) validatePooler(env);
  const client = clientFor(STAGING_URL, env.STAGING_PROBE_PUBLISHABLE_KEY);
  const storageFixtureRunId = args.storageWrite ? crypto.randomUUID() : null;
  const results = [];
  const check = async (name, fn) => {
    try {
      await fn();
      results.push({ name, status: "PASS" });
    } catch {
      results.push({ name, status: "FAIL" });
    }
  };
  let session;
  let userId;
  let role;
  await check("Auth login and getUser", async () => {
    const login = await timebox(
      client.auth.signInWithPassword({ email: env.STAGING_PROBE_EMAIL, password: env.STAGING_PROBE_PASSWORD }),
    );
    assert.ifError(login.error);
    assert.ok(login.data.session?.access_token && login.data.user?.id, "AUTH_SESSION_MISSING");
    session = login.data.session;
    const verified = await timebox(client.auth.getUser());
    assert.ifError(verified.error);
    assert.equal(verified.data.user?.id, login.data.user.id, "AUTH_USER_MISMATCH");
    assert.equal(login.data.user.id, env.STAGING_PROBE_EXPECTED_USER_UUID, "PINNED_AUTH_SUBJECT_MISMATCH");
    userId = login.data.user.id;
  });
  if (args.refresh)
    await check("Auth refresh", async () => {
      assert.ok(session?.refresh_token, "REFRESH_TOKEN_REQUIRED");
      const renewed = await timebox(client.auth.refreshSession({ refresh_token: session.refresh_token }));
      assert.ifError(renewed.error);
      assert.ok(renewed.data.session?.access_token, "REFRESH_FAILED");
      session = renewed.data.session;
      const verified = await client.auth.getUser();
      assert.ifError(verified.error);
      assert.equal(verified.data.user.id, userId);
    });
  if (userId) {
    await check("Data API own-row RLS", async () => {
      const { data, error } = await timebox(
        client.from("admin_memberships").select("user_id,role,is_active").eq("user_id", userId).single(),
      );
      assert.ifError(error);
      assert.equal(data?.user_id, userId);
      assert.equal(data?.is_active, true);
      assert.ok(["admin", "reviewer"].includes(data?.role), "EXPECTED_MEMBERSHIP_REQUIRED");
      role = data.role;
      assert.equal(role, env.STAGING_PROBE_EXPECTED_ROLE, "MEMBERSHIP_ROLE_MISMATCH");
      const other = env.STAGING_RLS_OTHER_USER_UUID;
      assert.match(
        other ?? "",
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        "SECOND_EXISTING_MEMBER_FIXTURE_REQUIRED",
      );
      assert.notEqual(other, userId);
      const { data: others, error: err } = await client
        .from("admin_memberships")
        .select("user_id")
        .eq("user_id", other);
      assert.ifError(err);
      assert.deepEqual(others, []);
    });
    await check("Storage list and download", () => timebox(readStorage(client, env)));
    if (args.storageWrite)
      await check("Storage approved upload/download/delete", () =>
        timebox(writeStorageFixture(client, env, storageFixtureRunId), 25000),
      );
    await check("Realtime subscribe and self-broadcast", () =>
      realtimeBroadcast(client, session.access_token, crypto.randomUUID()),
    );
  } else {
    results.push(...blockedAuthenticatedProbes(args.storageWrite));
  }
  await check("Data API anonymous cannot read memberships", async () => {
    // Inspect HTTP status: PostgREST 5xx, timeout or missing table is NEVER a valid denial.
    const response = await fetch(`${STAGING_URL}/rest/v1/admin_memberships?select=user_id&limit=1`, {
      method: "GET",
      headers: { apikey: env.STAGING_PROBE_PUBLISHABLE_KEY, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 401 || response.status === 403) return;
    assert.equal(response.status, 200, "ANONYMOUS_QUERY_UNEXPECTED_STATUS");
    const data = await response.json();
    assert.ok(Array.isArray(data) && data.length === 0, "ANONYMOUS_MEMBERSHIP_EXPOSURE");
  });
  if (args.pooler) {
    const name = "Session Pooler read-only identity and TEMP";
    try {
      await checkPooler(env, args.phase);
      results.push({ name, status: "PASS" });
    } catch (error) {
      const allowed = new Set([
        "PSQL_UNAVAILABLE",
        "TEST_TIMEOUT",
        "POOLER_ROLE_OR_PRIVILEGE_MISMATCH",
        "POOLER_USER_OR_TENANT",
        "POOLER_AUTH_REJECTED",
        "POOLER_TLS_ERROR",
        "POOLER_STARTUP_OPTION_REJECTED",
        "POOLER_SERVICE_FILE_ERROR",
        "POOLER_DNS_ERROR",
        "POOLER_NETWORK_ERROR",
        "POOLER_CONNECTION_FAILED",
      ]);
      // Only whitelisted codes: no SQL rows, hostnames, passwords or raw stderr.
      const failure_code = allowed.has(error?.message) ? error.message : "POOLER_UNCLASSIFIED";
      results.push({ name, status: "FAIL", failure_code });
    }
  } else results.push({ name: "Session Pooler", status: "NOT_RUN" });
  results.push({ name: "Private reader via Vercel OIDC (browser runbook)", status: "NOT_RUN" });
  // Neither output nor exceptions contain tokens, passwords, data rows, or object bodies.
  return {
    phase: args.phase,
    target: STAGING_REF,
    storage_fixture_run_id: storageFixtureRunId,
    tests: results,
    result: results.some((r) => r.status === "FAIL") ? "FAIL" : "PARTIAL_NOT_GO",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2))
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.result === "FAIL") process.exitCode = 1;
    })
    .catch(() => {
      console.error(
        "STAGING_PLATFORM_PROBES_FAIL_CLOSED: check approved target, fixture and authorization; no secrets logged",
      );
      process.exitCode = 1;
    });
}
