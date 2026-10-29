# Inscripción multicanal verificada (Engine #153)

Implementación offline coordinada con [Engine #153](https://github.com/raulacden/sports-events-engine/issues/153).
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
