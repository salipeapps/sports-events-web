# Admin Auth v1

The prepared JWT bridge and future STAGING activation/rollback procedure are in
[Discovery Auth bridge](discovery-auth-bridge.md). It derives the signed engine role
from this same membership table; activation and the discovery HTTP adapter remain pending.

## Architecture

Supabase Auth owns identity; `public.admin_memberships` owns authorization. The existing
`AdminSessionProvider`, `AdminAccessResult` and capability contracts remain the boundary.
`SupabaseAdminSessionProvider` calls `getUser()` (server-verified, current Auth record), then
reads the current membership using the user's JWT and RLS. Missing/invalid identity,
provider failures, missing/inactive membership and unknown roles deny access. Editable
`user_metadata` never grants capabilities. Roles are never cached across requests.

`src/proxy.ts` refreshes SSR cookies with `getClaims()` and forwards refreshed cookies to both
request and response. Cookies are HttpOnly, SameSite=Lax and Secure on HTTPS. No browser Auth
client is needed: login, recovery, password update and logout use Server Actions with Next.js
origin checks. `getSession()` is never used as evidence of identity.

Every private page verifies its required capability before reading data, independently of the
layout. Editorial actions reverify identity and membership; requery/reprocess require
`runs.execute`. Source, discovery and execution pages require their corresponding admin-only
capability. Future Route Handlers must call `getAdminAccess()` and
`requireAdminCapability()` before any read/write, returning 401 for missing identity and 403
for insufficient permission. Never rely on Proxy, layout, hidden buttons or client payloads
alone. Engine APIs and real publication remain out of scope; engine repositories still use fixtures.

Private responses use `private, no-store` and `noindex`. `/` remains public. Tab focus/visibility
refreshes server authorization so logout in another tab is observed. Already displayed content
cannot be recalled; the next request checks the current membership. Supabase global signout
revokes refresh tokens, but issued access tokens can remain valid until expiry. For an immediate
administrative withdrawal, deactivate the membership first. MFA and session-id revocation checks
are follow-up requirements before real sensitive production operations.

## Configuration and environments

- `NEXT_PUBLIC_SUPABASE_URL`: exact Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: `sb_publishable_...`; never a service-role/secret key.
- `APP_ORIGIN`: canonical allowed web origin, with no path/query. Used to build redirects;
  request Host and `next` parameters never select an external destination.
- `ADMIN_DEV_AUTH_MODE=disabled`: all deployed environments.
- Local bypass additionally requires `APP_ENV=development`, runtime `NODE_ENV=development`,
  a loopback HTTP `APP_ORIGIN`, a loopback request Host and absent `VERCEL`/`VERCEL_ENV`.
  Misconfigured Preview, STAGING and production fail closed.

Verified existing projects on 2026-10-08:

| Environment      | Project ref            | URL                                        |
| ---------------- | ---------------------- | ------------------------------------------ |
| STAGING          | `yfytzogjrhwstcnzspdv` | `https://yfytzogjrhwstcnzspdv.supabase.co` |
| PROD (untouched) | `akqxscbqtqwtducvlozs` | `https://akqxscbqtqwtducvlozs.supabase.co` |

Set Vercel Preview variables to STAGING and its **explicit approved preview origin**.
Do not use wildcard redirect origins or copy PROD values into Preview. A stable STAGING domain
is preferable. Future Production variables must reference PROD, with its own origin and bypass
disabled; configuring/deploying PROD is not part of this change. Missing/invalid Auth configuration
denies Admin without breaking the public shell.

## Remote Auth configuration

Read-only `/auth/v1/settings` inspection confirmed `disable_signup=true`, anonymous users disabled and email authentication enabled on STAGING. Keep these settings. In the verified STAGING Dashboard, verify **Allow new users to sign up** remains disabled;
use invitation-only administrative provisioning. This cannot be guaranteed by absence of signup
UI, so confirm the provider setting before allowing access.

Set Site URL to the approved `APP_ORIGIN`. Add only exact approved redirect URLs:
`APP_ORIGIN/auth/confirm` and the approved local development equivalent when needed. Recovery
uses PKCE; invite/recovery email templates should link to:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite">Activate account</a>
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

Use the relevant template only. A trusted administrator sets invitation RedirectTo to
`APP_ORIGIN/auth/confirm`. The confirmation handler accepts only invite/recovery OTP types or
PKCE code, verifies them, then removes all token/query parameters by redirecting to
`/admin-access/password`. No user-selected return destination is supported. Expired links return
to access with a generic expiry message. The password form requires 12–128 characters and matching
confirmation, verifies the current user, updates the password and signs out before fresh login.

Verify SMTP sender/domain, delivery, rate limits and templates with an approved invited test
mailbox. No emails were sent in this implementation. Default Supabase SMTP must not be assumed
suitable for production. Never log tokens/passwords or capture real login traces.

## Administrative provisioning

Use Supabase Dashboard Auth invitation (trusted project administrator), never a public endpoint.
After inviting, copy the verified Auth user UUID and provision by restricted SQL:

```sql
insert into public.admin_memberships (user_id, role, is_active, updated_by, change_reason)
values ('VERIFIED-AUTH-UUID', 'reviewer', true, 'operator-ticket', 'Approved invitation');

-- Role changes or withdrawal require privileged SQL, never the user's client.
update public.admin_memberships
set is_active = false, updated_at = now(), updated_by = 'operator-ticket',
    change_reason = 'Approved access withdrawal'
where user_id = 'VERIFIED-AUTH-UUID';
```

For an admin use role `admin` only after explicit administrative approval. Document the operator
and reason for every change. Deactivation blocks the next Admin request even with an unexpired
JWT. Revoke Auth sessions as an additional step. Never authorize by email alone.

## Migration ownership and rollback

`supabase/migrations/20261008211236_admin_memberships.sql` belongs to **sports-events-web**.
It creates only `public.admin_memberships`, owned by postgres, with FK to Auth, constraints,
RLS and an own-row SELECT policy. Authenticated clients can read only user_id/role/is_active;
PUBLIC/anon have no access; clients cannot INSERT/UPDATE/DELETE or activate themselves.
Audit fields are accessible only through the trusted administrative channel.

Apply this exact migration after confirming target project, privileges and absence of an existing
table. Do not run broad `db push`, `db pull`, reset or diff against the shared engine database.
Do not edit Flyway history or use web migrations for the engine's tables. The MCP application
uses migration name `web_admin_memberships`; its remote timestamp differs from the generated local
filename. Treat the matching migration as already applied on STAGING, do not apply it twice.
For a fresh approved environment apply the versioned SQL once through the restricted migration channel.

Rollback: first disable Admin access/configuration, export memberships through a trusted channel
if retention is needed, then execute `drop table public.admin_memberships;` with explicit target
verification. This removes roles only, not Auth users or engine data. Reapply the migration and
restore approved memberships to recover. No rollback was performed.

## Validation status

STAGING: project identity and postgres CREATE permission verified; no preexisting membership table
and zero Auth users at inspection. Migration applied successfully. Live catalog verification:
RLS enabled, owner postgres, own-row SELECT policy present, authenticated can read role but cannot
INSERT/UPDATE, anon cannot SELECT. Transactional RLS tests also passed: own-row isolation, role/activation update denied, self-provision denied and anon read denied. All synthetic Auth users/memberships were rolled back; both counts returned to zero. Security advisors reported no findings for the new table; 35 informational entries concern existing engine tables with RLS and no policies (left untouched). PROD and engine tables were not modified.

**Real Auth smoke remains PENDING**, not passed: missing approved STAGING web origin and SMTP/template confirmation, and an approved invited test account.
No remote Auth configuration was changed. After those prerequisites are supplied, validate login,
refresh, invitation/password setup, recovery, logout, admin/reviewer, inactive/missing membership,
RLS escalation and all private routes. Fixtures do not satisfy the STAGING Auth acceptance criteria.

Local deterministic HTTP fixture suite uses the real Supabase SDK and SSR cookie integration;
it is isolated in `e2e/fixtures/auth-server.mjs`, has no deployed application toggle and makes no
requests to Supabase. Run:

```bash
npm run quality
npm run test:e2e
ADMIN_DEV_AUTH_MODE=disabled npm run test:e2e -- e2e/admin-auth.spec.ts
npm run test:e2e -- --config playwright.auth.config.ts
```

On Windows set `PLAYWRIGHT_CHANNEL=msedge` when Chromium is unavailable. Tests use separate Next
output directories to preserve an existing development server. CI runs all three browser passes.

The login/recovery UI composes the existing access card, color/type tokens and button system.
No visual redesign is intended. A fresh Figma comparison is pending a node-specific Foundations
link; the general file link did not return a selected frame. Existing typography was preserved.
