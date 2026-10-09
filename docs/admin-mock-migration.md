# Sustitución de adaptadores Admin v0

1. Mantener los contratos de `src/domain/admin.ts`, `src/domain/discovery.ts` y `src/data/adminRepository.ts`.
2. Reemplazar únicamente las factorías server-only `src/data/adminRepositoryProvider.ts` y `src/data/discoveryRepositoryProvider.ts`.
3. Obtener en el motor listas paginadas de candidaturas vinculadas a cada ejecución, **incluidas las ya publicadas**. `listCandidates` es solo el catálogo editorial.
4. Convertir campos no observados en `FieldValue.unknown` (nunca importe cero) y rechazar identificadores de fuente no revisados.
5. Autorizar escrituras en servidor con `requireAdminCapability`, motivo y versionado; no habilitar botones de ejecutar, editar proveedores ni promover fuentes hasta conectar endpoints seguros.
6. Conservar `AdminSessionProvider` de `src/integrations/auth/adminAuth.ts`: ya verifica identidad Supabase y membership activa. El bypass queda limitado al desarrollo local.
7. Conservar E2E contra fixtures como smoke estable; añadir una suite de contrato contra el motor con datos de prueba controlados, sin secretos de proveedores ni scraping externo.

## Identity after issue #24

`AdminSessionProvider` now verifies Supabase identity and current database membership independently
of the fixture engine repositories. Keep it when replacing data adapters. Each new server operation
must recheck identity/capability before reading or mutating engine data. Browser actor/role fields
are never authoritative. `reviewer` may review/publish fixture editorial work; engine requery and
reprocess require `runs.execute`. Real engine calls remain disabled/out of scope.

See [admin-auth.md](admin-auth.md) for isolated web/Auth migration ownership, current STAGING
validation and pending invitation/SMTP/origin prerequisites. Preserve deterministic fixture E2E
and add a separate engine contract suite only when that integration is authorized.
