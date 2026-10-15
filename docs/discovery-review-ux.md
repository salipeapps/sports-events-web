# Discovery source decisions UX (#36)

The real queue at `/admin/discovery?tab=resultados` links to candidate inspection and contextually advertises rejection/promotion when available. `/admin/discovery/results/{id}` owns the explicit confirmation flow. Technical classification, human review status and a linked B2 source remain separate. An approved candidate without `linkedSourceId` is never described as promoted.

## Access and read-only mode

Pages obtain the current verified session through `requireAdminAccess("discovery.view")`. Server-only `getDiscoveryReviewAccess` derives capabilities, independent operation gates and writer configuration readiness. Only those display capabilities and the current subject are serialized; no JWT, workload token, private writer origin or privileged configuration reaches the client. Display permissions do not authorize operations: every POST still passes through the #35 BFF, including its fresh membership/signed-claim checks, same-origin boundary and independent engine gates.

- Reviewer: rejection when enabled; never promotion.
- Admin: rejection when enabled; promotion only for an unlinked, pending `SUPPORTED_ADAPTER_CANDIDATE` with an adapter hint and promotion enabled. The engine rechecks compatibility, version, domain and B2 restrictions atomically.
- Gates off, incomplete writer configuration or an ineligible deployment: inspection/history remain; no operational form is mounted. No new environment switches or defaults are introduced.
- Conserve / requires adapter is information, not a simulated mutation. It creates no approval, B2 source, search, capture or publication.

The historical Valencia queue remains nine unsupported and one ambiguous. The supported Momoyoga example exists only in offline tests; the application never imports these test fixtures.

## Confirmation and retries

Rejection requires one of the four contract reason codes, translated into Spanish labels. Promotion requires a source name, type and integer budget (1–8); canonical URL, exact domain, adapter and classification ruleset version come from the inspected candidate. Its confirmation explains `UNTRUSTED`, disabled, manual-only and no schedule/capture/publication. The engine remains authoritative for these guarantees.

Both commands open a native modal dialog with an explicit confirm and cancel. Sending disables confirmation/cancel and a synchronous lock prevents double dispatch. Escape/cancel before dispatch sends nothing and restores focus. Status messages use a live region and receive focus after submission; UI strings never display exception/provider payloads.

One UUID key is created per confirmed intent. Before dispatch, the exact key, operation, DTO, candidate ID and subject are saved to versioned **sessionStorage**, scoped by verified actor and candidate. This storage contains no credential. Browser storage must be available; otherwise submission fails closed. The retry record lasts for that tab/session, not permanently across closing the browser or clearing storage. A corrupt or unreadable record blocks a replacement intent.

- Network failure, timeout, malformed receipt, 503 or 429: retain the exact intent and display its summary. The user can consult fresh state or explicitly confirm a retry with the same key and DTO. No automatic retry, changed payload or replacement key is generated. A committed decision may already appear after refresh; its original receipt can still be recovered by replay.
- 409: clear the rejected intent, request fresh state and lock further decisions until the user reopens and inspects the candidate. Never retry a conflicting command automatically.
- 400/422: show a fixed safe message; allow correction and another confirmation.
- A failed replay cannot disprove the outcome of the earlier uncertain attempt: retain its key and DTO even on 400/401/403/404/422. `NOT_CONFIGURED` (also HTTP 404) always retains the intent, including across gates being disabled and subsequently restored. While gates are off no operational form is mounted; the saved intent becomes recoverable when the operation is available again.
- 401/403: show verification/permission failure, request fresh state and lock new decisions. Do not sign out or clear cookies in response to a command error. Normal page authentication still applies when refreshed.
- Success: accept only a candidate-matching operation receipt, clear the retry record, disable further decisions and request fresh detail/history. Candidate badges and audited actor/time come from the subsequent engine GET, not a fabricated local review.

The route invalidates `/admin/discovery` (including filter views) and the concrete detail path after 200/409. GETs remain `no-store`/dynamic, and the client calls `router.refresh()`. Reopening the queue loads real current state. Linked B2 IDs are displayed without linking to the separate fixture-backed source repository; the source's returned status and enabled state are explicit.

## Validation

```powershell
npm run quality
npm run test:e2e
$env:ADMIN_DEV_AUTH_MODE = 'disabled'
npm run test:e2e -- e2e/admin-auth.spec.ts
Remove-Item Env:ADMIN_DEV_AUTH_MODE
npm run test:e2e -- --config playwright.auth.config.ts
npm run test:e2e -- --config playwright.discovery.config.ts
```

Vitest covers role/gate eligibility, actor-scoped recovery, invalid drafts, safe writer-configuration failure and cache invalidation, alongside the existing #35 boundary/contract/authentication tests. The Supabase Auth HTTP fixtures cover anonymous, reviewer, admin, revoked membership, expired/forged sessions and closed command routes.

The discovery Playwright configuration runs the production presentation components in a separate loopback-only Vite harness. It mocks navigation refresh and HTTP responses; it never starts a writer or calls Supabase, Google IAM, the engine or a paid provider. Vite is pinned to the version already resolved for Vitest. Browser cases cover rejection/history after refresh, compatible admin promotion, the incompatible ten-candidate queue, gates off, 401/403/422/429/503, a committed-but-uncertain replay, 409 concurrent state, double click, network failure, keyboard/cancel/focus and a 390px mobile dialog. These are offline UX and contract proofs, not database persistence/concurrency or STAGING acceptance.

**Activation and live acceptance remain Engine #87 / Web #34.** This PR neither enables web/engine gates nor changes deployments, IAM, DB grants or production. Keep the gates off until the dedicated writer and bounded live test have express operator authorization. Merging UI code does not authorize writes.
