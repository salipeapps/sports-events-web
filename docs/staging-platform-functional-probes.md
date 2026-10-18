# #94 — STAGING Supabase functional probes (before/after PUBLIC TEMP)

**PREPARED ONLY · NOT RUN · NO-GO for ACL change.** This suite does not approve
`REVOKE TEMPORARY`, ALTER ROLE, migrations, changes to Auth hooks/Storage policies,
writer deployment or discovery commands. `--execute` needs a separate,
documented operator authorization and **only STAGING**. Never run on PROD.

Scope: Supabase project `sports-events-staging` / ref
`yfytzogjrhwstcnzspdv`; dedicated web
`https://sports-events-web-staging.vercel.app`; PostgreSQL 17.11; Engine #94.
The exact deploy origins and credentials must be verified again before any live
run. Do **not** copy live tokens, passwords, cookies or API keys into a PR,
shell history, screenshot, chat or shared CI output.

## Prerequisites (must be recorded, not inferred)

- Explicit operator approval for **functional requests** (login/refresh, HTTP,
  Realtime broadcast, Storage reads, pooler read-only SQL), separate from
  approval for a subsequent database ACL change. An approved **invited STAGING
  account** with a known active `admin_memberships` row (admin or reviewer),
  its password kept in a secret channel, **its pinned Auth user UUID**
  independently confirmed beforehand, and **a second existing eligible
  membership UUID** confirmed by trusted catalog read to test own-row RLS.
  Do not create Auth accounts or memberships solely to make the suite pass
  without a separate fixture-provisioning approval.
- STAGING publishable key (`sb_publishable_...`), not `service_role` /
  `sb_secret_...`. Confirm Auth hook and signed role separately; an HTTP
  login alone does not prove Spring can accept the JWT. For the second
  membership, the test account must **not** be its owner.
- Preapproved private Storage bucket and nonempty object readable/listable
  by that account, `STAGING_STORAGE_BUCKET` and
  `STAGING_STORAGE_OBJECT`. If the project does not use Storage, label the
  test **NOT APPLICABLE with verified evidence**; never silently mark PASS.
- Node 24 and `npm ci` in `sports-events-web`. For Supavisor additionally
  `psql` v17 (or compatible), Session Pooler hostname/port **5432**,
  `engine_discovery_reader.<STAGING-ref>` account, authorized password and
  a trusted root CA file. `PGSSLMODE=verify-full` is forced. Check
  hostname/certificate trust; never use `sslmode=require` as substitute.
- A unique change ticket/reference, roles responsible for Auth, Storage,
  Realtime, PostgREST and Supavisor, a known rollback runbook and a private,
  access-restricted evidence directory. A trial that lacks service owners
  or representative tests remains **NO-GO**.

## Offline dry run — the default

```bash
node scripts/staging-platform-probes.mjs
node --test scripts/staging-platform-probes.test.mjs
```

The first command prints `OFFLINE / NOT_RUN`, without opening network
connections or reading credentials. The second command tests target, role,
session, approval and invocation gates against synthetic values only.

## Example of an **authorized future** execution

Populate these values securely in the process environment immediately before
running; **do not** commit a populated `.env`, shell `export` lines or the
report. Use the _same fixtures_ before and after. Names here are a contract,
not evidence that the fixtures currently exist:

```text
STAGING_PROBE_SUPABASE_URL=https://yfytzogjrhwstcnzspdv.supabase.co
STAGING_PROBE_PUBLISHABLE_KEY=<staging publishable key>
STAGING_PLATFORM_PROBE_APPROVED=yes
STAGING_PLATFORM_PROBE_TICKET=<actual approved ticket>
STAGING_PROBE_EMAIL=<invited staging test user>
STAGING_PROBE_PASSWORD=<secret>
STAGING_PROBE_EXPECTED_USER_UUID=<exact previously approved Auth UUID>
STAGING_PROBE_EXPECTED_ROLE=reviewer
STAGING_RLS_OTHER_USER_UUID=<separate existing membership user UUID>
STAGING_STORAGE_BUCKET=<approved bucket>
STAGING_STORAGE_OBJECT=<existing readable nonempty object path>
STAGING_POOLER_HOST=<verified session pooler .pooler.supabase.com host>
STAGING_POOLER_PORT=5432
STAGING_POOLER_USER=engine_discovery_reader.yfytzogjrhwstcnzspdv
STAGING_POOLER_PASSWORD=<secret>
STAGING_POOLER_CA=<trusted local PEM certificate path>
```

Following **separate authorization for functional probes only**, run each
phase from a secured operator workstation. Record report JSON locally with
permissions restricted to the operator. Do not run both phases back-to-back:
`after` is meaningful only **after** a separately authorized ACL change,
and this project has NOT authorized that change.

```bash
node scripts/staging-platform-probes.mjs --execute --phase=before --refresh --pooler
# ... ONLY if a completely separate #94 ACL-change authorization has been
# granted and its before checks passed, perform that intervention ...
node scripts/staging-platform-probes.mjs --execute --phase=after --refresh --pooler
```

Auth binds to `STAGING_PROBE_EXPECTED_USER_UUID` in each run; a different
account or recreated Auth user must fail even if its membership is valid.
Storage listing uses server-side search and bounded pagination; directory
results beyond the bound require a narrower approved fixture prefix.
Anonymous PostgREST checks accept only HTTP 401/403 or 200 with an empty array:
any unexpected response, 5xx or timeout fails.

The report includes only a random `storage_fixture_run_id` when an approved
Storage write probe was requested. This is **not a credential**: retain it
privately to locate and remove any orphaned fixture if cleanup is uncertain.

The report is restricted to test name and `PASS` / `FAIL` /
`BLOCKED` / `NOT_RUN`; details, user ids, tokens, rows, passwords and
bucket names are suppressed. The final verdict is always
`PARTIAL_NOT_GO` until _the separate private-reader and storage-write
tests_ and the approval matrix are verified. A failure aborts the next
**operational phase**; do not retry the ACL change automatically.

### Exact checks and required evidence

| Test                       | Before                                                                      | After                | Expected result / fail-closed rule                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                       | sign-in + `getUser` + `--refresh`                                           | repeat fresh session | Both successful; same pinned Auth user UUID, no lost Auth service                                                                                          |
| Data API                   | authenticated `admin_memberships` own-row SELECT                            | repeat               | Own active role equals expected; second _known existing_ user's UUID returns zero rows under RLS                                                      |
| Anonymous Data API         | unauthenticated `admin_memberships` SELECT                                  | repeat               | Denied or empty; any row = FAIL                                                                                                                       |
| Storage                    | list one approved object and download                                       | repeat               | Both pass with authorized test account; no object body in report                                                                                      |
| Storage write (if in use)  | one unique tiny upload/readback/delete                                      | repeat               | Requires **additional** `STAGING_STORAGE_WRITE_APPROVED=yes` plus `--storage-write` and approved disposable prefix; failures or cleanup errors = FAIL |
| Realtime                   | subscribe to a random ephemeral broadcast topic; send and receive own nonce | repeat               | Received one own message, no timeout; session is authenticated                                                                                        |
| Supavisor (Session Pooler) | read-only SQL via `psql`                                                    | repeat               | `current_user=session_user=engine_discovery_reader`, DB `postgres`, `CREATE=false`, `TEMP=true` before and `TEMP=false` after                         |
| Private Engine reader      | Admin + reviewer authenticated GET from **approved Vercel STAGING**         | repeat               | Fixed known Valencia execution; genuine Vercel OIDC -> Google IAM -> Cloud Run -> Postgres reader, no writes; see below                               |

**Storage write is not included by default.** Following a separate
fixture-write approval, use `--storage-write` in _each_ phase and require
cleanup; it attempts deletion even when the upload response was lost, and
only writes to `__staging-acl-smoke__/<random>.txt` in the
approved bucket. A project that cannot safely provision such a bucket
and policies cannot claim a Storage write PASS. If Storage is not used,
record N/A with an independently verified service owner decision.

## Private reader: do not bypass Vercel OIDC

The local Node script deliberately reports this test as **NOT_RUN**.
An operator's workstation, Supabase JWT and a URL alone do not provide
the approved Vercel OIDC -> GCP IAM workload identity. Do not expose
Cloud Run publicly or paste ID tokens into a terminal.

Use the existing `sports-events-web`
[STAGING read-smoke runbook](staging-discovery-activation.md) **only when
the dedicated STAGING project's temporary route is separately approved
and deployed**. Its `DISCOVERY_STAGING_SMOKE_ENABLED` flag is disabled
by default; this PR does not enable it. From an authenticated browser on
`https://sports-events-web-staging.vercel.app` with a verified invited
`admin`, and separately `reviewer`, invoke same-origin:

`GET /api/internal/discovery-read-smoke`.

The fixed evidence target is recovered Valencia execution
`2c17a493-2f68-4e3e-a2bb-9d75bb7a4a06`, with 10 candidate identities,
10 observations, 9 `UNSUPPORTED_REVIEWABLE`, 1
`AMBIGUOUS_REVIEW_REQUIRED`. Expect HTTP 200 / `SMOKE_OK` with
`no-store` for both roles. Unauthenticated must return 401;
inactive/mismatched member is denied (403 where applicable), and generic
Preview/PROD 404. Do not confuse an early BFF 401/403 with a Cloud Run
IAM denial: check private upstream status and sanitized GCP logs.

**Never turn on temporary smoke and live read mode together.** Use the
runbook's gate ordering, verify deployment/revision/digest, and turn
the temporary flag OFF immediately after an approved acceptance.
If the route is unavailable or any identity is not established, record
`NOT_RUN`, **not PASS**.

## Secure ACL snapshot and rollback readiness

In `sports-events-engine`, versioned
`scripts/staging-public-temp-acl-evidence.sql` captures a READ ONLY JSON
catalog snapshot (database ACL with grantors/grant options, 13 platform
roles, memberships and unknown TEMP consumers). Before and after snapshots
are sensitive operational metadata: store _only_ on a secure workstation
with `umask 077`; do not attach raw files to GitHub, CI or chat.

Use a separately verified **direct owner/operator** SQL connection for
ACL capture (not a restricted reader account), `sslmode=verify-full`,
`PGSSLROOTCERT`, database `postgres`, and:

```bash
umask 077
psql -X -q -v ON_ERROR_STOP=1 -A -t \
  -f ../sports-events-engine/scripts/staging-public-temp-acl-evidence.sql \
  > ./staging-acl-before.private.json
```

`psql` must be configured to connect to the **verified STAGING project**
through the approved channel; not PROD. Re-run into a separate `after`
file only after an authorized intervention. Before approval, also record
`scripts/staging-public-temp-impact-preflight.sql` results and the
baseline of 13 roles/`PUBLIC CONNECT`. Keep TLS credentials separate
from saved reports. Rollback proposal:
`docs/proposals/staging-public-temp-rollback.sql`. It restores
`PUBLIC TEMP` but **does not restore the exact former ACL**, because
new explicit platform grants remain. A reviewer must accept this
difference, and the rollback must be executable before any `REVOKE`.

## Approval and stop matrix

Record for each system: responsible person, fixture, before/after timestamps,
sanitized status, relevant log correlation IDs, tested role, approved
deploy SHA/revision, observability baseline, evidence location, and decision.
No blank fields may be treated as PASS. All of Auth, Data API/RLS, Storage
(or justified N/A), Realtime, pooler, reader and ACL inventory need
representative **before** outcomes before a #94 change window.

Stop on any unexpected 401/403/5xx, timeout, absent fixture, mismatch,
ACL drift, role drift, missing TLS proof or missing ability to check a
service. Restore `PUBLIC TEMP` only under the **independently
approved** rollback procedure; then re-test service health and
document the residual explicit grants. At no point does this functional
suite authorize #87 write activation, large-object opt-in #98, reader
deployment or migration.

See engine
[STAGING PUBLIC TEMP live plan](https://github.com/raulacden/sports-events-engine/blob/develop/docs/staging-public-temp-live-staging-plan.md),
[issue #94](https://github.com/raulacden/sports-events-engine/issues/94)
and the Engine
[option-A acceptance gates](https://github.com/raulacden/sports-events-engine/blob/develop/docs/staging-managed-postgres-option-a-acceptance.md).
