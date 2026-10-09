create table public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'reviewer')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null,
  change_reason text not null check (length(trim(change_reason)) > 0)
);
alter table public.admin_memberships owner to postgres;
alter table public.admin_memberships enable row level security;
revoke all on public.admin_memberships from public, anon, authenticated;
grant select (user_id, role, is_active) on public.admin_memberships to authenticated;
create policy "Read own membership" on public.admin_memberships
  for select to authenticated using ((select auth.uid()) = user_id);
comment on table public.admin_memberships is 'Owned by sports-events-web Auth migrations; unrelated to engine Flyway. Provision through trusted SQL only.';
