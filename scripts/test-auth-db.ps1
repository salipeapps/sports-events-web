$ErrorActionPreference = 'Stop'
$containerName = 'sports-web-auth-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$repoRoot = Split-Path -Parent $PSScriptRoot
function Run-Sql([string]$sql) {
  $sql | docker exec -i $containerName psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw 'Isolated SQL test failed' }
}
try {
  # No host port, remote URL, persistent volume, or project credentials.
  docker run --detach --name $containerName --network none --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine
  if ($LASTEXITCODE -ne 0) { throw 'Cannot start isolated PostgreSQL' }
  $ready = $false
  # The image's temporary init server accepts Unix sockets only. Wait for the
  # final TCP listener inside the container, without exposing any host port.
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec $containerName pg_isready -h 127.0.0.1 -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (!$ready) { throw 'PostgreSQL startup timed out' }
  # Minimal Supabase role/identity scaffolding; this does not simulate GoTrue.
  Run-Sql @'
create role anon;
create role authenticated;
create role supabase_auth_admin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
'@
  Get-ChildItem -LiteralPath (Join-Path $repoRoot 'supabase/migrations') -Filter '*.sql' | Sort-Object Name | ForEach-Object {
    Run-Sql (Get-Content -Raw -LiteralPath $_.FullName)
  }
  Get-ChildItem -LiteralPath (Join-Path $repoRoot 'supabase/tests') -Filter '*.sql' | Sort-Object Name | ForEach-Object {
    Run-Sql (Get-Content -Raw -LiteralPath $_.FullName)
  }
  Run-Sql (Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'supabase/rollback/discovery_access_token_hook.sql'))
  Run-Sql @'
do $$ begin
  if exists (select 1 from pg_namespace where nspname='discovery_auth') or
    exists (select 1 from pg_policies where policyname='Auth hook reads memberships') or
    has_column_privilege('supabase_auth_admin','public.admin_memberships','role','SELECT') then
    raise exception 'Incomplete hook rollback';
  end if;
end $$;
'@
  Run-Sql (Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'supabase/tests/admin_memberships.sql'))
  Write-Output 'PASS: local PostgreSQL migrations, membership RLS, hook claims, privileges and rollback'
} finally {
  docker rm --force --volumes $containerName | Out-Null
}
