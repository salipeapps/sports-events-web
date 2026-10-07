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
  stable data-access contracts/ports
       |
       v
src/domain
  business concepts and rules

src/integrations
  concrete adapters for external services and infrastructure
```

Presentation code must not bind itself to scraper payloads or a future database SDK. The next step
(issue #2) is to define Admin domain contracts and an interchangeable data source backed initially
by fixtures.

## Environment variables

- `.env.example` documents supported variables.
- Local values belong in `.env.local`, which is ignored by Git.
- Variables without the `NEXT_PUBLIC_` prefix are server-only by default in Next.js.
- Secrets must never be committed or exposed through public variables.

## Admin route

`/admin` exists from the bootstrap so the administrative product can evolve in parallel with
ingestion. Real authentication/authorization is deliberately out of scope for issue #1 and is
tracked by issue #3. A route being hidden or marked `noindex` is not a security boundary.
