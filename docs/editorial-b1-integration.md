# H3 B1 · Admin editorial ↔ Engine Java (#59)

Estado: **implementación preparada; activación STAGING pendiente de runtime/ACL**. No sustituye la cola de **fuentes B2**
de Web #34 ni las vistas B1 generales, todavía `NOT_AVAILABLE` sin read-model. El panel
`/admin/editorial` permite acceder por UUID B1 existente o recibido en una importación real.
No se muestran fixtures ni se anuncia éxito antes de recibir el recibo del Engine.

## Contratos y límites

- `GET /api/internal/editorial/candidates/{id}`: inspección de candidato B1 desde
  `GET /api/editorial/v1/candidates/{id}`, con UUID, versión/revisión, datos de la
  actividad, organizador, fuente/observación, conflictos y estado de publicación.
  Reconstruye una allowlist acotada: no expone snapshots privados ni campos extra.
  Las URLs inseguras no se convierten en enlaces. Solo `reviewer/admin` activos.
- `POST /api/internal/editorial/candidates/{id}/commands`: acciones
  `APPROVE/REJECT/CORRECT/RESOLVE_CONFLICTS/PUBLISH/SUSPEND`. El panel inicial
  incluye `APPROVE/REJECT`, `PUBLISH/SUSPEND` solo para admin y una corrección acotada
  de organizador/inscripción/confirmación de ubicación mediante CORRECT existente.
  La selección de organizadores está limitada a 100 referencias y avisa si hay más.
  No inventa precios, idioma ni categoría por defecto. Aprobación ≠ publicación.
  El backend revalida membresía viva, contexto editorial, revisión y revocación;
  no se acepta ID de actor, roles o tokens desde el formulario.
- `POST /api/internal/editorial/imports`: JSON/CSV acotado, encabezados
  `Idempotency-Key` y `X-Editorial-Reason`. No hay UI pública de importación todavía;
  el endpoint está protegido por rol admin y la misma puerta de activación.
- Protección de origen y Host estrictos en POST, token Auth verificado de
  Supabase, JWT del usuario verificado solo server-side sobre HTTPS,
  validación de body/esquema, lectura acotada, sin redirección/caché,
  timeout de 12 s en comandos e importaciones y de 25 s en lecturas (el primer
  GET tras un arranque en frío del Engine tardó ~14 s en STAGING, #54), y errores
  públicos sin SQL/secretos. Si la lectura no responde, el inspector lo dice como
  lectura (no como operación incierta), avisa a los 3 s de que el servicio puede
  estar arrancando y ofrece «Reintentar lectura».
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

Comprobación remota 27/10: Web STAGING sirve `5ca8d0e` (#62), con
`PUBLIC_CATALOG_MODE=supabase` y catálogo vacío real. Faltan las variables
editoriales y el nuevo runtime Java; la API editorial responde NOT_CONFIGURED.

1. Proyecto Vercel STAGING dedicado y rama `develop` con identidad de despliegue
   idéntica a `isApprovedStagingDeployment`; PROD y Preview fallan cerrado.
2. `EDITORIAL_B1_ENABLED=enabled` y
   `EDITORIAL_ENGINE_REVIEWED_SHA=eb4f4f5604a27ec410cdb5342ea5ef89a8b4378c`
   (Engine #142: sesión mediante RPC invoker sin acceso JDBC a Auth; una cadena SHA no certifica el artefacto
   desplegado: verificar imagen/revisión y firma en acta operacional).
3. `EDITORIAL_ENGINE_STAGING_ORIGIN` es el origen HTTPS del nuevo runtime Java,
   igual a `EDITORIAL_ENGINE_VERIFIED_ORIGIN` y distinto de lectores/writers legacy.
   Sin path, query, fragment, credenciales ni puertos personalizados. No depende de
   Cloud Run, STS, WIF, audiencia IAM ni cuenta de servicio. Solo se envía el bearer
   Supabase del usuario; Engine comprueba firma, issuer, sesión y membresía viva.
4. Web #59 revisada, pruebas de contrato Java-Web y una API Java real desplegada
   con `EDITORIAL_API_ENABLED=true` sobre runtime dedicado, sin Flyway, jobs ni
   API anterior; autorización, quota, red, factura y permisos JDBC mínimos
   verificados en Engine #123.
5. V020, login editorial y vigencia FDM preparados. Falta revisar y autorizar
   `scripts/prepare-editorial-session-rpc.sql` de Engine: SELECT de columnas Auth
   para authenticated, con RLS permisivo/restrictivo limitado al propio usuario y
   session_id; RPC sin argumentos SECURITY INVOKER que devuelve solo un booleano.
   Java usa el mismo bearer y `EDITORIAL_AUTH_PUBLISHABLE_KEY` sb_publishable del
   proyecto. Conserva firma JWT, membresía viva e idempotencia. No necesita USAGE
   de Auth para engine_editorial ni soporte. Construir una imagen nueva; conservar
   la contraseña/cuenta/contenedor ya creados. Pasos en Engine
   `docs/editorial-first-event-staging.md`. No volver a aplicar V020.
6. Probar el candidato real existente indicado abajo. Revalidar su convocatoria
   antes de decidir; nunca convertir el dataset histórico en inventario vigente
   por sus etiquetas antiguas. No importar otra identidad del mismo evento.

**Si falta una puerta, mantener disabled.** Fusionar esta PR no provisiona
credenciales, políticas ni hosting; esas modificaciones requieren autorización.

## Validación mínima en STAGING después de activar

1. Entrar como admin en `/admin/editorial/9a13ed5e-4e08-4705-a2b5-540ef126081c`:
   Carrera per la Solidaritat 2026, 08/11/2026 09:00 Europe/Madrid, Alameda.
   Ficha y reglamento contrastados el 26/10 en el documento Engine indicado arriba.
2. Consultar convocatoria e inscripción actuales. Seleccionar **Confirmar
   organizador, inscripción y ubicación**, elegir Fundación Deportiva Municipal
   València, confirmar la ubicación y guardar con motivo. El comando es CORRECT;
   no publica. Preservar el UUID; no crear una importación duplicada.
3. Aprobar con URL oficial, categoría running y motivo; publicar con un segundo
   comando admin. Reviewer puede revisar/aprobar candidatos sin publicación;
   no puede publicar, suspender ni retirar publicaciones activas por otra acción.
4. Leer `api.catalog_occurrences_v1` para noviembre y abrir
   `/?month=2026-11#activities`: la tarjeta debe existir una sola vez. El filtro
   inicial es de siete días y no incluye el 8 de noviembre el día de esta revisión.
5. Suspender con admin; repetir RPC y recargar esa URL: la tarjeta debe desaparecer.
   Guardar recibos/IDs y comprobar decisiones persistidas. Reintentar un comando
   incierto conserva Idempotency-Key; Engine devuelve el mismo recibo.

## Pruebas offline

`npm run quality` cubre el BFF, bloqueo de entorno, dominio, CSRF, roles,
revocación antes de dispatch, headers/token privado e idempotencia,
negativos y reducción explícita del DTO. Requiere revisar la UI manualmente
con un Engine aislado antes de STAGING; los mocks no equivalen a un test
real de publicación. El test adicional `engineContract.test.ts` acepta
`EDITORIAL_ENGINE_CONTRACT_FILE` apuntando al JSON generado por
`EditorialCommandsIT` en Engine: valida inspección y respuestas RPC antes/después
de suspender sin adaptar Web #50. Es evidencia PG17 offline, no una publicación real.
