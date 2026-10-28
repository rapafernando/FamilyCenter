-- Narrow lookups that must work before we know the household (sign in, device cookie, invitation link).
-- They run as app_worker, which bypasses row level security, and return only what the caller needs.

grant create on schema public to app_worker;

create function auth_device(p_token_hash text)
returns table (id uuid, household_id uuid, nickname text, config jsonb)
language sql security definer set search_path = public as $$
  update devices set last_seen_at = now()
   where token_hash = p_token_hash and revoked_at is null
  returning devices.id, devices.household_id, devices.nickname, devices.config
$$;

create function user_memberships(p_user_id uuid)
returns table (household_id uuid, role text)
language sql security definer stable set search_path = public as $$
  select m.household_id, m.role
    from household_members m join households h on h.id = m.household_id
   where m.user_id = p_user_id and h.deleted_at is null
   order by m.created_at
$$;

create function invitation_by_hash(p_token_hash text)
returns table (id uuid, household_id uuid, email text, role text, household_name text)
language sql security definer stable set search_path = public as $$
  select i.id, i.household_id, i.email, i.role, h.name
    from invitations i join households h on h.id = i.household_id
   where i.token_hash = p_token_hash and i.accepted_at is null and i.expires_at > now() and h.deleted_at is null
$$;

alter function auth_device(text) owner to app_worker;
alter function user_memberships(uuid) owner to app_worker;
alter function invitation_by_hash(text) owner to app_worker;
revoke create on schema public from app_worker;

revoke all on function auth_device(text), user_memberships(uuid), invitation_by_hash(text) from public;
grant execute on function auth_device(text), user_memberships(uuid), invitation_by_hash(text) to app_user, app_worker;
