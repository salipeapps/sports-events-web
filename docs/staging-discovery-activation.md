# STAGING activation gates — web #26 / engine #80

Updated 2026-10-09. This is a **fail-closed handoff**, not proof of a deployed
Cloud Run service. No credentials, tokens, secret values or infrastructure changes
are committed. The API remains disabled in all existing deployments.

## Verified read-only inventory

- Supabase STAGING: project `yfytzogjrhwstcnzspdv`, `eu-west-3`, ACTIVE_HEALTHY.
- Auth membership and token-hook migrations appear in remote migration history
  (`20261008211334`, `20261009065852`).
- Private `discovery_auth.custom_access_token_hook(event jsonb)` exists, is
  SECURITY INVOKER; `supabase_auth_admin` has EXECUTE and the public/client
  principals do not. Its **enablement in Authentication > Hooks and the real
  signed JWT algorithm/claim have not been confirmed**.
- One active eligible Admin membership exists (aggregate count only).
- `engine_discovery_reader` **does not exist** on remote STAGING. Do not run
  Cloud Run with the owner connection or widen discovery table grants.
- Recovered Valencia execution:
  `2c17a493-2f68-4e3e-a2bb-9d75bb7a4a06`, recovery `SUCCEEDED`,
  10 distinct candidates, 10 observations, 9 `UNSUPPORTED_REVIEWABLE`
  and 1 `AMBIGUOUS_REVIEW_REQUIRED`. This was verified with SELECT,
  **not** through private HTTP.
- GCP project/billing, Cloud Run deployment URL/revision, IAM, Terraform
  remote state, reader credentials, Vercel team/project/custom environment and
  real STAGING tokens are **not verified**. Do not invent these values.

## Activation order (operator runbook)

1. Confirm the exact GCP STAGING project/billing account and
   Vercel team/project/environment identifiers. Per the
   [engine runtime runbook](https://github.com/raulacden/sports-events-engine/blob/develop/docs/private-staging-runtime.md),
   trust requires a distinct Vercel Custom Environment `staging`
   with exact `iss`, `aud`, `sub`, `owner_id`, `project_id` and
   `custom_environment_id`; **generic Preview is not sufficient**.
   If Custom Environments are unavailable on the plan, stop and design a
   separately reviewed, dedicated staging-only Vercel project.
2. In Supabase Dashboard for **this** project, inspect
   Authentication > Hooks. Do not overwrite an existing Custom Access Token hook.
   Confirm the reviewed hook is enabled or arrange its approved activation.
   Verify a fresh admin and reviewer JWT are RS256/ES256, have the exact
   issuer/audience and signed matching `app_metadata.discovery_role`;
   never reveal the tokens. Review JWT lifetime and session revocation.
   A migration being applied **does not** enable the Auth hook by itself.
3. Review and install the [dedicated reader SQL](https://github.com/raulacden/sports-events-engine/blob/develop/scripts/prepare-admin-read-role-staging.sql)
   with the approved STAGING database change procedure. Confirm the
   role's effective SELECT permissions/RLS and absence of writes, schema
   ownership, BYPASSRLS and client discovery-table grants. No service-role or
   PostgreSQL owner account may be used as this runtime.
4. Obtain a reviewed **real** Terraform plan from
   `sports-events-engine/infra/staging` with remote state and
   `deploy_runtime=false`. Provision only after independent project/IAM
   authorization. Upload the immutable approved engine image and numeric
   Secret Manager versions; review a second plan `deploy_runtime=true`
   and activate only after checking private IAM, OIDC trust, Flyway disabled,
   provider/search runners disabled and safe budget. Never run existing
   `staging-discovery-smoke.yml`: it performs provider discovery writes.
5. In Vercel, create/confirm Custom Environment `staging` and target a
   controlled staging deployment. Scope **only to this environment**:

   | Server-only environment key            | Required source                                                |
   | -------------------------------------- | -------------------------------------------------------------- |
   | `APP_ENV`                              | Literal `staging`                                              |
   | `ADMIN_DEV_AUTH_MODE`                  | Literal `disabled`                                             |
   | `DISCOVERY_READ_MODE`                  | Initially `disabled`; `staging` after all preceding gates      |
   | `APP_ORIGIN`                           | Exact approved, stable HTTPS staging web origin                |
   | `NEXT_PUBLIC_SUPABASE_URL`             | `https://yfytzogjrhwstcnzspdv.supabase.co`                     |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existing STAGING publishable key only                          |
   | `ENGINE_STAGING_BASE_URL`              | Exact verified Cloud Run `engine_base_url` output              |
   | `ENGINE_STAGING_ID_TOKEN_AUDIENCE`     | The exact same verified HTTPS origin                           |
   | `GCP_WORKLOAD_PROVIDER_AUDIENCE`       | Exact `workload_provider_audience` output                      |
   | `GCP_INVOKER_SERVICE_ACCOUNT_EMAIL`    | Exact `invoker_service_account_email` output                   |
   | `VERCEL_EXPECTED_OIDC_ISSUER`          | Exact reviewed team-mode `https://oidc.vercel.com/<team-slug>` |
   | `VERCEL_EXPECTED_OIDC_AUDIENCE`        | Exact reviewed `https://vercel.com/<team-slug>`                |

   Confirm platform system env `VERCEL_ENV=preview` and
   `VERCEL_TARGET_ENV=staging` in the target deployment. Do not set
   these as fabricated values, and do not target generic Preview or PROD.
   The runtime reads the OIDC token from the function request header
   (Vercel injects `x-vercel-oidc-token`); it must not accept a browser
   forged header as a trust grant because Google STS verifies signed
   issuer, audience and exact IAM subject.

6. Before opening the web UI, run the **existing read-only**
   `sports-events-engine/scripts/discovery-admin-read-smoke.ps1`
   with a verified engine origin, the existing execution UUID and
   ephemeral tokens from approved real admin/reviewer accounts plus a
   short-lived Google Cloud Run ID token from the exact Vercel WIF
   identity (never a generic operator invoker credential):

   ```powershell
   ./scripts/discovery-admin-read-smoke.ps1 -ValidateOnly

   ./scripts/discovery-admin-read-smoke.ps1 -ApprovedStaging `
      -Environment staging `
      -BaseUrl '<verified engine_base_url>' `
      -ExecutionId '2c17a493-2f68-4e3e-a2bb-9d75bb7a4a06'
   ```

   Inject `DISCOVERY_ADMIN_TOKEN`, `DISCOVERY_REVIEWER_TOKEN`,
   `CLOUD_RUN_ID_TOKEN` only transiently via an approved operator process.
   Do not echo values, log headers or commit an env file. Run a real UI
   smoke as both roles, check cursor/filter/detail/401/403 behavior,
   disabled users and backend failures. Use separate read-only before/after
   row digest/count evidence and engine logs to corroborate no mutations
   and no provider dispatch.

7. Record revision/digest, request IDs/statuses, role outcomes, ten distinct
   candidates and matching ten original provenances. Only after **real**
   passing evidence activate `DISCOVERY_READ_MODE=staging` for that
   environment, redeploy, smoke UI and consider closing web #26 /
   engine #80. PROD remains disabled.

## Rollback

Set `DISCOVERY_READ_MODE=disabled` in the STAGING Custom Environment and
redeploy, leaving PROD unchanged. If there is workload identity exposure,
remove the exact invoker/WIF trust first. Restore the previously approved
engine revision if a runtime regression is confirmed; reconcile Terraform
state against the immutable previous digest. Disable the Auth hook only in a
separately coordinated Auth rollback (issued JWTs persist until expiry).
Never remove the recovered discovery candidates or re-run the historical
SerpAPI search to make acceptance pass.

## Evidence classification

- **PASS (real DB, read only):** remote STAGING migration/function/role
  inspection and 10/10 Valencia aggregate query.
- **PASS (offline only):** engine and web CI contract/test fixtures before this
  change; rerun this branch's web Quality and E2E before merge.
- **NOT RUN (real HTTP):** workload trust, Spring JWT/Cloud Run IAM,
  admin/reviewer private GET smoke, UI E2E and no-write snapshot comparison.
  Lack of approved Cloud Run and reader is a hard blocker, not a failure
  to be bypassed with public ingress or fixtures.
