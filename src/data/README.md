# Data access

Ports/repositories used by the presentation and application layers live here.

The UI must depend on stable contracts rather than directly on fixtures, database clients or
ingestion payloads.

- `adminRepository.ts` defines the replaceable Admin v0 repository boundary.
- `fixtures/adminFixtures.ts` exposes research-backed fixture facts plus clearly labelled operational
  simulation scenarios assembled from focused fixture modules.
- `fixtures/fixtureAdminRepository.ts` provides an isolated in-memory adapter for development/tests.

A future backend adapter should implement `AdminRepository` without requiring presentation changes.
