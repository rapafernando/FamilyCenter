-- Settings that belong to the whole server rather than one household: the Google sign-in client, and the update check.
-- Secrets are stored encrypted (same key ring as the Google and AI keys). Only the person who runs the server can change them.
create table instance_settings (
  key              text primary key,
  value            text,
  secret_encrypted bytea,
  secret_key_id    integer,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references users(id) on delete set null
);
grant select, insert, update, delete on instance_settings to app_user, app_worker;

-- The first person ever to sign up runs this server. Existing servers: the oldest account.
update users set is_platform_admin = true
 where id = (select id from users order by created_at limit 1)
   and not exists (select 1 from users where is_platform_admin);
