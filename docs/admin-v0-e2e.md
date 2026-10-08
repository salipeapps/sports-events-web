# Admin v0 — E2E, diseño y límites de aceptación (#7)

## Fuente de verdad visual

Documento Figma: https://www.figma.com/design/j4mi5fmAMTVN3A9At8U0L8

Los cuatro frames **están disponibles** en la página `02 · Admin`. Se comprobaron sus IDs y jerarquías:

| Frame | Node ID | Referencia |
| --- | --- | --- |
| Admin / 01 Dashboard | `5:13` | métricas, distribución y urgentes |
| Admin / 02 Actividades | `5:119` | tabs, filtros, tabla y estados |
| Admin / 03 Revisar candidatura | `5:255` | extracción, evaluación, evidencia y decisiones |
| Admin / 04 Fuentes y ejecuciones | `5:360` | registro de fuentes arriba y ejecuciones recientes abajo |

Referencias compartidas: `00 · Foundations` y el shell de `#3` (sidebar de 210px, topbar de 62px, tokens definidos en `globals.css`). Los valores de las tablas Figma **son ejemplos de diseño**, no datos observados por el motor. No se sustituyen los fixtures de investigación por los datos decorativos del frame.

`/admin/sources` muestra ambos bloques de la referencia 04; `/admin/runs` mantiene además el historial completo. La denominación del producto sigue siendo Sports Events, aunque la maqueta Figma muestra Valencia. Descubrimiento reutiliza shell/tokens; no tiene frame Figma dedicado.

Las pruebas browser adjuntan capturas completas de dashboard, actividades, candidatura, fuentes y descubrimiento **sin exigir pixel-perfect a datos dinámicos**. Comprueban encabezados, navegación y ausencia de overflow horizontal a 1440px; validan también a 390px. Una comparación visual humana de capturas sigue siendo necesaria para aprobar fidelidad estética fina.

## Ejecución

Requisitos: Node.js 24, npm y un navegador Chromium instalado por Playwright.

```bash
npm ci
npx playwright install chromium
npm run test:e2e
```

El runner de Playwright arranca `next dev` en el puerto 3100 con **bypass local explícito** `APP_ENV=development`, `ADMIN_DEV_AUTH_MODE=enabled`. Nunca se usa `next start` con bypass. Para comprobar el cierre por defecto:

```bash
ADMIN_DEV_AUTH_MODE=disabled npm run test:e2e -- e2e/admin-auth.spec.ts
```

En Windows PowerShell: `$env:ADMIN_DEV_AUTH_MODE='disabled'; npm run test:e2e -- e2e/admin-auth.spec.ts`.

CI ejecuta `quality` y una job separada de Playwright con Chromium. El informe HTML y las capturas/traces se adjuntan como artefactos en fallos.

## Recorrido demostrable con fixtures

`consulta de descubrimiento (DEFAULT) → ejecución simulada → resultado promovido →
fuente S001 revisada → captación fixture-run-8421 → candidatura E019 →
evidencia/reglas → aprobación editorial`.

También se cubren override por consulta, consulta pausada, resultado conocido, consumo desconocido, fuente bloqueada, candidata conflictiva y motivo obligatorio. Todos estos casos son **escenarios del adaptador de pruebas**, no evidencia de captación en producción.

## Decisiones responsive/accesibilidad

- 1440px reproduce la estructura de Figma; en ≤900px el sidebar se convierte en tira de navegación desplazable horizontalmente y las tablas se desplazan **dentro** de su contenedor, sin ancho global extra.
- En móvil las fichas de definición se apilan; se mantienen labels, controles nativos, encabezados y navegación por teclado.
- Los CTAs sin backend real están deshabilitados y explican el motivo. Nunca se exponen credenciales.
- Se conservan estados vacío, carga y error con el sistema del Admin.

## Sustitución del adaptador mock / carencias del motor

Los puntos de sustitución son `getAdminRepository()` y `getDiscoveryRepository()`, ambos de servidor; las páginas no importan SDK de scraping. El motor real deberá proporcionar:

1. Proveedor predeterminado y overrides, credenciales presentes **sin devolver el secreto**, capacidades, cuotas/health y presupuestos.
2. Consultas configurables con ID, geografía, categoría, idioma, frecuencia y límites; ejecuciones asíncronas con estado y consumo observado.
3. URLs/resultados canónicos, deduplicación, trazabilidad de reobservaciones, estados editoriales y procedencia de fuente promovida.
4. Transición autorizada y auditada de promoción/rechazo y acción para lanzar consulta; el mock **no hace ni simula estas mutaciones**.
5. Fuentes aprobadas, ejecuciones de captación y `runId` de candidatos, versionado para decisiones editoriales e idempotencia persistente.
6. Autenticación real y sesión persistente en entorno no development; el único bypass está guardado por `APP_ENV` y `NODE_ENV`.

**Límites pendientes:** no existe ejecución real de consulta ni promoción persistente, no hay login productivo, no hay motor conectado; las capturas no sustituyen una revisión visual manual. No marcar como demostrado un E2E contra servicios reales hasta disponer de B3/API y Auth. El `FixtureAdminRepository` es en memoria por proceso y no debe considerarse persistencia fiable de producción.
