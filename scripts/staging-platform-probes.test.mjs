import assert from "node:assert/strict";
import test from "node:test";
import {
  blockedAuthenticatedProbes,
  parseArgs,
  run,
  STAGING_URL,
  validatePooler,
  validateTarget,
} from "./staging-platform-probes.mjs";

test("default invocation is offline and never connects to Supabase", async () => {
  const report = await run([], {});
  assert.equal(report.mode, "OFFLINE");
  assert.equal(report.result, "NOT_RUN");
});

test("live probe requires explicit phase and rejects unknown args", () => {
  assert.throws(() => parseArgs(["--execute"]), /PHASE_REQUIRED/);
  assert.throws(() => parseArgs(["--phase=before", "--phase=after", "--execute"]), /AMBIGUOUS_PHASE/);
  assert.throws(() => parseArgs(["--phase=before", "--help"]), /UNKNOWN_OPTION/);
  assert.throws(() => parseArgs(["--storage-write"]), /LIVE_REQUIRED_FOR_STORAGE/);
  assert.throws(() => parseArgs(["--pooler"]), /LIVE_REQUIRED_FOR_POOLER/);
  assert.deepEqual(parseArgs(["--execute", "--phase=after"]).phase, "after");
});

test("wrong Supabase target and unapproved sessions fail closed", () => {
  const good = {
    STAGING_PROBE_SUPABASE_URL: STAGING_URL,
    STAGING_PROBE_PUBLISHABLE_KEY: "sb_publishable_fixturetest",
    STAGING_PLATFORM_PROBE_APPROVED: "yes",
    STAGING_PLATFORM_PROBE_TICKET: "ISSUE-94-A",
    STAGING_PROBE_EMAIL: "test@example.test",
    STAGING_PROBE_PASSWORD: "not-a-real-fixture-password",
    STAGING_PROBE_EXPECTED_USER_UUID: "123e4567-e89b-42d3-a456-426614174000",
  };
  assert.doesNotThrow(() => validateTarget(good));
  assert.throws(
    () => validateTarget({ ...good, STAGING_PROBE_SUPABASE_URL: "https://other.supabase.co" }),
    /WRONG_SUPABASE_TARGET/,
  );
  assert.throws(() => validateTarget({ ...good, STAGING_PLATFORM_PROBE_APPROVED: "no" }), /APPROVAL_REQUIRED/);
  assert.throws(
    () => validateTarget({ ...good, STAGING_PROBE_EXPECTED_USER_UUID: "" }),
    /PINNED_AUTH_SUBJECT_REQUIRED/,
  );
  assert.throws(
    () => validateTarget({ ...good, STAGING_PROBE_PUBLISHABLE_KEY: "service_role-secret" }),
    /PUBLISHABLE_KEY_REQUIRED/,
  );
});

test("pooler test is read-only, session-scoped, verify-full and reader-only", () => {
  const base = {
    STAGING_POOLER_HOST: "aws-0-eu-west-3.pooler.supabase.com",
    STAGING_POOLER_PORT: "5432",
    STAGING_POOLER_USER: "engine_discovery_reader.yfytzogjrhwstcnzspdv",
    STAGING_POOLER_PASSWORD: "irrelevant-test-placeholder",
    STAGING_POOLER_CA: import.meta.filename,
  };
  assert.doesNotThrow(() => validatePooler(base));
  assert.throws(() => validatePooler({ ...base, STAGING_POOLER_PORT: "6543" }), /SESSION_POOLER_PORT_REQUIRED/);
  assert.throws(
    () => validatePooler({ ...base, STAGING_POOLER_USER: "postgres.yfytzogjrhwstcnzspdv" }),
    /READER_LOGIN_REQUIRED/,
  );
  assert.throws(() => validatePooler({ ...base, STAGING_POOLER_HOST: "prod.db.example" }), /INVALID_POOLER_HOST/);
});

test("requested Storage write is BLOCKED when Auth fails, never omitted from the report", () => {
  const requested = blockedAuthenticatedProbes(true);
  assert.deepEqual(requested.find(({ name }) => name === "Storage approved upload/download/delete"), {
    name: "Storage approved upload/download/delete",
    status: "BLOCKED",
  });
  assert.ok(requested.every(({ status }) => status === "BLOCKED"));
  assert.ok(!blockedAuthenticatedProbes(false).some(({ name }) => name === "Storage approved upload/download/delete"));
});
