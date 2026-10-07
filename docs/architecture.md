# Architecture baseline

## Goal

Keep the public experience, administration and ingestion-related integrations independently
replaceable while sharing stable domain concepts.

## Boundaries

```text
src/app
  Next.js routing and composition only
       |
       v
src/presentation
  public/      visitor-facing components
  admin/       private/admin components
       |
       v
src/data
  AdminRepository port + replaceable adapters
       |
       v
src/domain
  business contracts, evidence model and validation helpers

src/integrations
  auth/        replaceable Admin session provider
  future external services and infrastructure adapters
```

Presentation code must not bind itself to scraper payloads or a future database SDK. Admin v0 has
stable domain contracts plus `AdminRepository`; development/tests use `FixtureAdminRepository`.
A future backend implementation can replace that adapter without changing presentation contracts.

The event model deliberately separates evidence, extracted values, final editorial values,
deterministic rules, AI evaluation, conflicts and duplicate/change proposals. Editorial status and
temporal status are independent.

See `docs/admin-data-contracts.md` for the contract and fixture conventions.

## Environment variables

- `.env.example` documents supported variables.
- Local values belong in `.env.local`, which is ignored by Git.
- Variables without the `NEXT_PUBLIC_` prefix are server-only by default in Next.js.
- Secrets must never be committed or exposed through public variables.
- The temporary Admin development bypass defaults to disabled and is rejected in production.

## Admin route and authorization

`/admin` is request-time protected by the replaceable Admin session-provider boundary. The
current default fails closed; local development can explicitly enable a development-only provider.
`admin` and `reviewer` share editorial access, while sensitive capabilities are checked
independently through `requireAdminCapability()`.

A route being hidden or marked `noindex` is not a security boundary. See `docs/admin-auth.md`.
