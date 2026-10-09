-- ONLY after disabling the Auth hook, with separate STAGING approval.
-- Convert to a versioned rollback migration in the approved operator workflow.
begin;
drop function discovery_auth.custom_access_token_hook(jsonb);
drop policy "Auth hook reads memberships" on public.admin_memberships;
revoke select (user_id, role, is_active) on public.admin_memberships from supabase_auth_admin;
revoke usage on schema discovery_auth from supabase_auth_admin;
drop schema discovery_auth;
commit;
