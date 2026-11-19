# Inscripción multicanal verificada (Engine #153)

Implementación offline coordinada con [Engine #153](https://github.com/salipeapps/sports-events-engine/issues/153).
Revisar primero `docs/registration-multichannel-adr.md` del Engine y V021. No autoriza
migraciones, grants, despliegue, cambios de env remotos ni publicaciones reales.

Admin detecta el campo explícito `data.registration` en la inspección nueva. No infiere
canal ni destino de registrationUri; el selector empieza sin elección cuando faltan.
CORRECT permite WEB, WHATSAPP, PHONE y EMAIL con destino por tipo, URL de evidencia y
confirmación de que el organizador publica canal/destino para inscripción y permite
su uso público. Guardar sin esa confirmación conserva el candidato no publicable.
APPROVE exige una nueva confirmación humana y manda registrationVerified:true; Engine
valida procedencia, sesión, rol, revisión, hash y transición. La Web no decide publicación. Con el modo multicanal seleccionado, el BFF rechaza
inspecciones de Engine que omitan registration, CORRECT sin ese campo y APPROVE sin
confirmación explícita; no degrada silenciosamente al contrato editorial anterior.
La URI heredada se rotula como información y nunca sustituye el objeto explícito.

El catálogo usa por defecto v1. `PUBLIC_CATALOG_CONTRACT_VERSION=2` selecciona solo
`api.catalog_occurrences_v2`, exige sobre/ítems v2 y valida método, destino, acción y
sourceUrl; errores o RPC ausente cierran catálogo sin fallback. El modo v2 solo admite
APP_ENV=development/staging. No se habilita PROD ni se altera una configuración remota.
V1 mantiene su adaptador y solo recibe WEB verificado tras la migración del Engine.

WhatsApp muestra el número publicado y botón **Copiar número**, con explicación visible:
no abre WhatsApp ni confirma una reserva. No genera wa.me. PHONE usa tel:, EMAIL mailto:
sin asunto/mensaje/otros parámetros, WEB abre la URL HTTPS validada. La convocatoria
informativa tiene enlace separado. Los contactos no pasan por textos generales ni URLs
heredadas; únicamente proceden de la proyección aprobada por Engine.

Antes de activación B1 nueva se requieren EDITORIAL_REGISTRATION_ENABLED=enabled y
EDITORIAL_ENGINE_REVIEWED_SHA igual al SHA coordinado y revisado en boundary.ts, además
de todos los gates STAGING existentes. El flag por sí solo no habilita otro proyecto,
branch, origen o rol. Los valores de ejemplo permanecen deshabilitados. Revisar ambos
SHA y no confundir el pin de compatibilidad con una revisión humana ya concedida.

Pruebas: unitarias y contratos BFF; E2E inspector (corregir WhatsApp sin campo URL,
confirmación humana obligatoria); `playwright.registration.config.ts` (catálogo local,
copia real al portapapeles, tel/mail/web, retirada y fallo upstream). Son fixtures
explícitos offline. Prueba cruzada adicional después de EditorialCommandsIT:
REGISTRATION_ENGINE_CONTRACT_DIR apunta a target/registration-web-contract del Engine;
vitest engineContract.test.ts consume sin transformar las cuatro respuestas SQL PG17.
La captura SQL no reemplaza el futuro smoke HTTP anónimo real STAGING.

Rollback: deshabilitar catálogo y B1, detener publicaciones; mantener el esquema y
la historia. No volver silenciosamente a v1 para esconder un error de v2. Reabrir
requiere revisión de ambos clientes/Engine, contactos y autorización operativa.

## Revisión de compatibilidad del Engine desplegado (19/11/2026; pendiente de aprobación independiente)

Esta revisión prepara, **pero no autoriza**, el uso en STAGING del Engine
`36480eea25d392a90050cf49466cf55dd478e392` (imagen sellada
`sha256:9bde50f0478c9ca69d69054f1f9ae00c91ebee5bd4b499e4ff4bc4a0a0a7a479`).
La revisión del despliegue `44538547684` confirmó promoción editorial y actualización
del Job de captura; no se ejecutó una publicación multicanal por este cambio.

Se compararon los ficheros de código exactos con el pin anterior
`fd593be3d44c48080fd211c2b390e0a055133e3a` (el historial de ambos SHAs
diverge, por lo que NO basta con asumir compatibilidad por ancestro):

Se cotejaron los componentes del contrato:

- **`OccurrenceData` y `db/registration/V021__verified_registration.sql`:** blobs idénticos; se mantiene el objeto `registration` y el contrato V021.
- **`EditorialController`:** la inspección y los comandos existentes mantienen forma; añade rutas separadas de organizador y confianza.
- **`JdbcEditorialCommands`:** agrega `REVERIFY`, altas y comandos de confianza; generaliza los recibos idempotentes sin cambiar el `Receipt` de los comandos editoriales.
- **`EditorialApiConfiguration`:** autoriza el `PUT` exacto de autoridad de ubicación; mantiene denegados los demás verbos.
- **`Registration.safePublicUrl`:** permite el slug FDM legible de cinco o más palabras; conserva el rechazo de segmentos opacos (paridad Web comprobada en #84).
- **`JdbcCatalogProjectionStore`:** acepta `reverify_publication` al reconstruir la proyección sin cambiar `registration` ni `sourceUrl` de catálogo v2.

La PR asociada incorpora el **SHA desplegado exacto** en la lista de compatibilidad
del BFF, solo junto con `EDITORIAL_REGISTRATION_ENABLED=enabled`. No cambia el
pin legado, el gate `EDITORIAL_TRUST_ENABLED`, los roles, la autorización del
origen, el fail-closed, el catálogo v1/v2 ni el default de las variables. Los
tests comprueban que sin opt-in, fuera de STAGING, con B1 deshabilitado o con
SHA distinto, el acceso sigue denegado.

**Antes de fusionar o activar**: revisión independiente de seguridad/contrato
del commit exacto, CI completa, comprobar los permisos IAM y el digest real del
servicio que responderá al BFF, comprobar que el deployment de Web corresponde
a la revisión aprobada, y obtener autorización operacional específica para
modificar las variables remotas. `EDITORIAL_ENGINE_REVIEWED_SHA` es un valor
configurado, **no** prueba criptográfica automática del binario remoto. Si el
Engine cambia de imagen, es obligatorio repetir la revisión. Nunca usar estos
ajustes para habilitar PROD.

Para el E2E real sigue siendo necesaria la confirmación humana del canal y
destino oficial del organizador, y autorización independiente para
CORRECT/APPROVE/PUBLISH/SUSPEND. Ni la nueva captura FDM EMAIL ni la presencia
de RPC v2 son autorización de publicación.
