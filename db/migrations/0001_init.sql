-- Family calendar: schema for Postgres 16 or newer. First migration, run as the owner role.
-- Design rules:
--   * Every tenant table carries household_id. Child rows reference parents with
--     (id, household_id) composite keys, so a row can never point at another
--     household's data, even if application code has a bug.
--   * Row level security is a second layer on top: the app sets
--     app.household_id inside each transaction (select set_config('app.household_id', $1, true)).
--   * Times are timestamptz in UTC. Calendar dates (task occurrences, meal days,
--     countdowns) are plain dates in the household's timezone.
--   * Secrets (OAuth refresh tokens, app passwords, AI keys, secret ICS URLs) are
--     encrypted in application code (AES-256-GCM) and stored as bytea with a key id.

-- ---------------------------------------------------------------- helpers

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create function app_household_id() returns uuid language sql stable as $$
  select nullif(current_setting('app.household_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------- identity
-- Sessions are JWTs (Auth.js credentials login requires it). session_version lets
-- us sign everyone out by bumping it.

create table users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  email_verified_at timestamptz,
  name              text,
  image             text,
  password_hash     text,
  session_version   integer not null default 0,
  is_platform_admin boolean not null default false,
  locale            text not null default 'en',
  deletion_requested_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint users_email_shape check (position('@' in email) > 1)
);
create unique index users_email_lower on users (lower(email));

-- Only for signing in with Google or Microsoft. Calendar access is separate
-- (calendar_connections) and asks for different permissions.
create table auth_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users(id) on delete cascade,
  type                text not null,
  provider            text not null,
  provider_account_id text not null,
  created_at          timestamptz not null default now(),
  unique (provider, provider_account_id)
);
create index auth_accounts_user on auth_accounts (user_id);

create table auth_verification_tokens (
  identifier text not null,
  token      text not null,
  expires    timestamptz not null,
  primary key (identifier, token)
);

-- ---------------------------------------------------------------- households

create table households (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  timezone           text not null default 'UTC',
  week_starts_on     smallint not null default 0 check (week_starts_on between 0 and 6),
  default_view       text not null default 'week' check (default_view in ('day','week','month')),
  parent_pin_hash    text,
  -- ads: off unless the hosted service switches it on at sign-up
  ads_enabled        boolean not null default false,
  ads_every_n_photos smallint not null default 4 check (ads_every_n_photos between 3 and 10),
  inbound_slug       text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  role         text not null check (role in ('owner','adult','viewer')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user on household_members (user_id);

create table invitations (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('adult','viewer')),
  token_hash   text not null unique,
  invited_by   uuid references users(id) on delete set null,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index invitations_household on invitations (household_id);

-- People who appear on the calendar. Most are children with no login.
create table profiles (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null,
  color        text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  emoji        text,
  birthday     date,
  kind         text not null default 'person' check (kind in ('person','household','other')),
  user_id      uuid references users(id) on delete set null,
  star_balance integer not null default 0 check (star_balance >= 0),
  sort_order   integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, household_id)
);
create index profiles_household on profiles (household_id, sort_order);
create unique index profiles_one_household_profile on profiles (household_id) where kind = 'household';

-- ---------------------------------------------------------------- displays

-- Any browser can be a display. It authenticates with a long random token (only the
-- sha-256 is stored), separate from user sessions, and can only do display things.
create table devices (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  nickname     text not null,
  kind         text not null default 'display' check (kind in ('display','browser')),
  token_hash   text not null unique,
  config       jsonb not null default '{}',
  user_agent   text,
  last_seen_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, household_id)
);
create unique index devices_nickname on devices (household_id, lower(nickname)) where revoked_at is null;

-- A display with no household yet shows a code. A signed-in user types it in. The
-- display polls with a secret that only it knows, then receives its device token once.
-- Not tenant-scoped until claimed. Rows live ten minutes; a job deletes expired ones.
create table device_pairing_codes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  poll_secret_hash text not null,
  user_agent       text,
  attempts         smallint not null default 0,
  expires_at       timestamptz not null,
  claimed_at       timestamptz,
  claimed_by       uuid references users(id) on delete set null,
  household_id     uuid references households(id) on delete cascade,
  device_id        uuid references devices(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index device_pairing_expiry on device_pairing_codes (expires_at);

-- ---------------------------------------------------------------- calendar

create table event_categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null,
  color        text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  emoji        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, household_id)
);
create unique index event_categories_name on event_categories (household_id, lower(name));

-- One row per linked account or feed. Credentials are encrypted.
create table calendar_connections (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references households(id) on delete cascade,
  provider         text not null check (provider in ('google','microsoft','caldav_apple','caldav_yahoo','caldav_other','ics')),
  mode             text not null default 'one_way' check (mode in ('one_way','two_way')),
  display_name     text not null,
  account_email    text,
  secret_encrypted bytea,
  secret_key_id    smallint,
  status           text not null default 'ok' check (status in ('ok','needs_reauth','error','paused')),
  sync_state       jsonb not null default '{}',
  webhook_state    jsonb not null default '{}',
  next_sync_at     timestamptz,
  last_synced_at   timestamptz,
  last_error       text,
  token_checked_at timestamptz,
  token_failures   smallint not null default 0 check (token_failures >= 0),
  reauth_notified_at timestamptz,
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, household_id),
  constraint ics_is_read_only check (provider <> 'ics' or mode = 'one_way'),
  constraint secret_has_key check ((secret_encrypted is null) = (secret_key_id is null))
);
create index calendar_connections_due on calendar_connections (next_sync_at) where status = 'ok';
create index calendar_connections_household on calendar_connections (household_id);

create table synced_calendars (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references households(id) on delete cascade,
  connection_id    uuid not null,
  external_id      text not null,
  name             text not null,
  color            text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  enabled          boolean not null default true,
  profile_id       uuid,
  is_default_target boolean not null default false,
  sync_state       jsonb not null default '{}',
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, household_id),
  unique (connection_id, external_id),
  foreign key (connection_id, household_id) references calendar_connections (id, household_id) on delete cascade,
  foreign key (profile_id, household_id) references profiles (id, household_id) on delete set null (profile_id)
);
create unique index synced_calendars_one_default on synced_calendars (household_id) where is_default_target;

-- All-day events: starts_at is midnight of the first day and ends_at is midnight after
-- the last day, both in tz. Recurring events keep an RRULE and are expanded in code;
-- changes to single occurrences live in event_overrides.
create table events (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references households(id) on delete cascade,
  calendar_id         uuid,
  profile_id          uuid not null,
  category_id         uuid,
  title               text not null check (length(trim(title)) > 0),
  description         text,
  location            text,
  all_day             boolean not null default false,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  tz                  text not null,
  rrule               text,
  recurrence_until    timestamptz,
  alert_minutes       integer[] not null default '{}',
  source              text not null default 'local' check (source in ('local','synced','imported')),
  external_id         text,
  external_etag       text,
  external_updated_at timestamptz,
  created_by          uuid references users(id) on delete set null,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, household_id),
  constraint ends_after_start check (ends_at >= starts_at),
  constraint synced_has_origin check (source <> 'synced' or (external_id is not null and calendar_id is not null)),
  foreign key (calendar_id, household_id) references synced_calendars (id, household_id) on delete cascade,
  foreign key (profile_id, household_id) references profiles (id, household_id) on delete restrict,
  foreign key (category_id, household_id) references event_categories (id, household_id) on delete set null (category_id)
);
create index events_range on events (household_id, starts_at) where deleted_at is null;
create index events_recurring on events (household_id, recurrence_until) where rrule is not null and deleted_at is null;
create index events_profile on events (profile_id);
create unique index events_external on events (calendar_id, external_id) where external_id is not null;

create table event_overrides (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  event_id      uuid not null,
  recurrence_id timestamptz not null,
  cancelled     boolean not null default false,
  title         text,
  description   text,
  location      text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  profile_id    uuid,
  external_id   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (event_id, recurrence_id),
  foreign key (event_id, household_id) references events (id, household_id) on delete cascade,
  foreign key (profile_id, household_id) references profiles (id, household_id) on delete set null (profile_id)
);

create table countdowns (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  title           text not null,
  target_date     date not null,
  emoji           text,
  show_on_display boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index countdowns_household on countdowns (household_id, target_date);

-- ---------------------------------------------------------------- chores, routines, stars

-- One row per assigned profile. Rows created together share group_id.
create table tasks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  group_id     uuid not null default gen_random_uuid(),
  profile_id   uuid not null,
  kind         text not null check (kind in ('chore','routine')),
  title        text not null check (length(trim(title)) > 0),
  emoji        text,
  time_of_day  text check (time_of_day in ('morning','afternoon','evening')),
  due_time     time,
  starts_on    date not null,
  ends_on      date,
  rrule        text,
  star_value   integer not null default 0 check (star_value between 0 and 500),
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, household_id),
  constraint routine_timing check (kind <> 'routine' or (time_of_day is not null and due_time is null)),
  constraint chore_timing check (kind <> 'chore' or time_of_day is null),
  constraint ends_after_start check (ends_on is null or ends_on >= starts_on),
  foreign key (profile_id, household_id) references profiles (id, household_id) on delete cascade
);
create index tasks_profile on tasks (household_id, profile_id) where active;
create index tasks_group on tasks (group_id);

create table task_completions (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references households(id) on delete cascade,
  task_id             uuid not null,
  occurrence_on       date not null,
  completed_at        timestamptz not null default now(),
  completed_by_device uuid references devices(id) on delete set null,
  completed_by_user   uuid references users(id) on delete set null,
  unique (task_id, occurrence_on),
  unique (id, household_id),
  foreign key (task_id, household_id) references tasks (id, household_id) on delete cascade
);
create index task_completions_day on task_completions (household_id, occurrence_on);

create table rewards (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  profile_id   uuid not null,
  title        text not null check (length(trim(title)) > 0),
  emoji        text,
  stars_needed integer not null check (stars_needed between 1 and 500),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, household_id),
  foreign key (profile_id, household_id) references profiles (id, household_id) on delete cascade
);
create index rewards_profile on rewards (profile_id) where active;

-- Append-only. The balance on profiles is kept by a trigger and cannot go below zero,
-- so two screens redeeming the same stars at once cannot both succeed.
-- Unchecking a task adds a 'reversal' row; it never deletes history.
create table star_ledger (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references households(id) on delete cascade,
  profile_id         uuid not null,
  delta              integer not null check (delta <> 0),
  reason             text not null check (reason in ('task','manual','redeem','reversal')),
  task_completion_id uuid,
  reward_id          uuid,
  note               text,
  created_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  foreign key (profile_id, household_id) references profiles (id, household_id) on delete cascade,
  foreign key (task_completion_id, household_id) references task_completions (id, household_id) on delete set null (task_completion_id),
  foreign key (reward_id, household_id) references rewards (id, household_id) on delete set null (reward_id),
  constraint redeem_is_negative check (reason <> 'redeem' or delta < 0)
);
create index star_ledger_profile on star_ledger (profile_id, created_at desc);
create unique index star_ledger_one_award_per_completion on star_ledger (task_completion_id)
  where reason = 'task' and task_completion_id is not null;

create function apply_star_delta() returns trigger language plpgsql as $$
begin
  update profiles
     set star_balance = star_balance + new.delta
   where id = new.profile_id and household_id = new.household_id;
  return new;
end $$;
create trigger star_ledger_apply after insert on star_ledger
  for each row execute function apply_star_delta();

-- ---------------------------------------------------------------- lists and meals

create table lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null,
  color        text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  emoji        text,
  is_grocery   boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, household_id)
);
create unique index lists_one_grocery on lists (household_id) where is_grocery;

create table recipes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  category     text,
  description  text,
  ingredients  jsonb not null default '[]',
  instructions text,
  source       text not null default 'manual' check (source in ('manual','import','ai')),
  source_url   text,
  image_key    text,
  favorite     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, household_id)
);
create index recipes_household on recipes (household_id, lower(title));

create table list_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  list_id      uuid not null,
  text         text not null check (length(trim(text)) > 0),
  done         boolean not null default false,
  done_at      timestamptz,
  sort_order   integer not null default 0,
  recipe_id    uuid,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (list_id, household_id) references lists (id, household_id) on delete cascade,
  foreign key (recipe_id, household_id) references recipes (id, household_id) on delete set null (recipe_id)
);
create index list_items_list on list_items (list_id, sort_order);

create table meal_plan_entries (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  plan_date    date not null,
  slot         text not null check (slot in ('breakfast','lunch','dinner','snack')),
  recipe_id    uuid,
  title        text not null check (length(trim(title)) > 0),
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (recipe_id, household_id) references recipes (id, household_id) on delete set null (recipe_id)
);
create index meal_plan_day on meal_plan_entries (household_id, plan_date);

-- ---------------------------------------------------------------- photos

create table photo_albums (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  name            text not null,
  show_on_display boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, household_id)
);

create table photos (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  album_id     uuid,
  storage_key  text not null unique,
  mime         text not null check (mime like 'image/%' or mime like 'video/%'),
  bytes        bigint not null check (bytes > 0),
  width        integer,
  height       integer,
  caption      text,
  taken_at     timestamptz,
  sha256       text,
  uploaded_by  uuid references users(id) on delete set null,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  foreign key (album_id, household_id) references photo_albums (id, household_id) on delete set null (album_id)
);
create index photos_album on photos (household_id, album_id, created_at) where deleted_at is null;
create unique index photos_no_duplicates on photos (household_id, sha256) where sha256 is not null and deleted_at is null;

-- ---------------------------------------------------------------- AI (bring your own key)
-- AI features exist only while a household has an enabled default provider.

create table ai_providers (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households(id) on delete cascade,
  provider          text not null check (provider in ('openai','anthropic','google','openai_compatible')),
  label             text not null,
  model             text not null,
  base_url          text,
  api_key_encrypted bytea,
  key_id            smallint,
  key_last4         text,
  is_default        boolean not null default false,
  enabled           boolean not null default true,
  last_verified_at  timestamptz,
  last_error        text,
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, label),
  constraint key_required check (provider = 'openai_compatible' or api_key_encrypted is not null),
  constraint base_url_only_for_compatible check (provider = 'openai_compatible' or base_url is null),
  constraint key_has_key_id check ((api_key_encrypted is null) = (key_id is null))
);
create unique index ai_providers_one_default on ai_providers (household_id) where is_default;

-- Results are proposals. Nothing is written to the calendar, lists or recipes
-- until a person reviews and applies them.
create table ai_jobs (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  provider_id     uuid,
  kind            text not null check (kind in ('meal_plan','event_import','recipe_import')),
  status          text not null default 'queued' check (status in ('queued','running','needs_review','applied','failed','discarded')),
  input           jsonb not null default '{}',
  input_file_key  text,
  result          jsonb,
  error           text,
  tokens_in       integer,
  tokens_out      integer,
  input_purge_at  timestamptz,
  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (provider_id, household_id) references ai_providers (id, household_id) on delete set null (provider_id)
);
create index ai_jobs_household on ai_jobs (household_id, created_at desc);

-- ---------------------------------------------------------------- ads
-- Platform tables, not tenant data. No device, household or user ids are stored with
-- impressions or clicks, only daily totals. Only campaigns marked child_safe are served.

create table ad_campaigns (
  id           uuid primary key default gen_random_uuid(),
  advertiser   text not null,
  name         text not null,
  kind         text not null check (kind in ('house','sponsor')),
  placements   text[] not null default '{screensaver}' check (placements <@ array['screensaver','corner','app_banner']::text[]),
  creative_key text not null,
  creative_alt text not null,
  headline     text,
  click_url    text not null check (click_url ~ '^https://'),
  weight       integer not null default 1 check (weight between 1 and 100),
  child_safe   boolean not null default false,
  active       boolean not null default true,
  starts_at    timestamptz,
  ends_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ends_after_start check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table ad_stats_daily (
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,
  day         date not null,
  placement   text not null check (placement in ('screensaver','corner','app_banner')),
  impressions bigint not null default 0,
  clicks      bigint not null default 0,
  handoffs    bigint not null default 0,
  primary key (campaign_id, day, placement)
);

-- ---------------------------------------------------------------- updated_at triggers

do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- roles and row level security
-- app_user: the web app. Subject to row level security.
-- app_worker: background jobs. Can read across households (it must, to find due syncs)
--             and sets app.household_id before touching tenant rows.
-- Set passwords outside this file: alter role app_user login password '...';

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_worker') then
    create role app_worker nologin bypassrls;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'household_members','invitations','profiles','devices','event_categories',
    'calendar_connections','synced_calendars','events','event_overrides','countdowns',
    'tasks','task_completions','rewards','star_ledger','lists','list_items','recipes',
    'meal_plan_entries','photo_albums','photos','ai_providers','ai_jobs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (household_id = app_household_id()) with check (household_id = app_household_id())', t);
  end loop;
end $$;

alter table households enable row level security;
alter table households force row level security;
create policy tenant_isolation on households
  using (id = app_household_id()) with check (id = app_household_id());

grant usage on schema public to app_user, app_worker;
grant select, insert, update, delete on all tables in schema public to app_user, app_worker;
revoke update, delete on star_ledger from app_user, app_worker;
alter default privileges in schema public grant select, insert, update, delete on tables to app_user, app_worker;
