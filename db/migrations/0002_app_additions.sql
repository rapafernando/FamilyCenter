-- Things the screens need that 0001 did not have.

-- Place name for the weather forecast (free text such as "Vero Beach, FL").
alter table households add column location text not null default '';

-- House and sponsor cards show a short line of text under the headline.
alter table ad_campaigns add column body text not null default '';

-- Shared sign-in throttle and the "last time a job ran" markers live in Postgres, so a restart forgets nothing.
create table job_runs (
  name        text primary key,
  last_run_at timestamptz,
  last_error  text
);

-- Invitation links: the raw token is shown once to the person who invites. Only its hash is stored (0001).
-- Two house cards ship with the app. Replace click_url with your own page before sharing the app.
insert into ad_campaigns (advertiser, name, kind, creative_key, creative_alt, headline, body, click_url, weight, child_safe)
values
  ('This app', 'About the ads', 'house', 'text-only', 'Text card', 'Free for families, paid for by small ads',
   'Ads only show between photos. They never show on the calendar or chores.', 'https://example.com/about-ads', 3, true);

-- Both app roles may use the new tables. (Default privileges in 0001 cover tables made later by the same owner.)
grant select, insert, update, delete on job_runs to app_user, app_worker;
