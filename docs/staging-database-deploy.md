# STAGING: despliegue de la base de datos desde Web

Web **escribe y prueba** su SQL en `supabase/migrations/`, pero **no lo aplica** en STAGING.
El único que despliega en la base de datos de STAGING (`yfytzogjrhwstcnzspdv`) es el
pipeline de STAGING del Engine (`raulacden/sports-events-engine`, workflow `STAGING deploy`).
Así nunca hay dos pipelines modificando la misma base de datos.
El diseño completo está en `docs/staging-deploy-pipeline.md` del Engine.

## Flujo

1. Merge a `develop` en este repositorio.
2. `notify-engine-staging.yml` lanza `STAGING deploy` en el Engine sobre `develop`, con este commit (`web_sha`).
3. El Engine lee `supabase/migrations/` en ese commit exacto, lo compara con
   `supabase_migrations.schema_migrations` y genera un único plan junto con el SQL del Engine:
   - SQL solo aditivo (`create table` **con** `enable row level security`, `create index`,
     `add column` que admite NULL, `comment`): se aplica automáticamente.
   - Cualquier otra cosa (datos, `grant`/`revoke`, políticas, funciones/RPC, bloques `do`, SQL
     no reconocido): espera la aprobación de `staging-db-approval` en el Engine.
4. Cada fichero se aplica en **una transacción** junto con su registro en `supabase_migrations`,
   con el mismo formato que la CLI de Supabase.
5. El Engine publica el estado `staging-db` en el commit de Web: `pending` mientras está
   planificado o esperando aprobación, `success` cuando está aplicado (o no había nada) y
   `failure` si está bloqueado.

## Reglas para este repositorio

- Nombres de fichero `AAAAMMDDHHMMSS_nombre.sql`. No edites un fichero ya aplicado: añade uno nuevo.
- Nada de SQL por el panel de Supabase en STAGING: el Engine lo detecta como drift y bloquea.
- Si el código necesita una migración, el código debe tolerar que todavía no esté aplicada, o la
  migración se fusiona en un PR previo. Opcional: en Vercel, *Deployment Checks* exigiendo
  `staging-db` antes de promocionar a producción del proyecto STAGING.
- Retirar algo que use el código desplegado requiere orden expand → contract.

## Configuración

- Secreto `ENGINE_DISPATCH_TOKEN`: token *fine-grained* limitado a
  `raulacden/sports-events-engine` con **Actions: Read and write** y nada más. Sin él, el workflow
  solo avisa y el Engine evaluará el commit en su siguiente ejecución.

Las migraciones ya aplicadas en STAGING con otro nombre (`20261008211334_web_admin_memberships`,
`20261009065852_web_discovery_access_token_hook`) se emparejan con sus ficheros mediante alias
revisados en el Engine, verificados por los objetos que crean. No se reejecutan.
