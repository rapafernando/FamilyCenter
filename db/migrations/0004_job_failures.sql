-- Where background jobs that kept failing end up, so nothing fails silently.
create table job_failures (
  id         bigint generated always as identity primary key,
  job        text not null,
  subject    text,
  error      text not null,
  attempts   smallint not null,
  created_at timestamptz not null default now()
);
create index job_failures_recent on job_failures (created_at desc);
grant select, insert, update, delete on job_failures to app_user, app_worker;
