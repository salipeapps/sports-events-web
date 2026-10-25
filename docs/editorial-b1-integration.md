# H3 B1 · Admin editorial ↔ Engine Java (#59)

Estado: **preparación offline; NO-GO STAGING/PROD**. No sustituye la cola de **fuentes B2**
de Web #34 ni las vistas B1 generales, todavía `NOT_AVAILABLE` sin read-model. El panel
`/admin/editorial` permite acceder por UUID B1 obtenido del recibo de importación real.
No se muestran fixtures ni se anuncia éxito antes de recibir el recibo del Engine.

## Contratos y límites

- `GET /api/internal/editorial/candidates/{id}`: inspección de candidato B1 desde
  `GET /api/editorial/v1/candidates/{id}`, con UUID, versión/revisión, título,
  estado y **número** de conflictos; no se entrega el resto de evidencia ni los
  valores del motor al navegador. Solo `reviewer/admin` activos.
- `POST /api/internal/editorial/candidates/{id}/commands`: acciones
  `APPROVE/REJECT/CORRECT/RESOLVE_CONFLICTS/PUBLISH/SUSPEND`. El panel inicial
  incluye `APPROVE/REJECT` y `PUBLISH/SUSPEND` solo para admin. Aprobación ≠ publicación.
  El backend revalida membresía viva, contexto editorial, revisión y revocación;
  no se acepta ID de actor, roles o tokens desde el formulario.
- `POST /api/internal/editorial/imports`: JSON/CSV acotado, encabezados
  `Idempotency-Key` y `X-Editorial-Reason`. No hay UI pública de importación todavía;
  el endpoint está protegido por rol admin y la misma puerta de activación.
- Protección de origen y Host estrictos en POST, token Auth verificado de
  Supabase, JWT del usuario + token IAM dedicado solo server-side,
  validación de body/esquema, lectura acotada, sin redirección/caché,
  12 s timeout y errores públicos sin SQL/secretos.
- La clave de idempotencia pertenece a la **intención** y se conserva durante
  reintentos inciertos para el mismo payload. El panel solo la renueva al
  cambiar la intención o recibir confirmación; no genera eventos inventados.
- El BFF no es el límite último de seguridad: Engine exige el rol actual
  en PostgreSQL y rechaza `reviewer` cuando APPROVE/REJECT
  implicaría suspender una publicación ya activa (Engine #135).
- Los códigos de error públicos permitidos son 400/401/403/404/409/429/503.
  No se interpreta un timeout/HTML/JSON inesperado como operación completada.

## Activación por puerta explícita (sin ejecutar aún)

`EDITORIAL_B1_ENABLED=disabled` por defecto. El código exige simultáneamente:

1. Proyecto Vercel STAGING dedicado y rama `develop` con identidad de despliegue
   idéntica a `isApprovedStagingDeployment`; PROD y Preview fallan cerrado.
2. `EDITORIAL_B1_ENABLED=enabled` y
   `EDITORIAL_ENGINE_REVIEWED_SHA=ff49e563b6016bdcb5062fde92eef5a2e5894f9a`
   (código Engine #135; una cadena SHA por sí misma **no certifica** el artefacto
   desplegado: verificar imagen/revisión y firma en acta operacional).
3. `EDITORIAL_ENGINE_STAGING_ORIGIN` HTTPS Cloud Run privado, igual a
   `EDITORIAL_ENGINE_VERIFIED_ORIGIN` y audiencia
   `EDITORIAL_ENGINE_STAGING_ID_TOKEN_AUDIENCE`, y una cuenta
   `GCP_EDITORIAL_INVOKER_SERVICE_ACCOUNT_EMAIL` independiente
   de legacy writer/reader. La identidad se intercambia mediante la
   integración OIDC/WIF del proyecto Vercel (sin secretos exportados al browser).
4. Web #59 revisada, pruebas de contrato Java-Web y una API Java real desplegada
   con `EDITORIAL_API_ENABLED=true` sobre runtime dedicado, sin Flyway, jobs ni
   API anterior; autorización, quota, red, factura y permisos JDBC mínimos
   verificados en Engine #123.
5. Gate H1 #131: V016/V017 primero con restauración/snapshots; V018 después de
   autorización propia. Gate H2 V019: catalog_read/API anon y convivencia con H1.
   Gate H3 V020: revisión permisos del trigger, SQL sin SUPERUSER, runtime
   NOLOGIN/NOBYPASSRLS; aplicar y validar **solo con autorización separada**.
6. Prueba GET de candidato real y prueba de importación/aprobación/publicación
   de una ficha vigente autorizada, desde Java, SQL/PostgREST y Web, con
   suspensión y rollback; cotejar auditoría y contadores. Nunca convertir
   el dataset histórico de 05/10/2026 en inventario actual por su antigua etiqueta.

**Si falta una puerta, mantener disabled.** No activar V019/V020, conceder
`api.USAGE` anónimo, provisionar credenciales o desplegar por fusionar esta PR.

## Pruebas offline

`npm run quality` cubre el BFF, bloqueo de entorno, dominio, CSRF, roles,
revocación antes de dispatch, headers/token privado e idempotencia,
negativos y reducción explícita del DTO. Requiere revisar la UI manualmente
con un Engine aislado antes de STAGING; los mocks no equivalen a un test
real de publicación.
