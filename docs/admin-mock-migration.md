# Sustitución de adaptadores Admin v0

1. Mantener los contratos de `src/domain/admin.ts`, `src/domain/discovery.ts` y `src/data/adminRepository.ts`.
2. Reemplazar únicamente las factorías server-only `src/data/adminRepositoryProvider.ts` y `src/data/discoveryRepositoryProvider.ts`.
3. Obtener en el motor listas paginadas de candidaturas vinculadas a cada ejecución, **incluidas las ya publicadas**. `listCandidates` es solo el catálogo editorial.
4. Convertir campos no observados en `FieldValue.unknown` (nunca importe cero) y rechazar identificadores de fuente no revisados.
5. Autorizar escrituras en servidor con `requireAdminCapability`, motivo y versionado; no habilitar botones de ejecutar, editar proveedores ni promover fuentes hasta conectar endpoints seguros.
6. Reemplazar `AdminSessionProvider` de `src/integrations/auth/adminAuth.ts` por sesiones reales. El acceso local queda bloqueado en producción.
7. Conservar E2E contra fixtures como smoke estable; añadir una suite de contrato contra el motor con datos de prueba controlados, sin secretos de proveedores ni scraping externo.
