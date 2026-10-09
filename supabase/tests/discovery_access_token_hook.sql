-- Synthetic rows only in an isolated local database; entire test rolls back.
begin;
insert into auth.users(id) select ('00000000-0000-4000-a000-00000000000' || n)::uuid from generate_series(1,5) n;
insert into public.admin_memberships(user_id, role, is_active, updated_by, change_reason)
values ('00000000-0000-4000-a000-000000000001','admin',true,'sensitive-operator','sensitive-reason'),
       ('00000000-0000-4000-a000-000000000002','reviewer',true,'sensitive-operator','sensitive-reason'),
       ('00000000-0000-4000-a000-000000000004','admin',false,'sensitive-operator','sensitive-reason');
-- Unknown roles are blocked by the production constraint. Temporarily relax it
-- inside this rolled-back test to verify defense against future schema drift.
alter table public.admin_memberships drop constraint admin_memberships_role_check;
insert into public.admin_memberships(user_id, role, is_active, updated_by, change_reason)
values ('00000000-0000-4000-a000-000000000005','owner',true,'test','unknown role');
set local role supabase_auth_admin;
do $$
declare
  claims jsonb;
  result jsonb;
  id text;
  expected text;
begin
  for n in 1..5 loop
    id := '00000000-0000-4000-a000-00000000000' || n;
    expected := case n when 1 then 'admin' when 2 then 'reviewer' else null end;
    claims := jsonb_build_object('iss','https://offline.test/auth/v1','aud','authenticated',
      'exp',2000000300,'iat',2000000000,'sub',id,'role','authenticated','aal','aal1',
      'session_id','00000000-0000-4000-a000-000000000099','email','test@example.test',
      'phone','','is_anonymous',false,'amr',jsonb_build_array(jsonb_build_object('method','password')),
      'app_metadata',jsonb_build_object('provider','email','discovery_role','admin'),
      'user_metadata',jsonb_build_object('discovery_role','admin'));
    result := discovery_auth.custom_access_token_hook(jsonb_build_object('user_id',id,'claims',claims))->'claims';
    if result#>>'{app_metadata,discovery_role}' is distinct from expected then
      raise exception 'Incorrect role for case %',n;
    end if;
    if (result - 'app_metadata') <> (claims - 'app_metadata') or
       result#>>'{app_metadata,provider}' <> 'email' then raise exception 'Claims lost'; end if;
    if result::text like '%sensitive-%' then raise exception 'Audit information leaked'; end if;
  end loop;
  claims := jsonb_set(claims,'{sub}','"00000000-0000-4000-a000-000000000001"');
  claims := jsonb_set(claims,'{is_anonymous}','true');
  result := discovery_auth.custom_access_token_hook(jsonb_build_object('user_id',claims->>'sub','claims',claims));
  if result#>>'{claims,app_metadata,discovery_role}' is not null then raise exception 'Anonymous privilege'; end if;
  claims := jsonb_set(claims,'{is_anonymous}','false');
  result := discovery_auth.custom_access_token_hook(jsonb_build_object('user_id','00000000-0000-4000-a000-000000000002','claims',claims));
  if result#>>'{claims,app_metadata,discovery_role}' is not null then raise exception 'Subject confusion'; end if;
  claims := claims - 'app_metadata';
  result := discovery_auth.custom_access_token_hook(jsonb_build_object('user_id',claims->>'sub','claims',claims));
  if result#>>'{claims,app_metadata,discovery_role}' <> 'admin' then raise exception 'Missing metadata not handled'; end if;
  begin
    perform updated_by from public.admin_memberships;
    raise exception 'Hook can read audit columns';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.admin_memberships set role='admin';
    raise exception 'Hook can write roles';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
begin
  if (select prosecdef from pg_proc where oid='discovery_auth.custom_access_token_hook(jsonb)'::regprocedure) then
    raise exception 'Hook is SECURITY DEFINER';
  end if;
  if exists (select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
    where p.oid='discovery_auth.custom_access_token_hook(jsonb)'::regprocedure and a.grantee=0) then
    raise exception 'PUBLIC function privilege';
  end if;
end $$;
set local role authenticated;
do $$
begin
  begin
    perform discovery_auth.custom_access_token_hook('{}');
    raise exception 'Authenticated user can forge hook input';
  exception when insufficient_privilege then null;
  end;
end $$;
set local role anon;
do $$
begin
  begin
    perform discovery_auth.custom_access_token_hook('{}');
    raise exception 'Anonymous can execute hook';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
