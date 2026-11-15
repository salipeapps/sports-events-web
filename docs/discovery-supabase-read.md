# Admin Discovery: adaptador Supabase H1 (#48)

Estado: **borrador offline, no activable todavía**. La propuesta H0 del Engine
(`#120`, `docs/hybrid-read-contract-v2.md`) aún requiere aprobación y #121 aún debe
implementar la superficie DB. Este cambio prepara el consumidor; no acredita RLS,
grants, RPC desplegadas ni acceso a candidatos reales.

Se conserva `DiscoveryReadRepository`, `requireAdminAccess("discovery.view")` y
`getDiscoveryAccessToken`. Antes de **cada RPC**, este último verifica identidad
online, membresía activa, firma/issuer/audience/subject/expiry/rol del bearer exacto,
coincidencia de `app_metadata.discovery_role` y usuario del bearer online. La DB debe
repetir autorización y membresía dentro de cada RPC para cubrir revocaciones durante
la petición. No se confía en `user_metadata`, ni se cachea autorización.

## Transporte y bindings propuestos

`supabaseRead.ts` es server-only. Solo envía POST de lectura a
`NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/<nombre fijo>` con `Content-Profile: api`,
clave `sb_publishable_*` y `Authorization: Bearer <usuario>`. No usa claves secretas,
JDBC, service_role, OIDC, STS, IAM ni reader Cloud Run. Sin redirecciones, caché,
reintentos automáticos o fallback; timeout 10 s y respuesta máxima 1 MiB.

| Método                | RPC en esquema `api`                | Parámetros además de página                                                                  |
| --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| candidates            | discovery_candidates_v2             | p_review_status, p_classification_kind, p_query_id, p_provider_key, p_execution_id, p_search |
| candidate             | discovery_candidate_v2              | p_id                                                                                         |
| candidateObservations | discovery_candidate_observations_v2 | p_id                                                                                         |
| candidateReviews      | discovery_candidate_reviews_v2      | p_id                                                                                         |
| providers             | discovery_providers_v2              | ninguno                                                                                      |
| queries               | discovery_queries_v2                | ninguno                                                                                      |
| executions            | discovery_executions_v2             | p_provider_key, p_query_id                                                                   |
| execution             | discovery_execution_v2              | p_id                                                                                         |
| executionObservations | discovery_execution_observations_v2 | p_id                                                                                         |

Página: `p_cursor` opcional y `p_limit` (default 50, rango 1..100). La UI pide 20.
Filtros vacíos se omiten. Estos **nombres de parámetros son una propuesta Web**,
no una firma SQL verificada. Deben reconciliarse con la PR de #121 y quedar cubiertos
por fixtures obtenidos del PostgreSQL/PostgREST local real antes de quitar el draft.

Respuesta lista: `{contractVersion:2,items:[],nextCursor:null|string}`.
Detalle: `{contractVersion:2,item:DiscoveryCandidateDetail|DiscoveryExecution|null}`.
`item:null` significa NOT_FOUND; un 404 de PostgREST significa NOT_CONFIGURED (RPC
ausente). HTTP 400/401/403/409 se traduce a errores seguros; otros fallos a
READ_UNAVAILABLE. No se serializan mensajes/hints/SQL del proveedor.

El contrato v2 amplía nulabilidad de DTOs; v1 conserva su validación estricta.
El decodificador v2 rechaza campos extra, versiones ajenas, IDs/relaciones erróneos,
duplicados en una página, más filas que el límite, cursor repetido o cursor en
página vacía. Conserva estados, contadores desconocidos y coste nulos. Reviewer
recibe caps/config de proveedor, expresión/presupuesto/programación de consulta,
config de fuente y expresión de ejecución nulos. `reviewerRef` y `cost` son nulos
para ambos roles. La UI representa nulos como «Sin dato», sin inventar valores.

La DB define keyset por UUID exclusivo, proveedor por clave, cursor vinculado a
recurso/filtros y filtros sobre una misma observación. Web trata el cursor como
opaco y lo reenvía conservando filtros; los mocks no demuestran ese SQL. La DB
también debe sanear títulos, snippets y URLs, excluir secretos/PII y limitar
fan-out/planes. La validación Web no sustituye esos controles ni protege llamadas
directas a PostgREST.

## Selección y rollback

Sin tocar configuración remota, se prepara `DISCOVERY_READ_MODE=SUPABASE_READ`.
Solo se admite con las mismas comprobaciones de proyecto, rama, origen y Supabase
del STAGING dedicado ya utilizadas por el reader histórico. PROD, Preview genérico,
desarrollo con bypass y otros proyectos quedan cerrados. Deben mantenerse
`DISCOVERY_STAGING_SMOKE_ENABLED`, `DISCOVERY_REJECTION_ENABLED` y
`DISCOVERY_PROMOTION_ENABLED` deshabilitados. El BFF de comandos también deniega
cuando se solicita SUPABASE_READ, incluso ante flags contradictorios.

Solo `/admin/discovery` y sus detalles consumen el adaptador. El resto de Admin
sigue con sus contratos existentes. No se consulta `published_occurrences`.
El reader histórico sigue disponible únicamente mediante su modo explícito previo;
su retirada verificada corresponde a #55. Rollback seguro: cambiar el modo a
`disabled`; no se cae automáticamente a HTTP ni a fixtures. El modo demo sigue
limitado a desarrollo local.

## Evidencia y pasos pendientes

- Unitarios: nueve RPC, filtros, página/cursor, nulos, sesión denegada/revocada,
  respuestas 401/403/5xx, versión, campos extra, configuración y selección real de
  fábrica sin variables Google. Fixtures de respuesta simuladas según H0.
- E2E de Auth/Discovery existentes y regresión de visualización de campos ocultos.
  Son pruebas offline, no acreditan una sesión o diez filas de STAGING.
- Antes de aprobar: #120 acordada; #121 en PR con firmas y respuestas reales,
  matriz PG17/PostgREST anónimo/no miembro/revocado/admin/reviewer, sin DML y sin
  permisos sobre bases privadas; reemplazar/contrastar fixtures de respuesta.
- Después, bajo autorización operacional separada: migración/ACL y despliegue
  STAGING; smoke de diez candidatos históricos para admin/reviewer, cero datos para
  anónimo/no miembro/revocado, filtros/cursor/detalles y cero llamadas Cloud Run.
  Si no hay diez filas, registrar el inventario observado sin fabricar datos.
- Esta PR no ejecuta migraciones, cambia flags/secrets/IAM, despliega ni muta DB.

Referencias: [issue Web #48](https://github.com/salipeapps/sports-events-web/issues/48),
[Engine #120](https://github.com/salipeapps/sports-events-engine/issues/120),
[Engine #121](https://github.com/salipeapps/sports-events-engine/issues/121),
[Supabase RPC](https://supabase.com/docs/reference/javascript/rpc),
[autenticación SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
