-- Which Google calendars this account may add events to (holiday and subscribed calendars are read only), and which is the account's main one.
alter table synced_calendars add column can_write boolean not null default true;
alter table synced_calendars add column is_primary boolean not null default false;
