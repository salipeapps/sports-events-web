# Public catalogue H2 — Web #50

Public implementation for [Web #50](https://github.com/raulacden/sports-events-web/issues/50).
The home renders anonymous upcoming activities, comparable cards, a seven-local-date
window and a calendar paginated by month and opaque cursor (24 cards per page).
No published inventory is invented. Empty successful responses show zero activities;
disabled, failed and invalid requests have distinct states without a false zero count.

## Configuration and boundaries

Engine V019/V020 are installed in STAGING. [Engine #139](https://github.com/raulacden/sports-events-engine/pull/139)
verified 23 direct anonymous HTTP checks against the real public RPC. The current
STAGING inventory is empty. This Web implementation consumes that API without
waiting for a first publication or treating empty inventory as an error.

`PUBLIC_CATALOG_MODE` is explicit and defaults to `disabled`:

- `supabase`: actual HTTPS Supabase RPC, using `NEXT_PUBLIC_SUPABASE_URL`, a modern
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and canonical `APP_ORIGIN`. Set `APP_ENV`
  explicitly to `development`, `staging` or `production`. The public request is
  independent of Admin, Cloud Run, Google identity and visitor login.
- `local-rpc`: labelled test simulation only. Requires development Node/APP
  environments, loopback app/upstream origins, a publishable test key and no Vercel.
- `disabled`, absent, unknown or incomplete configuration: unavailable state,
  no upstream request, no fixtures and no false zero result.

The default remains disabled so this PR does not change remote environment flags
or deploy anything. Supporting a mode in code is separate from activating a deployment.

No migrations, ACL, flags, secrets or deployments are applied by this work. No private
Admin/B1/B3 repository, fixture adapter, user session, Google identity or command is
used by the public path. The test server lives under `e2e/fixtures` and is never
imported by application code. The local integration always shows **Datos de prueba
locales · No son actividades reales**. It has no fallback on error.

## H2 wire mapping shared with Engine #133

Server composition: `app/(home)/page.tsx` → `loadPublicCatalog` → server-only
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

The adapter consumes H2's canonical nested types without translating price modality
or location roles into a smaller provisional enum:

| Field                                  | H2 representation                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `locations.role`                       | `activity`, `meeting_point`, `departure`, `destination`                                               |
| Location display fields                | nullable `municipality`, `neighborhood`, `pointName`, `address`                                       |
| `prices.type`                          | `free`, `fixed`, `donation`, `trial`, `early_bird`, `from`, `membership`, `subscription`              |
| `prices.scope`                         | `per_session`, `first_session_only`, `per_month`, `per_year`, `membership`, `transport`, `other`      |
| Other price fields                     | nullable amount/currency/conditions/validFrom/validTo; explicit transportCost                         |
| Category                               | explicit H2 taxonomy; never inferred from titles                                                      |
| Level, titleTranslations, requirements | `{es:string\|null,en:string\|null}`; Spanish level displayed without inventing an English translation |
| Freshness                              | lastVerifiedAt / verifiedUntil preserved separately from updatedAt                                    |
| Cursor                                 | opaque base64url-safe string, max 2048 characters                                                     |

The cursor is **canonical base64url without padding**, never PostgreSQL MIME base64.
Legacy string levels, `venue`, `session/month/year` wire scopes are rejected rather
than silently conflating them with H2. Unknown prices use an empty collection;
`free` is explicit with null money, and a donation without amount is not rendered
as zero EUR. Subscriptions, membership and first-session trials retain their labels.
Unknown Spanish level displays “por confirmar”. `localStart/localEnd` are not trusted for formatting: display is derived
from the validated instants using `Intl` with `Europe/Madrid`. No raw HTML or third-party
imagery is used. HTTPS registration URLs reject credentials, fragments and sensitive
query parameter names; unsafe data fails the response instead of exposing it.

The Engine integration test exports **real PG17/PostgREST** anonymous responses in
`target/catalog-web-contract`. From that Engine checkout run
`node scripts/verify-catalog-web-contract.cjs <absolute-Web-checkout>` after
`CatalogSupabaseReadIT`. This executes this actual repository adapter and URL
navigation over five captured pages / 105 rows, passing every emitted cursor
through a link and unchanged into the next RPC request. It also preserves all
eight price modalities, four location roles and ES/EN fields. Record both commit
SHAs with the result; the handwritten E2E fixture remains a UI simulation and
does not by itself prove RLS or this interoperability. No remote enablement follows
from these offline checks; H2/H3 review and STAGING authorization remain required.

"Próxima" describes temporal currency. "Verificada" and "Vigente hasta" use
`lastVerifiedAt` and `verifiedUntil`; "Ficha actualizada" uses `updatedAt`, **not**
`checked_at` or an invented revalidation date. Price options are shown only when their
validity includes the Madrid date of the activity. The DB
must guarantee that the projection contains only explicitly published, verified,
unexpired, unblocked, unsuspended and uncancelled occurrences. Web does not duplicate
editorial rules or try to access private data to prove those conditions. As an extra
read-time guard, the adapter validates H2's `upcoming/in_progress` status, excludes
started/ongoing and expired/future-verification rows, and rejects incompatible
states such as draft/cancelled rather than rendering them as published activities.

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

Unit tests cover explicit remote and restricted local modes, no privileged key, no backend call
when disabled, bounds/errors, private-field stripping, price semantics, Patacona in
Alboraia, local times, impossible dates, DST, stable cursors and the autumn tail.
Dedicated E2E runs the real Next route against a separate labelled HTTP simulation:
anonymous rendering, 24+3 page flow, unknown/free/monthly prices, hidden
draft/conflict/cancelled/historical fixtures, empty/failure recovery, no caching,
mobile/tablet overflow, loading, desktop and keyboard skip navigation. The normal E2E configuration
also verifies the default disabled home requires no account and invents no inventory.

These tests do **not** prove real Engine RLS, grants or editorial publication. The
negative editorial cases are simulated upstream filtering and must be repeated with
the actual #122/#123 SQL and PostgREST, without Next.js, before activation.

## Check the home against real STAGING

No migration or private Engine runtime is needed. In the authorized environment:

1. Use `APP_ENV=staging`, the actual canonical `APP_ORIGIN`,
   `NEXT_PUBLIC_SUPABASE_URL=https://yfytzogjrhwstcnzspdv.supabase.co` and its
   existing modern publishable key. Keep Admin/editorial/writer gates as configured.
2. Set `PUBLIC_CATALOG_MODE=supabase`. For a local verification use
   `APP_ORIGIN=http://127.0.0.1:3141` with `npm run dev -- --hostname 127.0.0.1 --port 3141`.
   The code permits local development to read the actual HTTPS API. Never use
   `local-rpc` for this check. Do not put keys in command arguments or tracked files.
3. Open `/` in a browser without signing in. With the current empty projection expect
   “0 actividades en esta página” and “No hay actividades publicadas para estas fechas”,
   with no cards, registration/detail links or local test banner. Use “Calendario
   completo” and change month; the same API supplies the selected bounded range.
4. Inspect server-side requests: POST to `/rest/v1/rpc/catalog_occurrences_v1`,
   profile `api`, explicit dates/cursor/limit, publishable key, no bearer or cookies.
   The browser receives rendered public content, not private table access.
5. Once deploying this PR is separately authorized, apply the same settings only
   to the dedicated Web STAGING project, deploy the reviewed SHA and repeat steps
   3–4 on its home URL. A merge does not modify existing deployment variables.
   Rollback: restore `PUBLIC_CATALOG_MODE=disabled` and redeploy the prior artifact
   through the approved deployment procedure; no SQL/ACL rollback is required.

WEB #50's consumer can be complete with empty inventory. A genuine publish/suspend
smoke, formal SQL review and backup recovery remain Engine operational gates;
they do not require invented public activities. Advanced filters (#51), SEO and
visitor authentication are outside this change. The detail page is described below (#52).

## Public detail page — Web #52

`/actividades/{uuid}` → `loadPublicOccurrenceOnce` (request-scoped `React.cache`, so
metadata and page share one call; never a cross-request cache) → server-only
`SupabasePublicCatalogRepository.get` → `POST /rest/v1/rpc/catalog_occurrence_v{1|2}`
with body `{id}`, same anonymous headers, `no-store`, redirect rejection, timeout and
1 MiB bound as the list. A malformed id never reaches the backend.

| Upstream                                    | Web result                                   | HTTP |
| ------------------------------------------- | -------------------------------------------- | ---- |
| `{contractVersion,item}` current            | detail                                       | 200  |
| 404 `PT404 NOT_FOUND`, malformed id, 400    | "Esta actividad no está disponible"          | 404  |
| item with expired verification / finished   | same not-found page                          | 404  |
| 401/403/5xx, network, timeout, bad contract | "La ficha no está disponible ahora", noindex | 200  |
| `PUBLIC_CATALOG_MODE` disabled/incomplete   | same unavailable state, no request           | 200  |

Unknown, withdrawn (SUSPEND), cancelled and expired occurrences are deliberately
indistinguishable. Only the **detail** RPC maps 404 to not-found; a 404 from the list
RPC (e.g. v2 not installed) remains an outage. The home and its `loading.tsx` live in
the `(home)` route group so the detail route is not wrapped in the home Suspense
boundary: `notFound()` therefore returns a real HTTP 404 instead of a streamed 200.

Content: category, _Próxima_/_En curso_ derived from instants, organizer, Madrid
interval (DST-safe), every location role with **Salida** before **Destino** and an
explicit note that the excursion destination is not the meeting point, current price
options with transport and conditions ("Precio por confirmar" explicitly does not
mean free), activity language, Spanish level/requirements or "por confirmar",
verification/validity/update times and, in v2, the organiser source. Registration:
v2 channel via `RegistrationAction` (WEB/WHATSAPP copy-only/PHONE/EMAIL); v1 HTTPS
URL labelled **Consultar inscripción**; nothing when absent. The page never says
_Reservar_ for a generic link, never shows availability and states that bookings are
handled by the organiser. Structured data is a schema.org `Event` without `offers`
or availability, escaped against `</script>`, and omitted in `local-rpc` mode, which
shows the same "Datos de prueba locales" banner as the home.

Offline evidence: unit tests for adapter/provider/presentation and catalogue E2E
(stable URL from the card, excursion, HTTPS CTA, SUSPEND simulation → 404, draft/
historical/unknown/malformed ids → 404, upstream failure without leaks, mobile
overflow) plus registration E2E on the detail page. This does not prove a real
STAGING publication rendered in a browser; see Web #54 for that gated test.

## Validation on 26 October 2026

- `npm run quality` PASS: formatting, lint (nine existing warnings), typecheck,
  688 Vitest tests, eight offline platform tests and production build. The existing
  Next.js 16.4.0 security warning interrupted initial runs; ordinary retries passed.
  Updating that dependency is a separate task.
- Five catalogue E2E tests PASS: anonymous 24+3 pagination, semantic labels,
  cancellation/no-cache, empty/error distinction and retry, mobile/tablet/desktop,
  loading state and keyboard skip link. Default disabled home E2E also PASS.
- Engine's `verify-catalog-web-contract.cjs` PASS with the updated adapter over
  five previously captured real PG17/PostgREST pages / 105 rows. These are test
  captures, not current STAGING inventory.
- Live browser → local Next server (`APP_ENV=staging`, `PUBLIC_CATALOG_MODE=supabase`)
  → actual STAGING API PASS at `2026-10-26T12:54:07Z` (13:54 Europe/Madrid).
  Widths 390/768/1440: HTTP 200, zero cards, explicit successful empty state,
  no local test banner, no horizontal overflow. Current/next month navigation
  succeeded; zero browser page errors. No request was mocked and no data was inserted.
  This verifies the real upstream from local Web code; it does not claim a remote
  Web deployment has been activated.

Local browser evidence: `.next-e2e-catalog-live/evidence/result.json` and
`home-390.png`, `home-768.png`, `home-1440.png` in the same ignored directory.

## Search filters and period presets — Web #51 (partial)

The home sends **only the filters the H2 RPC evaluates server-side**; nothing is
filtered, inferred or completed in the browser. Each URL parameter is validated:
a malformed or repeated value shows "No podemos mostrar esta búsqueda" and never
reaches the RPC.

| URL parameter                      | RPC argument                  | Semantics (Engine V021)                                                                                                      |
| ---------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `categoria`                        | `categoria`                   | editorial category, exact                                                                                                    |
| `municipio`                        | `municipio`                   | case-insensitive literal on `activity`, `departure`, `meeting_point`; an excursion **destination never matches**             |
| `idioma`                           | `idioma`                      | `es`, `en`, `ca`, `other`; unknown language never matches                                                                    |
| `precio=sesion` / `sin-sesion`     | `precioComparable` true/false | a current fixed **per-session EUR** option exists / does not. `sin-sesion` is **not "gratis"** and the UI says so            |
| `periodo=hoy` / `manana` / `finde` | `desde`/`hasta`               | Madrid calendar; weekend = Saturday 00:00 to Monday 00:00 (49 h / 47 h on DST weekends), starting now when already inside it |

Dimensions combine with AND. Period, month, filters, `at` and `cursor` travel in every
pagination, month and "volver al inicio" link because the RPC seals the cursor to
the exact range and filters. "Limpiar filtros" keeps the period. A filtered search
with no rows shows "No hay actividades que cumplan estos filtros". Any URL with
query parameters is `noindex, follow`; the bare home stays indexable.

After the STAGING pilot QA (#54): the filter form drops empty fields from the
submitted URL (no `idioma=&precio=`; without JavaScript empty fields are still
accepted as "no filter"), and on phones (≤ 680 px) the filters start collapsed
behind a "Filtrar actividades" toggle that shows how many are active, so results
appear on the first screen. Wider screens keep them expanded where the browser
supports `::details-content`; otherwise the toggle stays as the fallback. The
detail page has a "Saltar al contenido" link, and "Volver a la agenda" returns to
the same-origin home search the visitor came from (month, period, filters, page),
falling back to `/#activities`.

**Not implementable in Web alone (Engine contract gaps for #51):** free-text search
(activity/organizer/place), several values in one dimension (OR), "gratis" and
maximum price, neighbourhood, level, accent-insensitive municipality ("Valencia" vs
"València" are different strings for the RPC). Implementing them client-side would
filter only the current page and break the cursor, so they are left to a versioned
RPC change.

## Indexability, robots and sitemap — Web #53 (partial)

`indexableOrigin()` returns a canonical origin **only** with `APP_ENV=production`,
`VERCEL_ENV` absent or `production`, and an HTTPS `APP_ORIGIN` without path, port,
credentials, `localhost` or `*.vercel.app`. Everything else (STAGING, previews,
development, incomplete configuration) is non-indexable:

- root layout: `noindex, nofollow` meta outside production; `metadataBase` in production;
- `/robots.txt`: `Disallow: /` outside production; in production `Allow: /`,
  `Disallow: /admin, /admin-access, /auth, /api` and the sitemap URL;
- `/sitemap.xml`: empty outside production; in production the home plus each
  projected occurrence starting within 31 days (anonymous list RPC, up to 5×100 rows,
  deduplicated). Filter combinations, suspended/expired/unknown occurrences and
  private routes are never listed; a read failure keeps only what was read;
- detail canonical `/actividades/{id}` only on the production origin; unavailable
  details and filtered/paginated home URLs remain `noindex`.

Admin already sends `X-Robots-Tag: noindex` from the proxy and metadata. Activating
a production domain, ES/EN interface translations, hreflang and analytics remain
separate #53 work and require explicit authorization.
