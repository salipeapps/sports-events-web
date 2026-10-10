# Discovery engine — private STAGING read adapter (#26)

This change connects the existing admin shell to the engine's bounded GET API.
It adds no searches, captures, reviews, promotions, publications, credentials,
remote migrations or cloud resources. **Real STAGING smoke is still pending.**

## Activation gates

Deployed environments fail closed by default (`DISCOVERY_READ_MODE=disabled`).
Setting `DISCOVERY_READ_MODE=staging` requires the dedicated Vercel Hobby project
`sports-events-web-staging` (project ID `prj_MU4pprIXpAdKUGcBPx8uWztULHxb`,
`APP_ENV=staging`, `NODE_ENV=production`, `VERCEL_ENV=production`,
`VERCEL_TARGET_ENV=production`, system `VERCEL_PROJECT_ID`, branch `develop`,
approved `APP_ORIGIN` and STAGING-only Supabase URL). The word `production`
here is Vercel's per-project deployment target; it is **not** the separate real
PROD project `sports-events-web` (`prj_mJZ53ELTCu9TBUAGHO3QbYfwJIdX`).
Generic Preview, other branches and PROD all fail closed even with a feature flag.
The Vercel system variables must be exposed by the platform, not fabricated by hand.
Activate only after Supabase's approved Auth hook, read-only database reader and
private Cloud Run IAM/OIDC are live and verified. See
[STAGING activation gates](staging-discovery-activation.md).

Server-only variables:

- `ENGINE_STAGING_BASE_URL` — approved Cloud Run HTTPS service origin
  (`*.a.run.app`, no path, redirects or credentials).
- `ENGINE_STAGING_ID_TOKEN_AUDIENCE` — exactly the same origin.
- `GCP_WORKLOAD_PROVIDER_AUDIENCE` — full, reviewed WIF provider resource.
- `GCP_INVOKER_SERVICE_ACCOUNT_EMAIL` — exact approved invoker identity.
- `VERCEL_EXPECTED_OIDC_ISSUER` / `VERCEL_EXPECTED_OIDC_AUDIENCE` —
  approved issuer and audience for the STAGING Vercel workload.
- Existing Supabase Auth / `APP_ORIGIN` settings as configured in
  [discovery-auth-bridge.md](discovery-auth-bridge.md).

Do not put secrets, OIDC or access tokens in `NEXT_PUBLIC_*`. No shared key,
service_role, broad Preview trust or browser-supplied actor/roles are allowed.

The adapter obtains the request's Vercel OIDC assertion and exchanges it
through Google STS and IAM Credentials for a short-lived Cloud Run ID token.
Google verifies the signed workload assertion; decoding claims locally is only
a preflight. The user token is independently verified with the Supabase
`getDiscoveryAccessToken()` bridge on **every upstream read**, including the
current active membership and signed `discovery_role`. A mismatch is denied.

## Data and controls

The Node server calls only documented engine GET endpoints with 20-row pages,
opaque cursors, `cache:no-store`, redirects disabled, a 30-second deadline, safe
fixed error codes and 1 MiB JSON ceiling. Filters are pushed to the engine.
The UI never collects all history into a fabricated snapshot.

The existing demo adapter is available only in an explicit localhost development
bypass; deployed Preview and PROD never fall back to fixtures. Reviews, searches,
publication and provider operations remain disabled. Discovery candidates use
their UUID, not B1 candidate occurrence IDs. Execution observations for a known
source display `knownSourceId` and never invent a candidate ID. Nullable costs,
counts, titles, schedules and metadata remain unknown, not zero.

`admin` and `reviewer` may read; only admin retains `sources.manage` and
`runs.execute`. The route checks capability before acquiring identity tokens.

## Testing and handoff

Offline: `npm run quality`; local demo Playwright:
`npm run test:e2e` with the existing explicit dev-auth loopback setup.

Real HTTP STAGING evidence is **NOT RUN**. It requires separate approval,
the dedicated Vercel Hobby STAGING project's verified OIDC identity,
a verified token hook, dedicated SELECT-only engine reader and private
Cloud Run IAM ingress. Read the engine PR #84 / #83 runbooks
before activation. With the already recovered Valencia execution UUID, verify
10 distinct candidates, 10 original provenance records, 9
`UNSUPPORTED_REVIEWABLE` and 1 `AMBIGUOUS_REVIEW_REQUIRED` across paged
requests; 401/403, reviewer, disabled membership, no-store, timeout and
no business writes/search requests. Keep web #26 / engine #80 open until
this independent live acceptance has been recorded; PROD untouched.
