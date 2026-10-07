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
  concrete adapters for external services and infrastructure
```

Presentation code must not bind itself to scraper payloads or a future database SDK. Admin v0 now
has stable domain contracts plus `AdminRepository`; development/tests use `FixtureAdminRepository`.
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

## Admin route

`/admin` exists from the bootstrap so the administrative product can evolve in parallel with
ingestion. Real authentication/authorization is deliberately out of scope for issue #2 and is
tracked by issue #3. A route being hidden or marked `noindex` is not a security boundary.
