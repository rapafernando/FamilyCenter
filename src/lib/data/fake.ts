'use client';
// The fake data layer. Same function names and shapes the real one (replica-backend) will have, so swapping it in
// changes no screen code. Everything is async, throws ApiError for rule violations, and lives in the browser.
import { DateTime } from 'luxon';
import { ApiError } from '../types';
import type {
  AdCampaign, AiJob, AiKind, AiProposalItem, AiProviderName, Category, Connection, Countdown, EventItem, ISODate, Invitation, List, ListItem, MealEntry,
  MealSlot, Occurrence, Profile, Recipe, Reward, Role, Session, Slide, StarEntry, Task, TaskForDay,
} from '../types';
import { buildRrule, expandEvent, taskOccursOn } from '../recurrence';
import { dateOfInstant, todayIn, uid } from '../time';
import { MARKER_PRESETS } from '../markers.generated';
import {
  commit, getState, resetDemo, resetEmpty, sessionDeviceId, sessionUserId, setSessionDeviceId, setSessionUserId,
} from './store';

export const IS_FAKE = true;
const wait = () => new Promise<void>((r) => setTimeout(r, 25));
const nowISO = () => new Date().toISOString();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const need = <T,>(v: T | undefined | null, what: string): T => { if (v == null) throw new ApiError('not_found', `${what} was not found.`); return v; };
const clean = (s: string) => s.trim();
const HEX = /^#[0-9a-fA-F]{6}$/;

export const data = {
  /* ------------------------------------------------------------ what this server can do (the real server reports it; practice mode is all pretend) */
  async features() { await wait(); return { demo: true, googleConfigured: false, googleOauthStatus: 'testing' as 'testing' | 'production', smtp: false, adsDefaultOn: false }; },
  async previewInvitation(token: string): Promise<{ householdName: string; email: string; role: 'adult' | 'viewer' }> { await wait(); const i = need(getState().invitations.find((x) => x.token === token), 'That invitation'); return { householdName: getState().household.name, email: i.email, role: i.role }; },
  async acceptInvitation(token: string) { await wait(); void token; throw new ApiError('unavailable', 'Invitations need the real server.'); },
  async adImpression(campaignId: string) { void campaignId; },
  async getAccount() { await wait(); const u = getState().user; return { email: u?.email ?? '', verified: true, canEmail: false }; },
  async changePassword(current: string, next: string) { await wait(); const u = need(getState().user, 'Your account'); if (u.password !== current) throw new ApiError('invalid_credentials', 'The current password is not right.'); if (next.length < 8) throw new ApiError('weak_password', 'Use at least 8 characters for the password.'); commit((s) => { s.user!.password = next; }); },
  async signOutEverywhere() { await wait(); },
  async requestPasswordReset(email: string) { await wait(); void email; throw new ApiError('no_email', 'Practice mode cannot send email.'); },
  async resetPassword(token: string, next: string) { await wait(); void token; void next; throw new ApiError('expired', 'Practice mode has no reset links.'); },
  async sendEmailVerification() { await wait(); throw new ApiError('no_email', 'Practice mode cannot send email.'); },
  async verifyEmail(token: string) { await wait(); void token; throw new ApiError('expired', 'Practice mode has no confirmation links.'); },

  /* ------------------------------------------------------------ session */
  async getSession(): Promise<Session> {
    await wait(); const s = getState();
    const uidv = sessionUserId();
    if (uidv && s.user?.id === uidv) { const m = s.members.find((x) => x.id === uidv); return { user: { id: s.user.id, name: s.user.name, email: s.user.email }, deviceId: null, role: m?.role ?? 'owner' }; }
    const dev = sessionDeviceId();
    if (dev && s.devices.some((d) => d.id === dev)) return { user: null, deviceId: dev, role: null };
    return { user: null, deviceId: null, role: null };
  },
  async startDemo() { await wait(); resetDemo(); const s = getState(); const owner = s.members.find((m) => m.isYou)!; s.user = { id: owner.id, name: owner.name, email: owner.email, password: 'demo' }; commit(() => 0); setSessionUserId(owner.id); },
  async signUp(i: { name: string; email: string; password: string; householdName?: string; timezone: string; inviteToken?: string; pin?: string }) {
    await wait();
    if (!i.inviteToken && !/^\d{4}$/.test(i.pin ?? '')) throw new ApiError('invalid_pin', 'Choose a parent PIN of exactly 4 digits. Settings ask for it.');
    if (!/^\S+@\S+\.\S+$/.test(i.email)) throw new ApiError('invalid_email', 'Enter an email address like name@example.com.');
    if (i.password.length < 8) throw new ApiError('weak_password', 'Use at least 8 characters for the password.');
    if (!clean(i.name) || !clean(i.householdName ?? '')) throw new ApiError('missing', 'Fill in your name and a name for the household.');
    resetEmpty({ ...i, name: clean(i.name), householdName: clean(i.householdName ?? 'My household') });
    setSessionUserId(getState().user!.id);
  },
  async signIn(email: string, password: string) {
    await wait(); const u = getState().user;
    if (!u || u.email.toLowerCase() !== email.trim().toLowerCase() || u.password !== password) throw new ApiError('invalid_credentials', 'That email and password do not match.');
    setSessionUserId(u.id);
  },
  async signOut() { await wait(); setSessionUserId(null); },
  async signOutDevice() { await wait(); setSessionDeviceId(null); },

  /* ------------------------------------------------------------ household */
  async getHousehold() { await wait(); return clone(getState().household); },
  async updateHousehold(patch: Partial<{ name: string; timezone: string; weekStartsOn: number; defaultView: 'day' | 'week' | 'month'; adsEnabled: boolean; adsEveryNPhotos: number; location: string }>) {
    await wait();
    if (patch.adsEveryNPhotos !== undefined && (patch.adsEveryNPhotos < 3 || patch.adsEveryNPhotos > 10)) throw new ApiError('invalid', 'Choose between every 3 and every 10 photos.');
    return commit((s) => { Object.assign(s.household, patch); return clone(s.household); });
  },

  /* ------------------------------------------------------------ profiles */
  async listProfiles(): Promise<Profile[]> { await wait(); return clone(getState().profiles); },
  async createProfile(i: { name: string; color: string; birthday?: string | null; kind?: Profile['kind'] }) {
    await wait();
    if (!clean(i.name)) throw new ApiError('missing', 'Give this person a name.');
    return commit((s) => { const p: Profile = { id: uid(), name: clean(i.name), color: i.color, birthday: i.birthday || null, kind: i.kind ?? 'person', starBalance: 0 }; s.profiles.push(p); return clone(p); });
  },
  async updateProfile(id: string, patch: Partial<Pick<Profile, 'name' | 'color' | 'birthday'>>) {
    await wait();
    if (patch.name !== undefined && !clean(patch.name)) throw new ApiError('missing', 'Give this person a name.');
    return commit((s) => { const p = need(s.profiles.find((x) => x.id === id), 'That profile'); Object.assign(p, patch); return clone(p); });
  },
  async deleteProfile(id: string) {
    await wait();
    commit((s) => {
      const p = need(s.profiles.find((x) => x.id === id), 'That profile');
      if (p.kind === 'household') throw new ApiError('protected', 'The household profile cannot be deleted.');
      if (s.events.some((e) => e.profileId === id)) throw new ApiError('in_use', `${p.name} still has events. Merge ${p.name} into someone else instead.`);
      s.profiles = s.profiles.filter((x) => x.id !== id);
      s.tasks = s.tasks.filter((t) => t.profileId !== id); s.rewards = s.rewards.filter((r) => r.profileId !== id);
      s.calendars.forEach((c) => { if (c.profileId === id) c.profileId = null; });
    });
  },
  async mergeProfiles(fromId: string, intoId: string) {
    await wait();
    commit((s) => {
      if (fromId === intoId) throw new ApiError('invalid', 'Pick two different people.');
      const from = need(s.profiles.find((p) => p.id === fromId), 'That profile'), into = need(s.profiles.find((p) => p.id === intoId), 'The target profile');
      s.events.forEach((e) => { if (e.profileId === fromId) e.profileId = intoId; });
      s.overrides.forEach((o) => { if (o.profileId === fromId) o.profileId = intoId; });
      s.tasks.forEach((t) => { if (t.profileId === fromId) t.profileId = intoId; });
      s.rewards.forEach((r) => { if (r.profileId === fromId) r.profileId = intoId; });
      s.stars.forEach((e) => { if (e.profileId === fromId) e.profileId = intoId; });
      s.calendars.forEach((c) => { if (c.profileId === fromId) c.profileId = intoId; });
      into.starBalance += from.starBalance;
      s.profiles = s.profiles.filter((p) => p.id !== fromId);
    });
  },

  /* ------------------------------------------------------------ categories and countdowns */
  async listCategories(): Promise<Category[]> { await wait(); return clone(getState().categories); },
  async createCategory(i: { name: string; color: string }) { await wait(); if (!clean(i.name)) throw new ApiError('missing', 'Give the category a name.'); return commit((s) => { const c = { id: uid(), name: clean(i.name), color: i.color }; s.categories.push(c); return clone(c); }); },
  async deleteCategory(id: string) { await wait(); commit((s) => { s.categories = s.categories.filter((c) => c.id !== id); s.events.forEach((e) => { if (e.categoryId === id) e.categoryId = null; }); }); },
  async listCountdowns(): Promise<Countdown[]> { await wait(); return clone(getState().countdowns).sort((a, b) => a.targetDate.localeCompare(b.targetDate)); },
  async createCountdown(i: Omit<Countdown, 'id'>) { await wait(); if (!clean(i.title)) throw new ApiError('missing', 'Give the countdown a name.'); return commit((s) => { const c = { ...i, id: uid(), title: clean(i.title) }; s.countdowns.push(c); return clone(c); }); },
  async deleteCountdown(id: string) { await wait(); commit((s) => { s.countdowns = s.countdowns.filter((c) => c.id !== id); }); },
  async getWeather() { await wait(); return { tempF: 72, low: 58, high: 76, label: 'Clear and mild', icon: 'sun' as const }; },

  /* ------------------------------------------------------------ events */
  async listEvents(q: { from: string; to: string; profileIds?: string[] }): Promise<Occurrence[]> {
    await wait(); const s = getState();
    const out = s.events.flatMap((e) => expandEvent(e, q.from, q.to, s.overrides.filter((o) => o.eventId === e.id)))
      .filter((o) => !q.profileIds || q.profileIds.includes(o.profileId));
    return out.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startsAt.localeCompare(b.startsAt));
  },
  async getEvent(id: string): Promise<EventItem> { await wait(); return clone(need(getState().events.find((e) => e.id === id), 'That event')); },
  async createEvent(i: Omit<EventItem, 'id' | 'source' | 'recurrenceUntil' | 'calendarId'> & { saveToCalendarId?: string | null; recurrenceUntil?: string | null }): Promise<EventItem> {
    await wait();
    validateEvent(i);
    return commit((s) => {
      need(s.profiles.find((p) => p.id === i.profileId), 'The person for this event');
      const { saveToCalendarId, ...rest } = i;
      const e: EventItem = { ...rest, id: uid(), title: clean(i.title), recurrenceUntil: i.recurrenceUntil ?? null, calendarId: saveToCalendarId ?? null, source: saveToCalendarId ? 'synced' : 'local' };
      s.events.push(e); return clone(e);
    });
  },
  async updateEvent(id: string, patch: Partial<Pick<EventItem, 'title' | 'description' | 'location' | 'profileId' | 'categoryId' | 'allDay' | 'startsAt' | 'endsAt' | 'rrule' | 'alertMinutes'>>, scope: 'this' | 'following' | 'all', recurrenceId?: string) {
    await wait();
    commit((s) => {
      const ev = need(s.events.find((e) => e.id === id), 'That event');
      if (patch.title !== undefined && !clean(patch.title)) throw new ApiError('missing', 'Give the event a title.');
      if (patch.startsAt && patch.endsAt && patch.endsAt < patch.startsAt) throw new ApiError('invalid_time', 'The event cannot end before it starts.');
      if (ev.source === 'synced' && !s.connections.some((c) => c.mode === 'two_way' && s.calendars.some((k) => k.id === ev.calendarId && k.connectionId === c.id))) throw new ApiError('read_only', 'This event comes from a Google calendar that is read only here. Change it in Google Calendar, or switch the connection to two-way.');
      const recurring = !!ev.rrule;
      if (!recurring || scope === 'all') {
        const next = { ...patch };
        if (recurring && patch.startsAt && patch.endsAt && recurrenceId) {
          // shift the whole series by the same days and put it on the same wall-clock time
          const occ = DateTime.fromISO(recurrenceId, { zone: ev.tz }), ns = DateTime.fromISO(patch.startsAt, { zone: ev.tz }), ne = DateTime.fromISO(patch.endsAt, { zone: ev.tz });
          const dd = Math.round(ns.startOf('day').diff(occ.startOf('day'), 'days').days);
          const st = DateTime.fromISO(ev.startsAt, { zone: ev.tz }).plus({ days: dd }).set({ hour: ns.hour, minute: ns.minute });
          next.startsAt = st.toUTC().toISO()!; next.endsAt = st.plus({ milliseconds: ne.toMillis() - ns.toMillis() }).toUTC().toISO()!;
        }
        Object.assign(ev, next); if ('rrule' in patch && !patch.rrule) { ev.rrule = null; ev.recurrenceUntil = null; }
      } else if (scope === 'this') {
        const rid = need(recurrenceId, 'The date of the repeat');
        let ov = s.overrides.find((o) => o.eventId === id && o.recurrenceId === rid);
        if (!ov) { ov = { id: uid(), eventId: id, recurrenceId: rid, cancelled: false }; s.overrides.push(ov); }
        const { title, description, location, profileId, startsAt, endsAt } = patch; Object.assign(ov, { cancelled: false }, Object.fromEntries(Object.entries({ title, description, location, profileId, startsAt, endsAt }).filter(([, v]) => v !== undefined)));
      } else {
        const rid = need(recurrenceId, 'The date of the repeat');
        const copy: EventItem = { ...clone(ev), id: uid(), ...patch, startsAt: patch.startsAt ?? rid, endsAt: patch.endsAt ?? ev.endsAt, recurrenceUntil: ev.recurrenceUntil };
        if (!patch.endsAt) copy.endsAt = DateTime.fromISO(rid).plus({ milliseconds: DateTime.fromISO(ev.endsAt).toMillis() - DateTime.fromISO(ev.startsAt).toMillis() }).toUTC().toISO()!;
        ev.recurrenceUntil = DateTime.fromISO(rid).minus({ seconds: 1 }).toUTC().toISO()!;
        s.events.push(copy);
      }
    });
  },
  async deleteEvent(id: string, scope: 'this' | 'following' | 'all' = 'all', recurrenceId?: string) {
    await wait();
    commit((s) => {
      const ev = need(s.events.find((e) => e.id === id), 'That event');
      if (ev.source === 'synced' && !s.connections.some((c) => c.mode === 'two_way' && s.calendars.some((k) => k.id === ev.calendarId && k.connectionId === c.id))) throw new ApiError('read_only', 'This event comes from a Google calendar that is read only here. Delete it in Google Calendar, or switch the connection to two-way.');
      if (!ev.rrule || scope === 'all') { s.events = s.events.filter((e) => e.id !== id); s.overrides = s.overrides.filter((o) => o.eventId !== id); return; }
      const rid = need(recurrenceId, 'The date of the repeat');
      if (scope === 'this') { let ov = s.overrides.find((o) => o.eventId === id && o.recurrenceId === rid); if (!ov) { ov = { id: uid(), eventId: id, recurrenceId: rid, cancelled: true }; s.overrides.push(ov); } ov.cancelled = true; }
      else ev.recurrenceUntil = DateTime.fromISO(rid).minus({ seconds: 1 }).toUTC().toISO()!;
    });
  },

  /* ------------------------------------------------------------ tasks, stars, rewards */
  async listTasksForDay(date: ISODate): Promise<TaskForDay[]> {
    await wait(); const s = getState();
    const order = { morning: 0, afternoon: 1, evening: 2 } as const;
    return s.tasks.filter((t) => taskOccursOn(t, date)).map((t) => ({ task: clone(t), done: s.completions.some((c) => c.taskId === t.id && c.occurrenceOn === date) }))
      .sort((a, b) => (a.task.kind === 'routine' ? order[a.task.timeOfDay!] : 3) - (b.task.kind === 'routine' ? order[b.task.timeOfDay!] : 3) || a.task.sortOrder - b.task.sortOrder || a.task.title.localeCompare(b.task.title));
  },
  async listAllTasks(): Promise<Task[]> { await wait(); return clone(getState().tasks.filter((t) => t.active)); },
  async getTask(id: string): Promise<Task & { siblings: string[] }> { await wait(); const s = getState(); const t = need(s.tasks.find((x) => x.id === id), 'That task'); return { ...clone(t), siblings: s.tasks.filter((x) => x.groupId === t.groupId).map((x) => x.profileId) }; },
  async createTasks(i: { profileIds: string[]; title: string; emoji: string; kind: 'chore' | 'routine'; timeOfDay: Task['timeOfDay']; dueTime: string | null; startsOn: ISODate; endsOn: ISODate | null; rrule: string | null; starValue: number }) {
    await wait();
    if (!clean(i.title)) throw new ApiError('missing', 'Give the task a name.');
    if (!i.profileIds.length) throw new ApiError('missing', 'Pick at least one person.');
    if (i.kind === 'routine' && !i.timeOfDay) throw new ApiError('missing', 'Choose morning, afternoon or evening for a routine.');
    if (i.starValue < 0 || i.starValue > 500) throw new ApiError('invalid', 'Stars must be between 0 and 500.');
    return commit((s) => { const groupId = uid(); const out = i.profileIds.map((profileId) => { const t: Task = { id: uid(), groupId, profileId, kind: i.kind, title: clean(i.title), emoji: i.emoji, timeOfDay: i.kind === 'routine' ? i.timeOfDay : null, dueTime: i.kind === 'chore' ? i.dueTime : null, startsOn: i.startsOn, endsOn: i.endsOn, rrule: i.rrule, starValue: i.starValue, active: true, sortOrder: 0 }; s.tasks.push(t); return t; }); return clone(out); });
  },
  async updateTask(id: string, patch: Partial<Pick<Task, 'title' | 'emoji' | 'kind' | 'timeOfDay' | 'dueTime' | 'rrule' | 'starValue' | 'endsOn'>>) {
    await wait();
    commit((s) => {
      const t = need(s.tasks.find((x) => x.id === id), 'That task');
      const next = { ...t, ...patch };
      if (next.kind === 'routine') { next.dueTime = null; if (!next.timeOfDay) throw new ApiError('missing', 'Choose morning, afternoon or evening for a routine.'); } else next.timeOfDay = null;
      if (!clean(next.title)) throw new ApiError('missing', 'Give the task a name.');
      s.tasks.filter((x) => x.groupId === t.groupId).forEach((x) => Object.assign(x, { ...next, id: x.id, profileId: x.profileId }));
    });
  },
  async deleteTask(id: string) { await wait(); commit((s) => { s.tasks = s.tasks.filter((t) => t.id !== id); s.completions = s.completions.filter((c) => c.taskId !== id); }); },
  async setCompletion(taskId: string, date: ISODate, done: boolean): Promise<{ balance: number }> {
    await wait();
    return commit((s) => {
      const t = need(s.tasks.find((x) => x.id === taskId), 'That task'); const p = need(s.profiles.find((x) => x.id === t.profileId), 'That person');
      const existing = s.completions.find((c) => c.taskId === taskId && c.occurrenceOn === date);
      if (done && !existing) {
        s.completions.push({ id: uid(), taskId, occurrenceOn: date, completedAt: nowISO() });
        if (t.starValue > 0) { p.starBalance += t.starValue; s.stars.push({ id: uid(), profileId: p.id, delta: t.starValue, reason: 'task', note: t.title, createdAt: nowISO() }); }
      }
      if (!done && existing) {
        if (t.starValue > 0) {
          if (p.starBalance < t.starValue) throw new ApiError('stars_spent', `The ${t.starValue} stars from “${t.title}” were already spent, so it cannot be unchecked.`);
          p.starBalance -= t.starValue; s.stars.push({ id: uid(), profileId: p.id, delta: -t.starValue, reason: 'reversal', note: t.title, createdAt: nowISO() });
        }
        s.completions = s.completions.filter((c) => c.id !== existing.id);
      }
      return { balance: p.starBalance };
    });
  },
  async listRewards(): Promise<Reward[]> { await wait(); return clone(getState().rewards.filter((r) => r.active)); },
  async createReward(i: { profileId: string; title: string; emoji: string; starsNeeded: number }) {
    await wait();
    if (!clean(i.title)) throw new ApiError('missing', 'Give the reward a name.');
    if (!(i.starsNeeded >= 1 && i.starsNeeded <= 500)) throw new ApiError('invalid', 'A reward costs between 1 and 500 stars.');
    return commit((s) => { const r: Reward = { id: uid(), active: true, ...i, title: clean(i.title) }; s.rewards.push(r); return clone(r); });
  },
  async updateReward(id: string, patch: Partial<Pick<Reward, 'title' | 'emoji' | 'starsNeeded'>>) {
    await wait();
    if (patch.starsNeeded !== undefined && !(patch.starsNeeded >= 1 && patch.starsNeeded <= 500)) throw new ApiError('invalid', 'A reward costs between 1 and 500 stars.');
    commit((s) => Object.assign(need(s.rewards.find((r) => r.id === id), 'That reward'), patch));
  },
  async deleteReward(id: string) { await wait(); commit((s) => { s.rewards = s.rewards.filter((r) => r.id !== id); }); },
  async redeemReward(id: string): Promise<{ balance: number }> {
    await wait();
    return commit((s) => {
      const r = need(s.rewards.find((x) => x.id === id), 'That reward'); const p = need(s.profiles.find((x) => x.id === r.profileId), 'That person');
      if (p.starBalance < r.starsNeeded) throw new ApiError('not_enough_stars', `${p.name} needs ${r.starsNeeded - p.starBalance} more stars for this.`);
      p.starBalance -= r.starsNeeded; s.stars.push({ id: uid(), profileId: p.id, delta: -r.starsNeeded, reason: 'redeem', note: r.title, createdAt: nowISO() });
      return { balance: p.starBalance };
    });
  },
  async addBonusStars(profileId: string, delta: number, note: string) {
    await wait();
    if (!Number.isInteger(delta) || delta === 0) throw new ApiError('invalid', 'Enter a whole number of stars, not zero.');
    return commit((s) => { const p = need(s.profiles.find((x) => x.id === profileId), 'That person'); if (p.starBalance + delta < 0) throw new ApiError('not_enough_stars', `${p.name} only has ${p.starBalance} stars.`); p.starBalance += delta; s.stars.push({ id: uid(), profileId, delta, reason: 'manual', note: clean(note), createdAt: nowISO() }); return { balance: p.starBalance }; });
  },
  async listStarHistory(profileId: string): Promise<StarEntry[]> { await wait(); return clone(getState().stars.filter((e) => e.profileId === profileId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50); },

  /* ------------------------------------------------------------ lists */
  async listLists(): Promise<(List & { items: ListItem[] })[]> { await wait(); const s = getState(); return clone(s.lists).sort((a, b) => a.sortOrder - b.sortOrder).map((l) => ({ ...l, items: clone(s.items.filter((i) => i.listId === l.id)).sort((a, b) => Number(a.done) - Number(b.done) || a.sortOrder - b.sortOrder) })); },
  async createList(i: { name: string; color: string; emoji: string }) { await wait(); if (!clean(i.name)) throw new ApiError('missing', 'Give the list a name.'); return commit((s) => { const l: List = { id: uid(), isGrocery: false, sortOrder: s.lists.length, ...i, name: clean(i.name) }; s.lists.push(l); return clone(l); }); },
  async updateList(id: string, patch: Partial<Pick<List, 'name' | 'color' | 'emoji'>>) { await wait(); commit((s) => Object.assign(need(s.lists.find((l) => l.id === id), 'That list'), patch)); },
  async deleteList(id: string) { await wait(); commit((s) => { const l = need(s.lists.find((x) => x.id === id), 'That list'); if (l.isGrocery) throw new ApiError('protected', 'The grocery list cannot be deleted.'); s.lists = s.lists.filter((x) => x.id !== id); s.items = s.items.filter((i) => i.listId !== id); }); },
  async addItem(listId: string, text: string) { await wait(); if (!clean(text)) throw new ApiError('missing', 'Type what to add.'); return commit((s) => { need(s.lists.find((l) => l.id === listId), 'That list'); const it: ListItem = { id: uid(), listId, text: clean(text), done: false, sortOrder: s.items.filter((i) => i.listId === listId).length, recipeId: null }; s.items.push(it); return clone(it); }); },
  async setItemDone(id: string, done: boolean) { await wait(); commit((s) => { need(s.items.find((i) => i.id === id), 'That item').done = done; }); },
  async deleteItem(id: string) { await wait(); commit((s) => { s.items = s.items.filter((i) => i.id !== id); }); },
  async clearChecked(listId: string): Promise<number> { await wait(); return commit((s) => { const n = s.items.filter((i) => i.listId === listId && i.done).length; s.items = s.items.filter((i) => !(i.listId === listId && i.done)); return n; }); },

  /* ------------------------------------------------------------ recipes and meals */
  async listRecipes(): Promise<Recipe[]> { await wait(); return clone(getState().recipes).sort((a, b) => a.title.localeCompare(b.title)); },
  async getRecipe(id: string): Promise<Recipe> { await wait(); return clone(need(getState().recipes.find((r) => r.id === id), 'That recipe')); },
  async saveRecipe(i: Omit<Recipe, 'id' | 'source' | 'sourceUrl' | 'favorite'> & { id?: string; source?: Recipe['source']; sourceUrl?: string; favorite?: boolean }): Promise<Recipe> {
    await wait(); if (!clean(i.title)) throw new ApiError('missing', 'Give the recipe a name.');
    return commit((s) => {
      const ing = i.ingredients.map((x) => ({ text: clean(x.text) })).filter((x) => x.text);
      if (i.id) { const r = need(s.recipes.find((x) => x.id === i.id), 'That recipe'); Object.assign(r, { ...i, ingredients: ing, title: clean(i.title) }); return clone(r); }
      const r: Recipe = { source: 'manual', sourceUrl: '', favorite: false, ...i, id: uid(), ingredients: ing, title: clean(i.title) }; s.recipes.push(r); return clone(r);
    });
  },
  async deleteRecipe(id: string) { await wait(); commit((s) => { s.recipes = s.recipes.filter((r) => r.id !== id); s.meals.forEach((m) => { if (m.recipeId === id) m.recipeId = null; }); }); },
  async recipeToGrocery(id: string): Promise<{ added: number; skipped: number }> {
    await wait();
    return commit((s) => {
      const r = need(s.recipes.find((x) => x.id === id), 'That recipe'); const g = need(s.lists.find((l) => l.isGrocery), 'The grocery list');
      let added = 0, skipped = 0;
      for (const ing of r.ingredients) {
        if (s.items.some((i) => i.listId === g.id && !i.done && i.text.toLowerCase() === ing.text.toLowerCase())) { skipped++; continue; }
        s.items.push({ id: uid(), listId: g.id, text: ing.text, done: false, sortOrder: s.items.length, recipeId: id }); added++;
      }
      return { added, skipped };
    });
  },
  async listMeals(from: ISODate, to: ISODate): Promise<MealEntry[]> { await wait(); return clone(getState().meals.filter((m) => m.planDate >= from && m.planDate <= to)).sort((a, b) => a.position - b.position); },
  async addMeal(i: { planDate: ISODate; slot: MealSlot; title: string; recipeId: string | null }) { await wait(); if (!clean(i.title)) throw new ApiError('missing', 'Type what is on the menu.'); return commit((s) => { const m: MealEntry = { id: uid(), position: s.meals.filter((x) => x.planDate === i.planDate && x.slot === i.slot).length, ...i, title: clean(i.title) }; s.meals.push(m); return clone(m); }); },
  async deleteMeal(id: string) { await wait(); commit((s) => { s.meals = s.meals.filter((m) => m.id !== id); }); },

  /* ------------------------------------------------------------ photos and ads */
  async listAlbums() { await wait(); const s = getState(); return clone(s.albums).map((a) => ({ ...a, photos: s.photos.filter((p) => p.albumId === a.id).map((p) => ({ id: p.id, dataUrl: p.dataUrl, caption: p.caption })) })); },
  async createAlbum(name: string) { await wait(); if (!clean(name)) throw new ApiError('missing', 'Give the album a name.'); return commit((s) => { const a = { id: uid(), name: clean(name), showOnDisplay: true }; s.albums.push(a); return clone(a); }); },
  async updateAlbum(id: string, patch: Partial<{ name: string; showOnDisplay: boolean }>) { await wait(); commit((s) => Object.assign(need(s.albums.find((a) => a.id === id), 'That album'), patch)); },
  async deleteAlbum(id: string) { await wait(); commit((s) => { s.albums = s.albums.filter((a) => a.id !== id); s.photos = s.photos.filter((p) => p.albumId !== id); }); },
  async addPhotos(albumId: string, files: { dataUrl: string; caption: string; width: number; height: number }[]) { await wait(); commit((s) => { need(s.albums.find((a) => a.id === albumId), 'That album'); files.forEach((f) => s.photos.push({ id: uid(), albumId, ...f })); }); },
  async deletePhoto(id: string) { await wait(); commit((s) => { s.photos = s.photos.filter((p) => p.id !== id); }); },
  async screensaverSlides(count: number, cursor: number): Promise<{ slides: Slide[]; next: number }> {
    await wait(); const s = getState();
    const ids = new Set(s.albums.filter((a) => a.showOnDisplay).map((a) => a.id));
    const photos = s.photos.filter((p) => ids.has(p.albumId));
    const ads = s.household.adsEnabled ? s.campaigns.filter((c) => c.childSafe && c.clickUrl.startsWith('https://')) : [];
    if (!photos.length) return { slides: [], next: cursor };
    const every = s.household.adsEveryNPhotos; const slides: Slide[] = []; let c = cursor;
    const pool: AdCampaign[] = ads.flatMap((a) => Array(a.weight).fill(a));
    for (let i = 0; i < count; i++, c++) {
      const n = Math.floor(c / (every + 1));
      if (pool.length && c % (every + 1) === every) { const a = pool[n % pool.length]; slides.push({ type: 'ad', id: `ad-${c}`, campaignId: a.id, advertiser: a.advertiser, headline: a.headline, body: a.body }); }
      else { const p = photos[(c - n) % photos.length]; slides.push({ type: 'photo', id: `${p.id}-${c}`, dataUrl: p.dataUrl, caption: p.caption }); }
    }
    return { slides, next: c };
  },
  async adHandoff(campaignId: string): Promise<{ url: string }> { await wait(); return { url: need(getState().campaigns.find((c) => c.id === campaignId), 'That ad').clickUrl }; },

  /* ------------------------------------------------------------ Google Calendar sync (the sign-in itself is added by the backend step) */
  async listConnections(): Promise<Connection[]> { await wait(); return clone(getState().connections); },
  async listSyncedCalendars() { await wait(); return clone(getState().calendars); },
  async connectGoogle(mode: 'one_way' | 'two_way', reconnectId?: string): Promise<Connection> {
    await wait();
    return commit((s) => {
      if (reconnectId) { const c = need(s.connections.find((x) => x.id === reconnectId), 'That connection'); Object.assign(c, { status: 'ok', tokenFailures: 0, lastError: null, tokenCheckedAt: nowISO(), lastSyncedAt: nowISO(), connectedAt: nowISO() }); return clone(c); }
      const id = uid(); const n = s.connections.length;
      const c: Connection = { id, provider: 'google', mode, displayName: 'Google Calendar', accountEmail: n ? `partner${n}@gmail.com` : 'family@gmail.com', status: 'ok', lastSyncedAt: nowISO(), tokenCheckedAt: nowISO(), tokenFailures: 0, lastError: null, connectedAt: nowISO() };
      s.connections.push(c);
      s.calendars.push({ id: uid(), connectionId: id, externalId: c.accountEmail, name: 'Main calendar', color: MARKER_PRESETS.sky, enabled: true, profileId: null, isDefaultTarget: false }, { id: uid(), connectionId: id, externalId: 'holidays', name: 'US holidays', color: MARKER_PRESETS.tomato, enabled: false, profileId: null, isDefaultTarget: false });
      return clone(c);
    });
  },
  async updateConnection(id: string, patch: Partial<Pick<Connection, 'mode' | 'status'>>) { await wait(); commit((s) => Object.assign(need(s.connections.find((c) => c.id === id), 'That connection'), patch)); },
  async updateSyncedCalendar(id: string, patch: Partial<{ enabled: boolean; profileId: string | null; isDefaultTarget: boolean }>) {
    await wait();
    commit((s) => {
      const c = need(s.calendars.find((x) => x.id === id), 'That calendar');
      if (patch.isDefaultTarget) { const conn = s.connections.find((k) => k.id === c.connectionId); if (conn?.mode !== 'two_way') throw new ApiError('read_only', 'New events can only be saved to Google when the connection is two-way.'); s.calendars.forEach((k) => { k.isDefaultTarget = false; }); }
      Object.assign(c, patch);
    });
  },
  async reloadConnection(id: string) { await wait(); commit((s) => { const c = need(s.connections.find((x) => x.id === id), 'That connection'); if (c.status === 'needs_reauth') throw new ApiError('needs_reauth', 'Google needs you to sign in again before this can sync.'); c.lastSyncedAt = nowISO(); if (c.status !== 'paused') c.status = 'ok'; }); },
  async checkToken(id: string): Promise<Connection> { await wait(); return commit((s) => { const c = need(s.connections.find((x) => x.id === id), 'That connection'); c.tokenCheckedAt = nowISO(); return clone(c); }); },
  async removeConnection(id: string) { await wait(); commit((s) => { const calIds = new Set(s.calendars.filter((c) => c.connectionId === id).map((c) => c.id)); s.events = s.events.filter((e) => !(e.calendarId && calIds.has(e.calendarId))); s.calendars = s.calendars.filter((c) => c.connectionId !== id); s.connections = s.connections.filter((c) => c.id !== id); }); },

  /* ------------------------------------------------------------ devices and pairing */
  async listDevices() { await wait(); return clone(getState().devices); },
  async startPairing(): Promise<{ code: string; expiresAt: string }> {
    await wait(); const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0, O, 1, I, L
    const code = Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join('');
    return commit((s) => { s.pairing = { code, expiresAt: new Date(Date.now() + 10 * 60000).toISOString(), claimedDeviceId: null }; return { code, expiresAt: s.pairing.expiresAt }; });
  },
  async pairingStatus(code: string): Promise<'pending' | 'paired' | 'expired'> {
    await wait(); const s = getState();
    if (!s.pairing || s.pairing.code !== code || s.pairing.expiresAt < nowISO()) return 'expired';
    if (s.pairing.claimedDeviceId) { setSessionDeviceId(s.pairing.claimedDeviceId); return 'paired'; }
    return 'pending';
  },
  async claimPairing(code: string, nickname: string) {
    await wait();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return commit((s) => {
      if (!s.pairing || s.pairing.code !== c || s.pairing.expiresAt < nowISO()) throw new ApiError('bad_code', 'That code is not right, or it has expired. Check the screen and try again.');
      if (!clean(nickname)) throw new ApiError('missing', 'Give this screen a name, like Kitchen.');
      if (s.devices.some((d) => d.nickname.toLowerCase() === clean(nickname).toLowerCase())) throw new ApiError('name_taken', 'Another screen already has that name.');
      const d = { id: uid(), nickname: clean(nickname), kind: 'display' as const, lastSeenAt: nowISO(), createdAt: nowISO(), config: { theme: 'auto' as const, idleMinutes: 5 } };
      s.devices.push(d); s.pairing.claimedDeviceId = d.id; return clone(d);
    });
  },
  async updateDevice(id: string, patch: Partial<{ nickname: string; config: { theme?: 'auto' | 'light' | 'dark'; idleMinutes?: number } }>) {
    await wait();
    commit((s) => { const d = need(s.devices.find((x) => x.id === id), 'That screen'); if (patch.nickname !== undefined) { if (!clean(patch.nickname)) throw new ApiError('missing', 'Give this screen a name.'); if (s.devices.some((x) => x.id !== id && x.nickname.toLowerCase() === clean(patch.nickname!).toLowerCase())) throw new ApiError('name_taken', 'Another screen already has that name.'); d.nickname = clean(patch.nickname); } if (patch.config) d.config = { ...d.config, ...patch.config }; });
  },
  async removeDevice(id: string) { await wait(); commit((s) => { s.devices = s.devices.filter((d) => d.id !== id); }); if (sessionDeviceId() === id) setSessionDeviceId(null); },
  async getDevice(id: string) { await wait(); return clone(getState().devices.find((d) => d.id === id) ?? null); },

  /* ------------------------------------------------------------ members and invitations */
  async listMembers() { await wait(); const s = getState(); return { members: clone(s.members), invitations: clone(s.invitations) }; },
  async invite(email: string, role: 'adult' | 'viewer'): Promise<Invitation> { await wait(); if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError('invalid_email', 'Enter an email address like name@example.com.'); return commit((s) => { const i: Invitation = { id: uid(), email: email.trim(), role, token: uid().replace(/-/g, '').slice(0, 20), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }; s.invitations.push(i); return clone(i); }); },
  async revokeInvitation(id: string) { await wait(); commit((s) => { s.invitations = s.invitations.filter((i) => i.id !== id); }); },
  async setMemberRole(id: string, role: Role) { await wait(); commit((s) => { const m = need(s.members.find((x) => x.id === id), 'That person'); if (m.isYou) throw new ApiError('protected', 'You cannot change your own role.'); m.role = role; }); },
  async removeMember(id: string) { await wait(); commit((s) => { const m = need(s.members.find((x) => x.id === id), 'That person'); if (m.isYou) throw new ApiError('protected', 'You cannot remove yourself here.'); s.members = s.members.filter((x) => x.id !== id); }); },

  /* ------------------------------------------------------------ PIN, account */
  async hasPin() { await wait(); return !!getState().pin; },
  async setPin(pin: string) { await wait(); if (!/^\d{4}$/.test(pin)) throw new ApiError('invalid', 'Use exactly 4 digits.'); commit((s) => { s.pin = pin; }); },
  async verifyPin(pin: string): Promise<boolean> { await wait(); const p = getState().pin; return !p || p === pin; },
  async exportAll(): Promise<string> { await wait(); const { user, ...rest } = getState(); void user; return JSON.stringify(rest, null, 2); },
  async deleteAccount() { await wait(); resetDemo(); setSessionUserId(null); setSessionDeviceId(null); },

  /* ------------------------------------------------------------ AI helper (preview results only until the backend step) */
  async aiStatus(): Promise<{ available: boolean; providerLabel: string | null }> { await wait(); const p = getState().aiProviders.find((x) => x.isDefault && x.enabled); return { available: !!p, providerLabel: p ? p.label : null }; },
  async listAiProviders() { await wait(); return clone(getState().aiProviders); },
  async saveAiProvider(i: { provider: AiProviderName; label: string; model: string; baseUrl: string; apiKey: string }) {
    await wait();
    if (i.provider !== 'openai_compatible' && !clean(i.apiKey)) throw new ApiError('missing', 'Paste the API key from your provider.');
    if (i.provider === 'openai_compatible' && !/^https?:\/\//.test(i.baseUrl)) throw new ApiError('invalid', 'Enter the server address, starting with http:// or https://.');
    if (!clean(i.model)) throw new ApiError('missing', 'Enter the model name to use.');
    return commit((s) => { const first = !s.aiProviders.length; const p = { id: uid(), provider: i.provider, label: clean(i.label) || i.provider, model: clean(i.model), baseUrl: i.baseUrl, keyLast4: i.apiKey.trim().slice(-4), isDefault: first, enabled: true }; s.aiProviders.push(p); return clone(p); });
  },
  async setDefaultAiProvider(id: string) { await wait(); commit((s) => { s.aiProviders.forEach((p) => { p.isDefault = p.id === id; }); }); },
  async removeAiProvider(id: string) { await wait(); commit((s) => { const was = s.aiProviders.find((p) => p.id === id); s.aiProviders = s.aiProviders.filter((p) => p.id !== id); if (was?.isDefault && s.aiProviders[0]) s.aiProviders[0].isDefault = true; }); },
  async verifyAiProvider(id: string): Promise<{ ok: boolean; message: string }> { await wait(); need(getState().aiProviders.find((p) => p.id === id), 'That provider'); return { ok: true, message: 'Preview mode: the real test call is added with the backend.' }; },
  async runAiJob(kind: AiKind, input: { text: string; days?: number; people?: number }): Promise<AiJob> {
    await wait(); const s = getState();
    if (!s.aiProviders.some((p) => p.isDefault && p.enabled)) throw new ApiError('no_ai', 'Add an AI key in Settings first.');
    if (!clean(input.text)) throw new ApiError('missing', 'Describe what you want first.');
    const today = todayIn(s.household.timezone);
    let proposal: AiProposalItem[] = [];
    if (kind === 'meal_plan') {
      const dinners = ['Sheet-pan chicken and vegetables', 'Veggie fried rice', 'Turkey meatballs with pasta', 'Quesadillas and salad', 'Baked potato bar', 'Homemade pizza night', 'Slow-cooker chili'];
      proposal = dinners.slice(0, Math.min(input.days ?? 5, 7)).map((t, i) => { const d = DateTime.fromISO(today).plus({ days: i }).toISODate()!; return { id: `m${i}`, label: t, detail: `Dinner on ${DateTime.fromISO(d).toFormat('ccc, LLL d')}`, payload: { kind: 'meal', planDate: d, slot: 'dinner', title: t } }; });
    } else if (kind === 'event_import') {
      const d1 = DateTime.fromISO(today).plus({ days: 6 }), d2 = DateTime.fromISO(today).plus({ days: 9 });
      proposal = [
        { id: 'e1', label: 'Class picture day', detail: `${d1.toFormat('ccc, LLL d')}, all day`, payload: { kind: 'event', title: 'Class picture day', date: d1.toISODate(), allDay: true } },
        { id: 'e2', label: 'Spring concert', detail: `${d2.toFormat('ccc, LLL d')}, 6:30 PM`, payload: { kind: 'event', title: 'Spring concert', date: d2.toISODate(), allDay: false, time: '18:30' } },
      ];
    } else {
      proposal = [{ id: 'r1', label: 'Lemon garlic chicken', detail: '5 ingredients', payload: { kind: 'recipe', title: 'Lemon garlic chicken', category: 'Dinner', ingredients: ['Chicken thighs', 'Lemons', 'Garlic', 'Olive oil', 'Parsley'], instructions: 'Marinate for 30 minutes, then roast at 425°F for 25 minutes.' } }];
    }
    return commit((st) => { const j: AiJob = { id: uid(), kind, status: 'needs_review', proposal, error: null }; st.aiJobs.push(j); return clone(j); });
  },
  async applyAiJob(id: string, selected: string[]): Promise<{ applied: number }> {
    await wait();
    return commit((s) => {
      const j = need(s.aiJobs.find((x) => x.id === id), 'That plan'); const family = s.profiles.find((p) => p.kind === 'household')!; let applied = 0;
      for (const it of j.proposal.filter((p) => selected.includes(p.id))) {
        const p = it.payload as Record<string, never> & { kind: string };
        if (p.kind === 'meal') s.meals.push({ id: uid(), planDate: p.planDate, slot: 'dinner', recipeId: null, title: p.title, position: 0 });
        if (p.kind === 'recipe') s.recipes.push({ id: uid(), title: p.title, category: p.category, description: '', ingredients: (p.ingredients as string[]).map((t) => ({ text: t })), instructions: p.instructions, source: 'ai', sourceUrl: '', favorite: false });
        if (p.kind === 'event') {
          const tz = s.household.timezone; const day = DateTime.fromISO(p.date as string, { zone: tz }).startOf('day');
          const st = p.allDay ? day : day.set({ hour: Number((p.time as string).slice(0, 2)), minute: Number((p.time as string).slice(3, 5)) });
          s.events.push({ id: uid(), calendarId: null, profileId: family.id, categoryId: null, title: p.title, description: '', location: '', allDay: !!p.allDay, startsAt: st.toUTC().toISO()!, endsAt: (p.allDay ? st.plus({ days: 1 }) : st.plus({ hours: 1 })).toUTC().toISO()!, tz, rrule: null, recurrenceUntil: null, alertMinutes: [], source: 'imported' });
        }
        applied++;
      }
      j.status = 'applied'; return { applied };
    });
  },
  async discardAiJob(id: string) { await wait(); commit((s) => { const j = s.aiJobs.find((x) => x.id === id); if (j) j.status = 'discarded'; }); },
};

function validateEvent(i: { title: string; startsAt: string; endsAt: string; profileId: string }) {
  if (!clean(i.title)) throw new ApiError('missing', 'Give the event a title.');
  if (!i.profileId) throw new ApiError('missing', 'Choose who this event is for.');
  if (i.endsAt < i.startsAt) throw new ApiError('invalid_time', 'The event cannot end before it starts.');
}
export type Data = typeof data;
export { buildRrule, dateOfInstant };
