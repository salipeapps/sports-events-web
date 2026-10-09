-- Prepared only: activation in Supabase Auth is a separate approved operation.
create schema discovery_auth authorization postgres;
revoke all on schema discovery_auth from public, anon, authenticated;
grant usage on schema discovery_auth to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select (user_id, role, is_active) on public.admin_memberships to supabase_auth_admin;
create policy "Auth hook reads memberships" on public.admin_memberships
  for select to supabase_auth_admin using (true);

create function discovery_auth.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  claims jsonb := event->'claims';
  metadata jsonb;
  membership_role text;
begin
  metadata := case when jsonb_typeof(claims->'app_metadata') = 'object'
    then claims->'app_metadata' else '{}'::jsonb end;
  -- Remove any stale or pre-provisioned role before deriving the current one.
  metadata := metadata - 'discovery_role';
  if claims->>'role' = 'authenticated'
     and claims->'is_anonymous' = 'false'::jsonb
     and claims->>'sub' = event->>'user_id' then
    select role into membership_role from public.admin_memberships
      where user_id = (event->>'user_id')::uuid and is_active
        and role in ('admin', 'reviewer');
  end if;
  if membership_role is not null then
    metadata := jsonb_set(metadata, '{discovery_role}', to_jsonb(membership_role));
  end if;
  -- All mandatory and unrelated claims are preserved verbatim.
  claims := jsonb_set(claims, '{app_metadata}', metadata);
  return jsonb_build_object('claims', claims);
end;
$$;
revoke all on function discovery_auth.custom_access_token_hook(jsonb)
  from public, anon, authenticated;
grant execute on function discovery_auth.custom_access_token_hook(jsonb) to supabase_auth_admin;
comment on function discovery_auth.custom_access_token_hook(jsonb) is
  'Derives signed discovery_role from current admin_memberships. Never expose discovery_auth via Data API.';
