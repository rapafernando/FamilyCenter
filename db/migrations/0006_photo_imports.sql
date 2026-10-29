-- Picking photos in Google Photos (Google's photo picker): one row per attempt. The short-lived access token is kept
-- encrypted only while the import runs, then erased. Nothing here is a lasting link to the person's Google Photos.
create table photo_imports (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  album_id       uuid not null,
  created_by     uuid references users(id) on delete set null,
  session_id     text not null,
  picker_uri     text not null,
  token_encrypted bytea,
  token_key_id   integer,
  status         text not null default 'waiting' check (status in ('waiting','importing','done','failed','expired','cancelled')),
  picked         integer not null default 0,
  added          integer not null default 0,
  skipped        integer not null default 0,
  error          text,
  poll_after     timestamptz not null default now(),
  timeout_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (album_id, household_id) references photo_albums (id, household_id) on delete cascade
);
create index photo_imports_household on photo_imports (household_id, created_at desc);
alter table photo_imports enable row level security;
alter table photo_imports force row level security;
create policy tenant_isolation on photo_imports using (household_id = app_household_id()) with check (household_id = app_household_id());
grant select, insert, update, delete on photo_imports to app_user, app_worker;
