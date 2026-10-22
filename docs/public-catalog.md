# Public catalogue H2 — Web #50

Offline preparation for [Web #50](https://github.com/raulacden/sports-events-web/issues/50).
The home renders anonymous upcoming activities, comparable cards, a seven-local-date
window and a calendar paginated by month and opaque cursor (24 cards per page).
No published inventory is invented. Empty successful responses show zero activities;
disabled, failed and invalid requests have distinct states without a false zero count.

## Boundaries and activation status

Engine H0 is architecturally accepted. Its [ADR](https://github.com/raulacden/sports-events-engine/blob/develop/docs/hybrid-architecture-adr.md)
and [public v1 contract](https://github.com/raulacden/sports-events-engine/blob/develop/docs/hybrid-read-contract-v2.md)
were inspected on 22 October 2026. [Engine #122](https://github.com/raulacden/sports-events-engine/issues/122)
does not yet provide implemented/reviewed RPCs; [#123](https://github.com/raulacden/sports-events-engine/issues/123)
must produce real editorial publications and update the projection atomically.

This is a **draft consumer**, not a claim that real published inventory, RLS or grants
have been validated. `PUBLIC_CATALOG_MODE` defaults to `disabled`. The only implemented
active mode is `local-rpc`, requiring development Node/APP environments, loopback app
and upstream origins, a publishable key, and no Vercel environment. STAGING, PROD and
generic Preview cannot enable this adapter, even by setting `local-rpc`. A remote
enablement path must be added in a separately reviewed integration once #122 supplies
the final DTOs, independent SQL/RLS review and direct PostgREST tests.

No migrations, ACL, flags, secrets or deployments are applied by this work. No private
Admin/B1/B3 repository, fixture adapter, user session, Google identity or command is
used by the public path. The test server lives under `e2e/fixtures` and is never
imported by application code. The local integration always shows **Datos de prueba
locales · No son actividades reales**. It has no fallback on error.

## Provisional wire mapping to confirm with #122

Server composition: `app/page.tsx` → `loadPublicCatalog` → server-only
`SupabasePublicCatalogRepository` → `POST /rest/v1/rpc/catalog_occurrences_v1`.
Headers are `apikey` with a publishable key and both profile headers set to `api`;
no bearer/cookie/session forwarding, including for logged-in visitors. No SELECT of
`published_occurrences`, `catalog_read`, or any other relation is used.

The request uses H0's `desde`, `hasta`, `cursor`, `limit`. No SQL, PostgREST Range,
arbitrary select, dynamic resource, offset or total count is accepted. Successful
responses require `{contractVersion:1,items:[...],nextCursor:string|null}`. Cards are
reconstructed from an allowlist and receive only public text, instants, locations,
prices, registration URL and public update time. Extra provider fields are discarded,
not spread or serialized into React props. IDs, limits, ordering `(startInstant,id)`,
duplicate IDs, range membership and response version are checked.

H0 leaves nested enums/types unspecified. The **test-only proposed decoding** uses:

| Field                   | Provisional representation                                      |
| ----------------------- | --------------------------------------------------------------- |
| `locations.role`        | `venue`, `departure`, `destination`                             |
| Location display fields | nullable `municipality`, `neighborhood`, `pointName`, `address` |
| `prices.type`           | `free`, `fixed`, `from`, `unknown`                              |
| `prices.scope`          | `session`, `month`, `year`, `unknown`                           |
| Other price fields      | nullable numeric `amount`, ISO currency and `conditions`        |
| Category and level      | optional public `category` / `level` extension; otherwise null  |
| Cursor                  | opaque base64url-safe string, max 2048 characters               |

These choices **are not an implemented Engine contract**. Reconcile enum casing,
nullability, filters, price validity/transport costs, optional category/level and freshness
metadata with #122 before remote enablement. H0 does not yet define category/level in
the response; absent values display “por confirmar”, with no classification inferred
from titles. `localStart/localEnd` are not trusted for formatting: display is derived
from the validated instants using `Intl` with `Europe/Madrid`. No raw HTML or third-party
imagery is used. HTTPS registration URLs reject credentials, fragments and sensitive
query parameter names; unsafe data fails the response instead of exposing it.

“Próxima” describes temporal currency. “Ficha actualizada” uses `updatedAt`, **not**
`checked_at`, a last editorial verification or an invented revalidation date. The DB
must guarantee that the projection contains only explicitly published, verified,
unexpired, unblocked, unsuspended and uncancelled occurrences. Web does not duplicate
editorial rules or try to access private data to prove those conditions.

## Time, pagination and cancellation

- Initial range: now inclusive until Madrid midnight after the seventh local date,
  exclusive. Starts earlier today, ongoing and historical events are excluded here.
- Calendar: from now for the current month, otherwise local month midnight, until
  next month midnight exclusive; future months are selectable through 2099. Range links do
  not carry cursors between months.
- An `at` UTC anchor is retained in page links so RPC cursors see exactly the same
  normalized range on subsequent requests. Anchors expire after 24 hours. There is
  no frozen inventory snapshot: every request rechecks current starts and DB state.
- An autumn month can span 31 days plus an hour. It is split at the last local day:
  exhaust the first segment's RPC pages, then offer the tail segment, with no gap or
  overlap and with every individual RPC below H0's 31 exact day limit.
- `fetch` uses `no-store`, redirects are rejected, timeout covers fetch and body
  reading (10 seconds), and streamed JSON is limited to 1 MiB. No shared cache or
  authorization cache is introduced. Plain document links fetch a new page when
  navigating. An already-open document is not a live subscription; refresh to observe
  later cancellations. The backend must enforce suspension/cancellation atomically.

## Offline validation

```text
npm run quality
npm run test:e2e -- --config playwright.catalog.config.ts
npm run test:e2e -- e2e/public-home.spec.ts
```

Unit tests cover blocked deployment/local modes, no privileged key, no backend call
when disabled, bounds/errors, private-field stripping, price semantics, Patacona in
Alboraia, local times, impossible dates, DST, stable cursors and the autumn tail.
Dedicated E2E runs the real Next route against a separate labelled HTTP simulation:
anonymous rendering, 24+3 page flow, unknown/free/monthly prices, hidden
draft/conflict/cancelled/historical fixtures, empty/failure recovery, no caching,
mobile overflow, desktop and keyboard skip navigation. The normal E2E configuration
also verifies the default disabled home requires no account and invents no inventory.

These tests do **not** prove real Engine RLS, grants or editorial publication. The
negative editorial cases are simulated upstream filtering and must be repeated with
the actual #122/#123 SQL and PostgREST, without Next.js, before activation.

## Remaining integration gates

1. Engine #122: final public DTO/enums, RLS, ownership/EXECUTE, database-enforced
   range/cursor/limit and direct PostgREST negative tests; independent security review.
2. Engine #123: verified publication and projection updates in the same transaction,
   including cancellation, suspension, correction and freshness expiry.
3. Confirm public fields and pass against the real local API, including price
   validity and transport semantics. Add the reviewed STAGING-only activation gate.
4. Obtain independent operational approval, preflight and rollback before any remote
   grants/migrations/flags/deployment; verify real empty inventory and an approved
   current publication. SEO/EN and full activity detail remain separate work.

Until those gates pass, #50 is prepared offline and must not be reported as a real
STAGING catalogue or all acceptance criteria completed.
