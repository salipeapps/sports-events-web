# H1b: Admin read availability

Issue: [Web #49](https://github.com/raulacden/sports-events-web/issues/49).
Requirements: RF-12, RF-25, RF-33, RF-35, RF-37.

## Contract inventory (22 October 2026)

[Engine H0](https://github.com/raulacden/sports-events-engine/blob/develop/docs/hybrid-read-contract-v2.md)
explicitly reserves the editorial `AdminRepository` models for
[Engine #123](https://github.com/raulacden/sports-events-engine/issues/123), which remains open.
[Engine #121](https://github.com/raulacden/sports-events-engine/issues/121) implements nine B3
Discovery RPCs, consumed separately by [Web #48](https://github.com/raulacden/sports-events-web/issues/48).
Those resources are not B1 event candidates, source configurations, capture runs or published activities.
Do not relabel them or derive editorial totals/coverage from a bounded B3 page.

| Screen                                  | Existing repository methods                                                     | Current remote result                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `/admin`                                | `getDashboardSummary`                                                           | `NOT_AVAILABLE`: no approved metrics, queue, blockers or coverage projection    |
| `/admin/activities`                     | `listActivities`, summary, sources, organizers                                  | `NOT_AVAILABLE`: no B1 catalog read contract                                    |
| `/admin/candidates`                     | `listCandidates`, summary, sources, organizers                                  | `NOT_AVAILABLE`: no B1 editorial queue contract                                 |
| `/admin/candidates/[id]`                | `getCandidate`, `getLinkedPublishedOccurrence`, `listOrganizers`, `listSources` | `NOT_AVAILABLE`, not 404 or a fixture record                                    |
| `/admin/sources`, `/admin/sources/[id]` | `listSources`, `listRuns`                                                       | `NOT_AVAILABLE`: B2 source configuration is not a B3 candidate source reference |
| `/admin/runs`, `/admin/runs/[id]`       | `listRuns`, `listSources`, `listRunCandidates`                                  | `NOT_AVAILABLE`: capture/validation runs are not B3 search executions           |
| Organizer lookups                       | `listOrganizers`, `getOrganizer`                                                | `NOT_AVAILABLE`: no approved organizer projection                               |
| `/admin/discovery` and its details      | `DiscoveryReadRepository`                                                       | Existing separately gated B3 adapter; unchanged by #49                          |

All ten read methods fail explicitly, including direct detail and paginated requests. No new
endpoint names, SQL, global totals, readiness, quota or costs are invented. The dashboard shows
availability by area and provides navigation to the editorial queue, activities and Discovery.
It never renders a zero-filled metrics ring or treats a missing projection as an empty inventory.

## Selection, states and permissions

- `getAdminRepository()` is server-only. Fixtures require **all** of: explicit `APP_ENV=development`,
  `NODE_ENV=development`, `ADMIN_DEV_AUTH_MODE=enabled`, HTTP loopback `APP_ORIGIN`, and absence
  of `VERCEL` and `VERCEL_ENV`. Real Supabase sessions, missing/invalid settings, hosted previews,
  STAGING and PROD cannot select them. Re-evaluate selection on every call; a prior demo instance
  cannot become a fallback. Existing local auth also verifies the request host.
- Demo screens show “Demo local · Datos simulados para desarrollo.” Direct test fixtures remain
  usable without enabling a remote mode. No new environment variable or activation flag is added.
- `NOT_AVAILABLE` means the read contract does not exist. `READ_UNAVAILABLE` is the typed state for
  a failed read when a future adapter exists. Both preserve the module heading and show an alert,
  without rows, counts or editorial forms. Unexpected exceptions reach the existing safe error boundary;
  Next.js redirects and `notFound()` are rethrown.
- `empty` requires a successful read with no matching rows. Existing local empty-state/filter/pagination
  behavior remains separate. `loading.tsx` retains its accessible skeleton while a request is pending.
- Every page revalidates Auth and active membership before constructing the repository, including
  direct list/detail URLs and dashboard. Revoked/unauthenticated users redirect to login; authenticated
  reviewers retain catalog/dashboard access and receive the existing forbidden screen for source/run
  management. No frontend row filtering confers access.
- Every remote mutation method fails with `WRITE_UNAVAILABLE`; existing server actions still verify
  identity and capability first. No buttons or forms for publication or source/budget changes appear
  on unavailable screens. Commands remain scoped to Web #34/Engine #123.

## Required contract before a real B1 adapter

Engine #123 must approve versioned allowlisted DTOs for each method above, including field semantics,
role-dependent redaction, explicit empty/detail-not-found/error results, deterministic bounded
pagination and filter binding. The existing B1 `PageResult` uses page/size/total; the B3 cursor contract
cannot be substituted without an approved B1 pagination/aggregate decision. Never infer global totals
from one page or fetch an unbounded inventory to emulate them.

Each future read must revalidate the user bearer and current active membership server-side, use a
publishable key and `no-store`, and expose only the approved projection. The SQL surface must deny
anonymous, non-member and revoked identities even when called directly without Next.js; reviewer/admin
redaction and DML denial need PostgreSQL/PostgREST tests against the actual implementation. No privileged
browser credential, direct private-table grants, raw upstream error logging or generic SQL dispatcher.

## Validation and operational limits

Offline tests cover selection gates (including a prior local demo), every unavailable read and command,
all eight page entry points, admin/reviewer permissions, next-request membership revocation, errors,
loading, a successful empty search and pagination. Browser tests use isolated Auth HTTP fixtures to check
SSR cookies, unavailable list/detail screens, revocation across modules and responsive layout; the local
demo suite retains its existing review, filtering and pagination flows with an explicit demo label.

These checks establish Web behavior, not live Supabase RLS or STAGING inventory. No B1 SQL exists here
to test against a database. Existing Auth DB tests cover membership policies, not future B1 projections.
No remote migrations, ACL/IAM, secrets, flags, deployments or writes are authorized by this PR.
Activation needs a separate operational GO after real read contracts, SQL security review and direct
negative permission tests. Roll back by reverting this Web change; do not enable remote fixtures.
