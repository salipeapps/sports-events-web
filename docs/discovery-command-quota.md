# Authoritative command admission: BFF integration (#41)

Status: offline integration, 2026-10-16. **NO-GO for real writes.** Both command flags stay `disabled` in `.env.example` and the admission attestation variables stay empty. No Vercel/Cloud Run setting, GCP resource, secret, IAM grant or PROD configuration is created or changed here. Real enablement requires the independent authorization of [Engine #87](https://github.com/salipeapps/sports-events-engine/issues/87).

This replaces the reference BFF quota model of #39 (`commandQuota.ts`, removed). Engine [#102 / PR #103](https://github.com/salipeapps/sports-events-engine/pull/103) now owns the durable admission inside the private writer; its [ADR](https://github.com/salipeapps/sports-events-engine/blob/develop/docs/command-admission-adr.md) is the specification of record for the store, limits, IAM, costs and reconciliation.

## Protocol: one admission per command, made by Engine

- The writer authenticates the signed user JWT, checks `discovery:reject`, matches the reviewer to the JWT subject and then acquires one Firestore admission **before any SQL**. Every invoker and retry crosses that boundary; there is no BFF bypass and no BFF authority.
- The BFF keeps no shared quota store, issues no permit and never forwards a browser- or BFF-issued permit. A BFF reservation would double-charge each dispatch and is prohibited. The in-process 20/minute actor budget remains as an abuse backstop only; it is not a fallback when Engine is unavailable.
- The HTTP route, DTO and receipt are unchanged: `POST /api/admin/v1/discovery/candidates/{id}/rejection`, user `Authorization`, workload `X-Serverless-Authorization`, canonical `Idempotency-Key`, body `{ "reasonCode": … }`.
- Only `discovery.reject` is admitted by Engine, and Engine refuses promotion while admission is enabled. The BFF therefore treats `discovery.promote` as closed regardless of `DISCOVERY_PROMOTION_ENABLED`; the UI shows promotion as blocked. Reopening it requires a reviewed Engine promotion policy and a new Web change.

## Before dispatch (unchanged checks plus writer attestation)

1. Approved STAGING deployment, `DISCOVERY_REJECTION_ENABLED=enabled`, exact `APP_ORIGIN`/Host/`Origin`/`Sec-Fetch-Site`, JSON-only body, no query, bounded UTF-8 DTO and canonical `Idempotency-Key`.
2. Fresh Supabase identity, active membership and signed role on the boundary and again inside the client.
3. Pinned writer configuration (origin, audience, dedicated invoker; never the reader). **New:** `ENGINE_COMMAND_ADMISSION_CONTRACT` must equal `engine-authoritative-rejection-v1` and `ENGINE_COMMAND_ADMISSION_VERIFIED_ORIGIN` must equal that exact writer origin. This is an operator attestation recorded under #87 after verifying the deployed revision; changing the writer URL invalidates it. Missing, different or stale attestation => `404 NOT_CONFIGURED`, UI read-only, zero dispatch.
4. After the Vercel OIDC → STS workload exchange the BFF rereads identity, rejects a different subject (`401`) or lost role (`403`), and rereads gates/configuration. A flag closed during that latency dispatches nothing. Credentials and IAM keys never reach the browser.

## Mapping Engine outcomes

| Writer outcome                                                | BFF response                                                 | Slot in Engine          |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------- |
| `200` valid receipt                                           | `200` validated receipt                                      | released by Engine      |
| `429 RATE_LIMITED` with `Retry-After: 1..86400` delta-seconds | `429 RATE_LIMITED`, same `Retry-After`, Engine request ID    | none acquired           |
| `429` without a valid `Retry-After`                           | `503 INCOMPATIBLE_CONTRACT`                                  | unknown, treat as held  |
| `503 WRITE_UNAVAILABLE` (store/IAM/deadline)                  | `503 WRITE_UNAVAILABLE`                                      | none or retained        |
| timeout, connection loss, Cloud Run/IAM HTML                  | `503 WRITE_UNAVAILABLE` / `INCOMPATIBLE_CONTRACT`, no detail | retained if uncertain   |
| `400/401/403/404/409/422` typed errors                        | same code/status, Engine request ID                          | released after rollback |

No backend, store, SQL or IAM text is forwarded. The BFF never retries automatically. A timeout is an uncertain outcome: the browser keeps operation, candidate, key and exact body (session storage) and only an explicit user retry replays them. Engine returns the existing immutable receipt for that key; while an uncertain slot is held the replay receives `429` until the operator reconciles it. Clients must never mint a replacement key to get around that.

## Tests (offline)

- `npm run quality`: attestation missing/wrong/stale, promotion closed with flag and admin, a single upstream request with no BFF reservation, Engine `429` `Retry-After` forwarded and invalid hints failing closed, timeout → retained slot `429` → exact replay receipt, writer unreachable/IAM HTML/503 without detail, gate closed during workload exchange, subject switch and revocation after async work, CSRF/origin, DTO and receipt contract checks.
- `npm run test:e2e -- --config playwright.discovery.config.ts`: browser flows for 429/503/timeout, reload and exact retry, user change (401), revoked permissions, gates off, double click and blocked storage.
- `npm run test:e2e -- --config playwright.auth.config.ts`: real BFF routes with flags off reach neither Auth nor the writer.
- Contrast: Engine `./mvnw clean verify` covers the writer side (two JVM processes against the Firestore Emulator, signed-JWT HTTP denial before SQL, replay, uncertain results and reconciliation). Neither suite contacts STAGING; they do not replace an authorized STAGING smoke under #87.

## Rollout (only with #87 authorization)

1. Engine: writer revision with admission enabled, named Firestore DB seeded, HMAC secret and IAM verified by the operator; prove no old revision or alternate invoker skips admission.
2. Web STAGING (`sports-events-web-staging`, `develop`): set writer variables, then the two attestation variables for that exact origin, deploy with `DISCOVERY_REJECTION_ENABLED=disabled`, verify read-only UI.
3. Enable `DISCOVERY_REJECTION_ENABLED` only for the authorized smoke window; keep `DISCOVERY_PROMOTION_ENABLED=disabled`. Never touch the PROD project.

No double charge: the BFF consumes nothing, so enabling Web adds no reservation on top of Engine's single acquire.

## Rollback

1. Set `DISCOVERY_REJECTION_ENABLED=disabled` (UI read-only, route 404 before auth) and clear `ENGINE_COMMAND_ADMISSION_CONTRACT`; close the Engine gate.
2. Follow the Engine ADR: stop/drain writer revisions, reconcile uncertain slots with audited evidence, keep counters and receipts.
3. Never restore writes by reintroducing a BFF counter, a local fallback, or by deleting Engine admission state.
