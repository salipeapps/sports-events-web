# Admin authentication and authorization boundary

Issue #3 protects `/admin` without coupling the UI to a concrete identity provider.

## Request flow

1. `src/app/admin/layout.tsx` asks `getAdminAccess()` for request-time access.
2. `src/integrations/auth/adminAuth.ts` selects an `AdminSessionProvider`.
3. Without a real provider, the default provider fails closed.
4. An unauthenticated request is redirected to `/admin-access`, which is also `noindex`.
5. Authenticated requests receive the Figma-based `AdminShell`.

The future real provider can replace the adapter without changing the shell or authorization contracts.

## Local development mode

The only temporary bypass is explicit and server-only:

```dotenv
APP_ENV=development
ADMIN_DEV_AUTH_MODE=enabled
ADMIN_DEV_AUTH_ROLE=admin
ADMIN_DEV_AUTH_NAME=Local Admin
```

It defaults to disabled. Configuration throws if the bypass is enabled with either
`APP_ENV=production` or the runtime `NODE_ENV=production`, so it cannot silently become a
production access path.

## Roles and server authorization

`admin` and `reviewer` can view the dashboard and perform editorial review/publication.
Sensitive infrastructure operations remain admin-only:

- source configuration;
- manual engine execution;
- platform settings.

Server actions/API handlers must call `requireAdminCapability()`; hiding a control in the UI or
setting `noindex` is not authorization.

## Responsive decisions

Figma defines the 1440 px desktop Admin shell. Below 900 px the same hierarchy and tokens are kept,
while the fixed left navigation becomes a horizontally scrollable navigation strip above the
workspace. No separate mobile visual language is introduced.
