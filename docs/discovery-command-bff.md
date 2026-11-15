# Private discovery command BFF v1 (#35)

The server-only BFF implements the Engine [rejection v1](https://github.com/salipeapps/sports-events-engine/blob/develop/docs/discovery-rejection-api-v1.md) and [promotion v1](https://github.com/salipeapps/sports-events-engine/blob/develop/docs/discovery-promotion-api-v1.md) contracts. Its gated [confirmation UX (#36)](discovery-review-ux.md) reuses these boundaries. Engine #87 owns writer provisioning, activation approval, shared ingress throttling, bounded live smoke and rollback. This change does not authorize activation, deployment, remote DB grants or mutations.

## Boundary

`POST /api/internal/discovery/candidates/{canonical-lowercase-uuid}/{rejection|promotion}`

Only the dedicated STAGING project/develop deployment allowed by `isApprovedStagingDeployment` is eligible. `DISCOVERY_REJECTION_ENABLED=enabled` and `DISCOVERY_PROMOTION_ENABLED=enabled` independently opt in; both default to disabled. Read mode and the temporary read smoke flag cannot enable either command. Production, generic previews and local development fail closed. Disabled endpoints return 404 before accessing Auth, DB, workload identity or the engine. The engine independently enforces its own admin API and operation gate; a web flag cannot override either gate.

Require an exact `Origin` matching the pinned `APP_ORIGIN`, the same request URL origin and Host, and `Sec-Fetch-Site: same-origin` when supplied. Missing/null/foreign Origin fails; forwarded host headers do not establish authority. Only JSON POSTs without query strings or content encodings are accepted. No CORS opt-in is provided. Input is read as bounded UTF-8 (1024 bytes rejection, 4096 promotion), including chunked bodies. Flat DTO parsing rejects duplicate keys, escaped duplicate aliases, nested values and trailing JSON. Unexpected fields are denied, including actor, role, token, comments, enabled and schedule fields. Headers supplied by the browser never become upstream actor or workload credentials.

Each attempt verifies the current Supabase identity, rereads active `admin_memberships`, verifies the exact asymmetric signed bearer and matches `app_metadata.discovery_role` to that membership through `getDiscoveryAccessToken`. Boundary authorization is checked again immediately before upstream dispatch. `discovery.reject` allows reviewer/admin; `discovery.promote` allows admin only, but promotion is closed in the BFF regardless of its flag because Engine admission covers rejection only. Editable user metadata is never authority. No token is serialized into props or responses or cached between requests. Supabase's [getClaims verification contract](https://supabase.com/docs/reference/javascript/auth-getclaims) underlies the existing bearer verifier.

An in-process actor budget allows 20 attempts per minute (invalid DTOs and replays count), has a bounded 5000-actor map, fails closed when full, and returns 429 with `Retry-After: 60`. It is only an abuse backstop: it does not coordinate across Vercel instances or restarts and is never a quota fallback. The **only** shared admission is Engine's, inside the private writer after JWT/role verification and before SQL ([Engine #102](https://github.com/salipeapps/sports-events-engine/issues/102)). The BFF reserves nothing; see [authoritative admission integration (#41)](discovery-command-quota.md). Engine remains responsible for immutable transactional actor/review audits and serializing rejection races.

## Private transport and configuration

The existing GET transport's Vercel OIDC -> Google STS -> Cloud Run workload exchange is reused. User `Authorization` and `X-Serverless-Authorization` remain independent. All requests use `no-store`, prohibit redirects and have a 30-second timeout. The browser never receives an engine origin or bearer.

Before future activation, #87 must provision, verify and pin these server-only values:

| Variable                                    | Required value                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ENGINE_COMMAND_STAGING_BASE_URL`           | Dedicated private HTTPS Cloud Run writer origin, no path/query/fragment/credentials/port |
| `ENGINE_COMMAND_STAGING_VERIFIED_ORIGIN`    | Exact origin independently verified under #87 and recorded by the operator               |
| `ENGINE_COMMAND_STAGING_ID_TOKEN_AUDIENCE`  | Exact writer origin                                                                      |
| `GCP_COMMAND_INVOKER_SERVICE_ACCOUNT_EMAIL` | Dedicated approved writer invoker account                                                |
| `ENGINE_COMMAND_ADMISSION_CONTRACT`         | Exactly `engine-authoritative-rejection-v1` once #87 verifies the writer revision        |
| `ENGINE_COMMAND_ADMISSION_VERIFIED_ORIGIN`  | Exact writer origin for which that admission attestation was recorded                    |

The writer URL/account must differ from `ENGINE_STAGING_BASE_URL` / `GCP_INVOKER_SERVICE_ACCOUNT_EMAIL`. There is no reader fallback. The existing provider audience and fixed STAGING OIDC issuer/audience/project claims are also required. The verified-origin variable records an operational check; assigning it is not proof of a deployed or authorized writer. No writer has been activated by this implementation. Keep both web gates disabled until #87 supplies that evidence and express authorization. Roll back by disabling the affected web gate and engine gate, then follow #87's writer rollback procedure; read mode remains independent.

## DTOs and retry contract for #36

Supply exactly one canonical lowercase UUID `Idempotency-Key`, generated once for each explicit user intent and retained across refresh/uncertain retries. The BFF never invents or replaces the key and never automatically retries, deduplicates in memory or fabricates a successful receipt.

Rejection body contains only `reasonCode`: `UNSUITABLE_SOURCE`, `OUT_OF_SCOPE`, `DUPLICATE_SOURCE` or `INVALID_SOURCE`. Pending review is an implicit engine precondition; no observation counter or classification version belongs to this body.

Promotion body contains exactly `expectedReviewStatus: PENDING_REVIEW`, `expectedClassificationVersion` (classification ruleset integer 1..1000000), `sourceName` (trimmed, nonblank, <=120, no control characters), `sourceKind` (engine enum), `canonicalSourceUrl` (normalized HTTPS URL <=2048), `adapterKey`, `allowedDomain` (exact normalized hostname) and `requestBudget` (integer 1..8). Current compatibility and candidate identity/version are checked atomically by the engine. Use supported offline Momoyoga fixtures; the historical Valencia candidates remain incompatible. New/reused sources must satisfy the engine's disabled, UNTRUSTED, MANUAL_ONLY contract. No search, provider, capture, scheduling or publication command exists here.

Only validated receipt fields are returned. Every response is `no-store` with an `X-Request-ID`. Typed errors contain only `{code, requestId}`; engine correlation IDs are retained when verified. Handle 400/401/403/404/409/422/429/503 explicitly. An invalid upstream contract maps to 503 `INCOMPATIBLE_CONTRACT`; transport/workload failures map to 503 `WRITE_UNAVAILABLE`. Engine HTML, malformed JSON, mismatched IDs/status/reason/actor and oversized responses are rejected. SQL, provider text, tokens, exceptions and additional fields are not forwarded.

On 409 show the conflict and refresh state; do not generate a replacement command automatically. On timeout/503 the outcome can be uncertain: keep the exact operation, candidate, key and payload. A later user-approved retry must use the same intent. Engine persisted receipts provide replay/race semantics across processes; offline HTTP mocks prove BFF forwarding and conflict handling, not real database concurrency.

## Offline validation

- `npm run quality`: formatting, lint, types, unit/HTTP contract and boundary tests, production build.
- `npm run test:e2e -- --config playwright.auth.config.ts`: Supabase Auth HTTP fixtures, cookie sessions, roles, revocation and disabled command routes.
- `ADMIN_DEV_AUTH_MODE=disabled npm run test:e2e -- e2e/admin-auth.spec.ts`: anonymous routes fail closed.
- Codex review before PR delivery.

These checks do not contact a live writer and do not prove STAGING issuance/ingress, shared throttling, DB grants or mutation behavior. Those belong to #87/#34 with approval.
