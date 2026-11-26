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
  timeout de 12 s en comandos e importaciones y de 45 s en lecturas, con
  `maxDuration` 60 en la ruta (el primer GET tras un arranque en frío del Engine
  tardó ~14 s en STAGING, #54, y ~31 s el 14/11/2026 con 0..1 instancias), y errores
  públicos sin SQL/secretos. Si la lectura no responde, el inspector lo dice como
  lectura (no como operación incierta), avisa a los 3 s de que el servicio puede
  estar arrancando y ofrece «Reintentar lectura».
- **Calentamiento antes de cada comando e importación (#88)**: la lectura del inspector no basta
  para mantener despierta una instancia 0..1 mientras el admin rellena el formulario. El 20/11 un
  CORRECT se persistió pero su acuse no llegó dentro de los 12 s. Por eso, después de validar la
  petición, la sesión y el rol, el BFF envía la misma sonda `GET /actuator/health/readiness` que los
  comandos V026: tiene 38 s de margen, no lleva el JWT del usuario y descarta su respuesta. Si la
  sonda falla, el comando **no se envía** y se responde `WRITE_UNAVAILABLE`, así que reintentar con
  la misma clave es inocuo. Las rutas de comandos e importaciones fijan `maxDuration = 60`
  (38 s + 12 s + 10 s de margen). Las lecturas no hacen sonda, porque ya tienen 45 s.
- La clave de idempotencia pertenece a la **intención** y se conserva durante
  reintentos inciertos para el mismo payload. El panel solo la renueva al
  cambiar la intención o recibir confirmación; no genera eventos inventados.
- El BFF no es el límite último de seguridad: Engine exige el rol actual
  en PostgreSQL y rechaza `reviewer` cuando APPROVE/REJECT
  implicaría suspender una publicación ya activa (Engine #135).
- Los códigos de error públicos permitidos son 400/401/403/404/409/429/503.
  No se interpreta un timeout/HTML/JSON inesperado como operación completada.

### Diagnóstico de cada llamada al Engine (#88)

`callEngine` escribe **una línea por llamada** (B1 inspect/command/import, comandos V026, alta de
organizador y sus sondas de calentamiento). Va a `console.error` si el resultado queda incierto
(timeout, red, 5xx o respuesta ilegible) y a `console.info` si hay recibo o una respuesta 4xx
definitiva:

```text
MOUMEET_EDITORIAL_ENGINE_CALL request_id=<uuid> op=b1.command method=POST phase=fetch sent=unknown
  outcome=timeout cause=none http_status=none elapsed_ms=12003 budget_ms=12000
  command_key=<Idempotency-Key> target=<candidato>
```

- `request_id` coincide con la cabecera `X-Request-ID` de la respuesta que recibe el panel.
- `phase` y `sent` separan **acuse del BFF** de **persistencia en el Engine**. Con `prepare` o
  `workload_token` y `sent=no`, el comando no salió del BFF. Con `fetch` y `sent=unknown`, se envió o
  pudo enviarse, pero no llegó respuesta: es el caso de #88. Con `response` y `sent=yes`, el Engine
  respondió.
- `outcome` puede ser `ok`, `http_error`, `timeout`, `aborted`, `network_error` (con el código de
  sistema en `cause`, p. ej. `ECONNRESET`), `rejected` (con el código BFF en `cause`) o `unexpected`.
  `elapsed_ms` frente a `budget_ms` permite evaluar el límite de 12 s con datos reales.
- La línea solo lleva UUID opacos, enumeraciones y números. No escribe tokens, cabeceras, URL,
  cuerpos, motivos ni datos de contacto, y un test lo comprueba.

**Correlación ante un resultado incierto**: busca en los logs de Vercel `command_key=<clave>`. Une
esa clave con `public.editorial_receipts.command_key` (solo lectura) para saber si el Engine
persistió el comando. Después compara la hora y `elapsed_ms` con el log de peticiones de Cloud Run
para `/api/editorial/v1/candidates/<target>/commands`, que da la latencia y el código reales. Un
recibo con `sent=unknown` confirma que se perdió el acuse y no la escritura. Recarga la ficha (GET)
y no repitas el comando con una clave nueva.

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
   **Fase P (Engine #125):** cuando el Engine active el IAM de invocación de Cloud Run,
   `EDITORIAL_ENGINE_ID_TOKEN_AUDIENCE` debe ser exactamente ese origen. El BFF obtiene
   entonces un ID token de Google (Vercel OIDC → STS → `moumeet-staging-invoker@`,
   el mismo intercambio que `readApi.ts`, con `GCP_WORKLOAD_PROVIDER_AUDIENCE`,
   `GCP_INVOKER_SERVICE_ACCOUNT_EMAIL` y `VERCEL_EXPECTED_OIDC_*`) y lo envía **solo**
   en `X-Serverless-Authorization`; el bearer Supabase sigue en `Authorization`. Si no
   puede obtenerlo, responde `WRITE_UNAVAILABLE` sin llamar al Engine. Vacía, no se
   envía (estado anterior a P4). Una audiencia distinta del origen da `NOT_CONFIGURED`.
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
3. Aprobar con categoría running y motivo; publicar con un segundo
   comando admin. Con contrato de inscripción, la URL oficial es la evidencia de
   inscripción registrada y aparece en solo lectura: el Engine rechaza cualquier
   otra con `CONFLICT`. Para cambiarla hay que usar «Actualizar inscripción». Reviewer puede revisar/aprobar candidatos sin publicación;
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

## Comandos de confianza editorial V026 (alias, canal oficial y autoridad de ubicación)

Estado: **implementado en Web, desactivado por defecto**. Contrato: Engine `e66bc3a` (#280),
`EditorialController` y `TrustCommand`, más `docs/editorial-trust-commands.md` y
`docs/staging-fdm-editorial-trust-operator.md` del Engine. **Esta pantalla no autoriza ejecutar
ningún comando**: cada envío es una escritura real y requiere la autorización operativa C del
paquete FDM, que se pide y registra aparte. Fusionar en `develop` (despliegue de Vercel STAGING)
tampoco la concede.

| BFF Web                                                       | Engine                                                  | Cuerpo Web (claves exactas)              | Cuerpo Engine (claves exactas) |
| ------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------- | ------------------------------ |
| `POST /api/internal/editorial/organizers/{id}/aliases`        | `POST /api/editorial/v1/organizers/{id}/aliases`        | `alias`, `reason`, `evidenceUrl`         | `alias`, `reason`              |
| `POST /api/internal/editorial/organizers/{id}/channels`       | `POST /api/editorial/v1/organizers/{id}/channels`       | `officialUrl`, `reason`, `evidenceUrl`   | `officialUrl`, `reason`        |
| `PUT /api/internal/editorial/sources/{id}/location-authority` | `PUT /api/editorial/v1/sources/{id}/location-authority` | `authoritative`, `reason`, `evidenceUrl` | `authoritative`, `reason`      |

- **Solo `admin`**: el Engine llama a `authorize(jwt,false)` en los tres comandos, así que
  `reviewer` no puede. El BFF lo comprueba en dos lecturas de sesión con el mismo sujeto antes de
  enviar nada, y la página `/admin/editorial/trust` exige la capacidad `sources.manage` (solo admin).
- **Petición**: mismo origen, Host, `Origin` y `Sec-Fetch-Site: same-origin`, sin query string ni
  `Content-Encoding`, `Content-Type: application/json`, `Idempotency-Key` UUID canónico en
  minúsculas, cuerpo de 4 KiB como máximo y JSON con las claves exactas. `PUT` solo en
  `location-authority`; `POST` solo en alias y canal.
- **Evidencia**: el contrato del Engine no tiene campo de evidencia. El BFF la incorpora al motivo
  auditado (`editorial_trust_changes.reason`) con el formato fijo `<motivo> · Evidencia: <URL>`, y
  rechaza el comando si el resultado supera los 1000 caracteres del Engine. La URL debe ser HTTPS
  pública y canónica, sin credenciales, puerto, query ni fragmento.
- **Alias**: se envía en la forma de presentación del Engine (NFC, espacios simples, sin caracteres
  invisibles, entre 2 y 200 caracteres y con alguna letra). La pantalla muestra la forma normalizada
  que se va a enviar antes de confirmar.
- **Canal**: solo un origen `https://host` o `https://host/` en minúsculas, sin ruta, puerto, query
  ni fragmento. Aplica la regla `safePublicUrl` del Engine. La captura confía en el host completo:
  no se registran agregadores ni plataformas de terceros, y un subdominio es otro host.
- **Autoridad de ubicación**: sin opción por defecto; hay que elegir expresamente entre declarar y
  retirar.
- **Envío**: pasa por la única llamada `fetch` del BFF al Engine (`callEngine`), compartida con
  inspect, command e import. Las cabeceras `Accept` y `Authorization` se fijan solo allí, así que la
  cabecera `X-Serverless-Authorization` de la fase P (#77, solo con `EDITORIAL_ENGINE_ID_TOKEN_AUDIENCE` igual al origen) también se añade solo allí, y la heredan los tres comandos V026. Sin redirecciones ni caché, timeout
  de 12 s y respuesta de 8 KiB como máximo.
- **Calentamiento antes del comando**: el panel de confianza no hace una lectura del inspector antes
  de sus comandos, así que el primer comando de cada ventana encontraba el Engine en frío. Sus 12 s
  se agotaban mientras el Engine escribía igualmente (STAGING, 15/11 y 16/11, Engine #125). Ahora,
  después de validar la petición, la sesión y el rol, el BFF envía un `GET /actuator/health/readiness`
  con 38 s de margen. Es un endpoint público del Engine, así que la petición no lleva el JWT del
  usuario: solo el ID token de la fase P si está configurado. Cualquier respuesta HTTP significa que
  la instancia está arrancada; su contenido se descarta. Si la sonda falla (timeout, red o
  redirección), el comando **no se envía** y se responde `WRITE_UNAVAILABLE`; reintentar con la misma
  clave es inocuo. Las rutas de confianza y de alta fijan `maxDuration = 60`, que cubre los 38 s de
  la sonda, los 12 s del comando y 10 s de margen dentro del límite de Hobby.
- **Recibo**: se reconstruye con una lista cerrada de campos. Exige `commandKey` igual a la clave
  enviada, `action` del comando, objetivo igual al de la ruta, `alias`/`officialUrl` idénticos a los enviados (la SQL V026 los devuelve tal cual en `ADDED` y `EXISTS`), campos ajenos nulos y `status` dentro
  de `ADDED`/`EXISTS` (alias y canal) o `DECLARED`/`WITHDRAWN`/`UNCHANGED` (autoridad, con
  `authoritative` igual al enviado). `EXISTS` y `UNCHANGED` se muestran como «sin escritura».
- **Errores**: lista cerrada 400/401/403/404/409/429/503. En un 409 solo se reenvían `reason`
  (`ALIAS_IN_USE`/`CHANNEL_IN_USE`) y hasta 20 organizadores públicos `{id, canonicalName}` si
  cumplen el formato exacto.
- **Resultado incierto**: un timeout, un fallo de red, un 503 o una respuesta ilegible (también un
  200 malformado) se muestran como **resultado incierto**, nunca como éxito ni como fallo. La clave
  se conserva y la pantalla ofrece «Reintentar con la misma clave»; el Engine devuelve el mismo
  recibo si ya lo registró. Cambiar cualquier dato crea una intención nueva con otra clave. Tras una
  respuesta definitiva (400/403/404/409) la intención termina y hay que confirmar de nuevo.
- **UI**: tres formularios independientes, sin acciones masivas, sin valores precargados y sin texto
  que dé una acción por aprobada. Flujo: editar → revisar exactamente lo que se enviará → casilla de
  confirmación explícita → recibo del Engine visible.

### Activación (desactivada por defecto)

Además de todas las puertas B1 anteriores (`editorialB1Enabled` y el origen verificado), el código exige:

1. `EDITORIAL_TRUST_ENABLED=enabled`;
2. `EDITORIAL_ENGINE_TRUST_REVIEWED_SHA=e66bc3abbc24ba577e0049562ac3a4c01e095953` (el runtime
   V026 revisado, `moumeet-editorial-staging` revisión `00011-rah`). Una cadena SHA no certifica el
   artefacto desplegado: la imagen y la revisión se verifican en el acta operacional.

Si falta alguna, las tres rutas responden `404 NOT_CONFIGURED` sin leer la sesión ni contactar con
el Engine. Configurar estas variables en Vercel es un cambio operativo que requiere su propia
autorización.

### Pruebas

- `src/integrations/editorial/trust.test.ts`: puerta de activación, origen, Host, `Sec-Fetch-Site`,
  método, clave, tipo de contenido, cuerpos con claves de más o de menos, motivo y evidencia
  inválidos, alias no normalizado o invisible, canal con ruta, puerto, IP o mayúsculas, `reviewer`,
  cambio de sujeto o de rol entre lecturas, timeout y fallo de red (incierto), errores del Engine,
  409 con detalle, respuestas incompatibles y recibos que no cuadran. También comprueba que
  `boundary.ts` tiene una sola llamada `deps.fetcher(`.
- `src/presentation/admin/EditorialTrustPanel.test.tsx`: tres formularios, nada precargado, motivo y
  evidencia obligatorios y ningún texto de aprobación.
- `e2e/editorial-trust.spec.ts` (BFF simulado con `page.route`): recibo visible tras confirmar,
  timeout incierto con reintento con la misma clave, canal con ruta rechazado en local, conflicto con
  la lista de organizadores y `PUT` con elección explícita.

No cubre una ejecución real contra el Engine: los mocks no sustituyen la verificación del operador
(preflight, recibo y postflight del paquete FDM).

## Alta de organizador V022 (organizador nuevo y su canal oficial)

Estado: **implementado en Web, desactivado por defecto**. Contrato: Engine `e66bc3a`,
`EditorialController.registerOrganizer` y `organizer_registry.register_organizer_v1` (V022, #197),
más `docs/editorial-organizer-registration.md` del Engine. Igual que los comandos V026, **esta pantalla
no autoriza ningún alta**: cada envío es una escritura real que requiere su propia autorización C.

| BFF Web                                   | Engine                              | Cuerpo Web (claves exactas)                             | Cuerpo Engine (claves exactas)                                       |
| ----------------------------------------- | ----------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| `POST /api/internal/editorial/organizers` | `POST /api/editorial/v1/organizers` | `canonicalName`, `officialUrl`, `reason`, `evidenceUrl` | `canonicalName`, `officialUrl`, `reason`, `distinctFromOrganizerIds` |

- **Un alta crea dos cosas**: el organizador y, en la misma transacción, su canal oficial con la
  `officialUrl`. La captura confía en ese host igual que en un canal V026. Por eso Web solo envía un
  origen `https://host` o `https://host/`, aunque el Engine admita una ruta.
- **Nombre canónico**: misma forma de presentación que un alias (NFC, espacios simples, entre 2 y 200
  caracteres, alguna letra, sin caracteres invisibles). La revisión muestra la forma normalizada.
- **Parecidos**: `distinctFromOrganizerIds` va siempre vacío. Si el Engine responde
  `ORGANIZER_EXISTS` o `ORGANIZER_AMBIGUOUS` (409, sin escritura), la pantalla muestra los
  organizadores públicos que coinciden y la intención termina. Declarar que un organizador es distinto
  de otro parecido no se hace desde aquí.
- **Recibo**: exige `commandKey` igual a la clave enviada, `status` `CREATED`, `organizerId` y
  `officialChannelId` UUID, y `canonicalName` y `officialUrl` idénticos a los enviados.
- Misma sonda de calentamiento previa que los comandos V026.
- Mismas reglas de petición, evidencia dentro del motivo, sesión doble, envío por `callEngine`
  (con `X-Serverless-Authorization` de la fase P), timeout de 12 s y resultado incierto con reintento
  con la misma clave que los comandos V026.

### Activación (desactivada por defecto)

Exige todas las puertas de los comandos V026 (`editorialTrustEnabled`) **y además**
`EDITORIAL_ORGANIZER_CREATION_ENABLED=enabled`. Abrir una ventana de confianza no habilita altas por
accidente. Si falta, la ruta responde `404 NOT_CONFIGURED` sin leer la sesión ni contactar con el
Engine. Configurar la variable en Vercel es un cambio operativo con su propia autorización.

### Pruebas

- `src/integrations/editorial/organizer.test.ts`: puerta propia sobre la de confianza, petición,
  cuerpo exacto con `distinctFromOrganizerIds` vacío, nombre y URL inválidos, `reviewer`, cambio de
  sujeto, 409 `ORGANIZER_EXISTS`/`ORGANIZER_AMBIGUOUS`, timeout incierto y recibos que no cuadran.
- `e2e/editorial-trust.spec.ts`: alta con recibo visible, URL con ruta rechazada en local y 409 de
  parecidos con la lista de organizadores.
