# Data access

Ports/repositories used by the presentation and application layers live here.

The UI must depend on stable contracts rather than directly on fixtures, database clients or
ingestion payloads.

- `adminRepository.ts` defines the replaceable Admin v0 repository boundary.
- `fixtures/adminFixtures.ts` exposes research-backed fixture facts plus clearly labelled operational
  simulation scenarios assembled from focused fixture modules.
- `fixtures/fixtureAdminRepository.ts` provides an isolated in-memory adapter for development/tests.
- `adminRepositoryProvider.ts` selects fixtures only for explicit loopback development demo sessions.
  Hosted environments and real Supabase sessions use `UnavailableAdminRepository` until the B1
  read models have an approved contract. Missing data is `NOT_AVAILABLE`, never a fixture fallback,
  a zero metric or an empty successful response. All remote commands remain unavailable.

A future backend adapter should implement `AdminRepository` without requiring presentation changes.
See [Admin read availability](../../docs/admin-read-availability.md) for the B1/B3 boundary and pending contracts.
