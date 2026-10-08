-- Run only against a verified target with a privileged migration operator.
-- All synthetic Auth rows and memberships are rolled back; no emails are sent.
begin;
insert into auth.users (id) values ('00000000-0000-4000-a000-000000000024'), ('00000000-0000-4000-a000-000000000025');
insert into public.admin_memberships (user_id, role, is_active, updated_by, change_reason)
values ('00000000-0000-4000-a000-000000000024', 'reviewer', true, 'transactional-test', 'RLS validation'),
       ('00000000-0000-4000-a000-000000000025', 'admin', true, 'transactional-test', 'RLS validation');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000024', true);
do $$
begin
  if (select count(*) from public.admin_memberships) <> 1 then raise exception 'RLS leaked another membership'; end if;
  if (select role from public.admin_memberships) <> 'reviewer' then raise exception 'Wrong role'; end if;
  begin
    update public.admin_memberships set role = 'admin', is_active = true;
    raise exception 'Privilege escalation was permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.admin_memberships (user_id, role, is_active, updated_by, change_reason)
    values ('00000000-0000-4000-a000-000000000024', 'admin', true, 'attacker', 'escalation');
    raise exception 'Self provisioning was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;
set local role anon;
do $$
begin
  begin
    perform user_id from public.admin_memberships;
    raise exception 'Anonymous read was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
