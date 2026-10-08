# sports-events-web

Web application for the Sports Events project. The first implementation phase focuses on the
administrative workflow that will inspect and curate events produced by the ingestion engine.

## Stack

- Next.js 16.4 / App Router
- React 19.3
- TypeScript
- ESLint + Prettier
- Vitest + Playwright
- GitHub Actions

## Requirements

- Node.js 24.x
- npm

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:

- `/` — public shell
- `/admin` — Admin v0 bootstrap

> The Admin is **private by default**: an unauthenticated request redirects to `/admin-access`.
> Only the explicit local development bypass described in `docs/admin-auth.md` enables its fixture UI.
> There is no production identity provider or persistent backend yet; do not deploy it as an operating admin.

## Quality commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run quality
npm run test:e2e
```

`npm run quality` runs formatting, linting, type checking, tests and a production build. The same
quality command runs in GitHub Actions for pull requests and pushes to `develop` (and release branches such as `master`).

## Project structure

```text
src/
  app/                 Next.js routes and route composition
    admin/             /admin route
  presentation/
    public/            visitor-facing UI
    admin/             administration UI
  domain/              business concepts and rules
  data/                data-access contracts/ports
  integrations/        provider/infrastructure adapters
  config/              server configuration helpers
docs/
  architecture.md      architectural boundaries and decisions
```

The key rule is that presentation code consumes stable domain/data contracts. It must not depend
directly on ingestion payloads, fixtures, a database SDK or an AI/search provider. This allows issue
#2 to introduce a fixture-backed Admin data source that can later be replaced by the real backend
without rewriting screens.

## Environment configuration

Copy `.env.example` to `.env.local` for local overrides. Local environment files are ignored by
Git; `.env.example` is intentionally safe to commit. Never store secrets in variables prefixed
with `NEXT_PUBLIC_`.

## Admin v0 roadmap

- #1 bootstrap and quality baseline
- #2 domain contracts and fixture-backed data adapter
- #3 private shell and access control
- #4 dashboard and candidate queue
- #5 candidate review and editorial decisions
- #6 sources and engine runs
- #7 E2E vertical-slice validation

See `docs/architecture.md` for the baseline architecture.

## Admin v0 E2E acceptance

See [Admin v0 visual/E2E validation](docs/admin-v0-e2e.md) and the
[adapter migration checklist](docs/admin-mock-migration.md).

The Playwright job exercises the request-protected Next.js app with fixtures; a second run
verifies that all Admin routes fail closed without an authenticated session. Screenshots
for Figma's four Admin frames are attached to Playwright test reports. Discovery is an
explicitly read-only demo until the engine exposes real execution/promotion operations.
