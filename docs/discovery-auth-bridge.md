# Discovery Auth bridge — issue #26, step 1

Prepared locally; remote migration and Auth hook activation require a subsequent
approval. This PR adds no discovery HTTP adapter, routes, UI, engine changes,
deployment, IAM changes or provider operations. It does not complete #26 or #80.

## Audit (2026-10-09)

- Clean web `develop` matched `origin/develop`. Web #24 / PR #25 merged at
  2026-10-09 06:18:34 UTC; engine #80 / PR #82 merged at 2026-10-08 22:31:35 UTC.
- Web owns `supabase/migrations`, separately from engine Flyway. Existing
  `admin_memberships` has a UUID primary key, allowed roles admin/reviewer,
  inactive default, and RLS. Users can select only their own `user_id,role,is_active`.
  No user INSERT/UPDATE/DELETE grants or policies; audit columns are inaccessible.
- Read-only STAGING catalog inspection confirmed those policies/column grants,
  no PUBLIC table ACL and no effective INSERT/UPDATE/DELETE for anon,
  authenticated or supabase_auth_admin. No hook/access-token-named functions were
  found in non-system schemas. Repository search found no existing token hook.
  Dashboard/Management Auth hook configuration was **not** read: an HTTP hook or
  differently named function remains possible. Check that setting before activation;
  never replace an existing hook without reviewing and composing its behavior.
- `SupabaseAdminSessionProvider` uses `getUser()` then current membership via RLS;
  guards check capabilities, proxy refreshes cookies using `getClaims()`. SSR client
  uses a publishable key, HttpOnly cookies and no-store. Login, invite, recovery,
  password update and logout retain their existing flows.
- Read the entire engine `docs/discovery-admin-api-v1.md` and
  `bootstrap/DiscoveryAdminSecurityConfiguration.java`. Spring independently
  verifies JWKS signatures (RS256/ES256 only), issuer, audience, timestamps, UUID
  subject, authenticated role and non-anonymous identity; grants GET access only
  to signed app_metadata.discovery_role admin/reviewer. No browser role headers.
- Public STAGING JWKS at
  `https://yfytzogjrhwstcnzspdv.supabase.co/auth/v1/.well-known/jwks.json`
  returned an EC/ES256 signing public key. This proves availability of an asymmetric
  key, **not** the algorithm of a freshly issued current token or Dashboard active-key
  selection. No users/tokens/signing configuration were changed or read.

## Authority and least privilege

`public.admin_memberships` remains the sole role authority. The official
[Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
derives `app_metadata.discovery_role` on each token issuance/refresh. It deletes any
pre-existing discovery role first, then adds only an active admin/reviewer membership
for the event's matching, non-anonymous, authenticated subject. Missing/inactive or
unknown roles get no discovery role, including when metadata claims admin. Unknown
roles are also blocked by the existing CHECK constraint.

The hook preserves every other JWT claim and application metadata field; it neither
copies membership audit fields nor persists a role in auth.users. Non-members can
still authenticate for invitation/recovery purposes. user_metadata is preserved
as ordinary user data and never consulted for authorization.

Migration `20261009063648_discovery_access_token_hook.sql` creates a private
`discovery_auth` schema and an explicit SECURITY INVOKER function with empty
search_path and qualified table references. Only supabase_auth_admin gets schema
USAGE, function EXECUTE and three membership SELECT columns. Its SELECT RLS policy
allows membership lookup without an end-user auth.uid context; no write privilege,
audit column read or additional table is introduced. PUBLIC/anon/authenticated have
no hook EXECUTE/schema access. Keep discovery_auth outside Data API exposed schemas.
The policy necessarily permits the trusted Auth database role to read membership
roles for token issuance; it does not widen normal users' own-row policy.

## Server consumption contract

`src/integrations/auth/discoveryToken.ts` is protected by `server-only` and currently
has no production caller. Future server adapter calls `getDiscoveryAccessToken()`
on every request **after** the route's capability guard. Both roles can receive
bearers; this helper does not grant reviewer access to admin-only web screens.

1. `getUser()` verifies current identity; reject invalid/anonymous identity.
2. Read active membership via that same SSR client and own-row RLS.
3. `getSession()` retrieves the bearer only after authorization. Ignore its user
   object completely. No development bypass can produce an engine bearer.
4. `getClaims(accessToken)` verifies the exact bearer with the configured Supabase
   SDK/Auth project. Never decode a JWT as authorization evidence. Check ES256/RS256,
   issuer `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1`, audience authenticated, matching UUID
   subject, authenticated role, is_anonymous=false, exp/iat/nbf and zero expiry skew.
5. Require signed discovery_role to equal current membership, then `getUser(token)`
   revalidates the exact bearer online (session retrieval may have refreshed it).
6. Return the bearer to server code only. Future adapter sends only
   `Authorization: Bearer <accessToken>`, with no-store, through private ingress.
   Do not forward Supabase cookies, API keys, service-role keys or browser headers.

Missing/invalid/expired identity or incompatible JWT returns UNAUTHENTICATED;
missing/inactive/unknown membership or missing/mismatched claim returns FORBIDDEN.
Errors are fixed safe codes without provider details or tokens. On mismatch, deny;
require a new login or an approved refresh flow that reruns all checks. No automatic
refresh retry loop. Never serialize the authorized result into React props/Server
Action output, log it, store it or cache it across requests.

## Approved future STAGING installation

These are operator instructions, **not operations executed by this PR**.

1. Verify target project **yfytzogjrhwstcnzspdv** and its STAGING-only database
   connection; ensure PROD is absent from the operator session. Review backup/change
   window and existing hook config under Dashboard → Authentication → Hooks.
   If any Custom Access Token Hook exists, stop and review composition first.
2. Compare deployed membership schema, RLS and effective/PUBLIC ACLs to the audit.
   Confirm migration #25 is recorded, discovery_auth does not already exist,
   and Data API exposed schemas do not contain discovery_auth. Review the exact
   migration above. Do not apply engine Flyway migrations or grant discovery tables.
3. With the approved privileged migration workflow, apply **only** that new web
   migration and record it in Supabase migration history. For the Supabase CLI,
   first inspect `supabase db push --help`, link the verified STAGING ref, and run
   `supabase db push --linked --dry-run`. Proceed with `supabase db push --linked`
   only if the pending list contains exactly this reviewed migration; otherwise
   stop and reconcile history. No direct database credentials belong in this repo.
4. Confirm function prosecdef=false, fixed search_path, RLS enabled, Auth's three
   column SELECT permissions and EXECUTE, denied user EXECUTE/write/audit-column
   permissions. Check actual ACLs/effective privileges, including PUBLIC grants.
5. Dashboard → Authentication → Hooks → Add hook → Custom Access Token → Postgres
   function: select schema `discovery_auth`, function `custom_access_token_hook`;
   save/enable. If the selector cannot resolve the private schema, stop and check
   Auth hook configuration; **do not** expose it through the Data API or switch to
   SECURITY DEFINER. Equivalent local/approved config is:

   ```toml
   [auth.hook.custom_access_token]
   enabled = true
   uri = "pg-functions://postgres/discovery_auth/custom_access_token_hook"
   ```

6. Using approved existing test accounts, perform fresh login/refresh. Privately
   verify the actual signed token (no traces/screenshots/logging): issuer
   `https://yfytzogjrhwstcnzspdv.supabase.co/auth/v1`, audience authenticated,
   ES256 or RS256, matching current role and preserved mandatory claims. JWKS alone
   is insufficient. If tokens are HS256, stop: schedule an approved asymmetric-key
   migration, compatibility/cache rollout and rollback review. Never rotate here.
7. Check invitation, recovery, password update, refresh and logout using an approved
   mailbox; no emails/accounts are provisioned by this PR. Recommended administrative
   JWT expiry: five minutes, subject to a separate approved configuration change.
8. Before engine enablement, verify private TLS ingress accepts only the Next.js
   workload, and current-session/revocation requirements. For Cloud Run, platform
   identity belongs in X-Serverless-Authorization, independently of the user bearer.
   No public ingress workaround. Engine issuer/audience must match above.
9. After separate deployment/smoke authorization, use the engine's existing read-only
   smoke and already recovered execution UUID; no new searches/events or fixtures in
   remote DB. Record real STAGING evidence separately from local tests.

## Revocation, risks and rollback

Issued JWTs retain their signed role until expiry, even after membership deactivation
or global logout. Web checks current membership on every request, but offline engine
JWT verification cannot ensure immediate revocation. A concurrent membership change
can occur after a web check. Private ingress and short TTL bound exposure; strict
session-id revocation validation is still a deployment dependency. getUser verifies
identity; it does not establish that every previously issued session is unrevoked.
Never claim these checks alone guarantee instantaneous withdrawal.

Hook failure/timeout or bad grants can block new login/refresh, including recovery.
The lookup uses the membership primary key; official Postgres hooks have a two-second
budget. Monitor safe aggregate Auth errors after the approved activation.

Rollback order (approved STAGING operator only): disable this hook in Authentication
→ Hooks first; restore the previously reviewed hook setting if applicable. Keep the
engine adapter disabled: tokens without this claim must fail closed. Disabling a hook
does not remove claims in existing tokens; wait their maximum lifetime and review
session revocation/private ingress before resuming access. Then run the following
reviewed SQL through a separately versioned rollback migration:

```sql
begin;
drop function discovery_auth.custom_access_token_hook(jsonb);
drop policy "Auth hook reads memberships" on public.admin_memberships;
revoke select (user_id, role, is_active) on public.admin_memberships from supabase_auth_admin;
revoke usage on schema discovery_auth from supabase_auth_admin;
drop schema discovery_auth;
commit;
```

No CASCADE. Leave public schema USAGE intact (shared Supabase permission; removing
it could break other Auth hooks). Reconcile migration history through the approved
workflow. The exact SQL is also saved in `supabase/rollback/discovery_access_token_hook.sql`
and exercised by the isolated SQL runner. Existing admin memberships and web login remain intact. Confirm login,
invite/recovery and logout and engine denial after rollback.

## Validation and remaining checklist

```powershell
npm run quality
./scripts/test-auth-db.ps1
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e -- --config playwright.auth.config.ts
git diff --check
```

The SQL runner creates a disposable PostgreSQL 17 container without network/host
ports/volumes, builds minimal Auth role scaffolding, applies real web migrations,
executes transactional RLS/hook tests, and removes the container. It is not GoTrue or
a STAGING smoke. Unknown-role test temporarily relaxes CHECK inside its rolled-back
transaction. Unit tests cover server sequencing, roles, expiry, mismatch/escalation,
safe failures and actual offline SDK signature verification/tampering. Existing
Playwright uses local Auth HTTP fixtures for login/invite/recovery/logout/refresh.
CI runs the isolated SQL suite alongside quality and existing browser suites.

Local results on 2026-10-09:

- `npm run quality`: PASS (format, lint, typecheck, 202 unit tests, production build).
  Lint retains six existing unused fixture import warnings. Generated Next.js
  E2E type configuration was restored after browser validation.
- Isolated PostgreSQL migration/RLS/hook/least-privilege/rollback checks: PASS.
- Supabase SDK verification of real offline RS256 and ES256 signatures/tampering: PASS.
- Auth Playwright: 10 PASS with local HTTP fixtures, including recovery, invitation,
  logout and refresh. Admin slice: 5 PASS; its no-session case is intentionally
  skipped when development bypass is enabled, then run separately: 1 PASS.
- `npm audit --omit=dev`: PASS, zero vulnerabilities. Full audit reports five high
  development-only findings in the existing Next lint → fast-glob → micromatch →
  braces chain. The only added dependency is pinned server-only 0.0.1; no broad
  dependency remediation or forced upgrade was performed in this Auth change.
- Secret review: no credential files, service/secret keys or raw tokens added;
  fixture keys/signatures are generated offline. Hook ACLs/RLS tested locally.
- Real STAGING login/hook activation/token emission/private engine smoke: NOT RUN.
  Remote access in this task was read-only catalog and public JWKS inspection only.

- [ ] Approval to migrate/enable STAGING hook; confirm no existing hook is replaced.
- [ ] Fresh real token signing algorithm and claim verification, real Auth regression.
- [ ] Private ingress/workload identity and current-session/revocation validation.
- [ ] Future #26 HTTP adapter, pagination/mapping and capability-guarded routes.
- [ ] Approved private engine deployment and real read-only smoke.
- [ ] Rollback drill in approved STAGING window. PROD remains untouched.

References: [Auth Hooks security/configuration](https://supabase.com/docs/guides/auth/auth-hooks),
[JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys),
[engine contract](https://github.com/raulacden/sports-events-engine/blob/develop/docs/discovery-admin-api-v1.md).
