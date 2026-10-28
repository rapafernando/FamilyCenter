import { DateTime } from 'luxon';
import { uid } from '../time';
import { MARKER_PRESETS as M } from '../markers.generated';
import type {
  AdCampaign, AiJob, AiProvider, Album, Category, Connection, Countdown, Device, EventItem, EventOverride, Household, Invitation,
  List, ListItem, MealEntry, Member, Photo, Profile, Recipe, Reward, StarEntry, SyncedCalendar, Task, TaskCompletion,
} from '../types';

export type State = {
  v: 1;
  user: { id: string; name: string; email: string; password: string } | null;
  household: Household;
  profiles: Profile[]; categories: Category[]; events: EventItem[]; overrides: EventOverride[]; countdowns: Countdown[];
  tasks: Task[]; completions: TaskCompletion[]; rewards: Reward[]; stars: StarEntry[];
  lists: List[]; items: ListItem[]; recipes: Recipe[]; meals: MealEntry[];
  albums: Album[]; photos: Photo[]; campaigns: AdCampaign[];
  connections: Connection[]; calendars: SyncedCalendar[]; devices: Device[];
  members: Member[]; invitations: Invitation[];
  aiProviders: AiProvider[]; aiJobs: AiJob[];
  pin: string | null;
  pairing: { code: string; expiresAt: string; claimedDeviceId: string | null } | null;
};

const TZ = 'America/New_York';

function art(label: string, a: string, b: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><circle cx="900" cy="230" r="110" fill="#ffffff" fill-opacity=".55"/><path d="M0 800V560q220-140 420-40t420-60q200-60 360 40V800z" fill="#ffffff" fill-opacity=".35"/><text x="60" y="740" font-family="sans-serif" font-size="56" font-weight="700" fill="#101820" fill-opacity=".8">${label}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/** A demo household built around today so the screens are never empty. Names are made up. */
export function seed(): State {
  const now = DateTime.now().setZone(TZ);
  const today = now.startOf('day');
  const iso = (dt: DateTime) => dt.toUTC().toISO()!;
  const at = (dayOffset: number, h: number, m = 0) => today.plus({ days: dayOffset }).set({ hour: h, minute: m });
  const day = (n: number) => today.plus({ days: n }).toISODate()!;
  const hh = uid();
  const P = { maya: uid(), leo: uid(), sam: uid(), jo: uid(), family: uid() };
  const profiles: Profile[] = [
    { id: P.family, name: 'Family', color: M.graphite, birthday: null, kind: 'household', starBalance: 0 },
    { id: P.sam, name: 'Sam', color: M.grass, birthday: '1985-04-12', kind: 'person', starBalance: 0 },
    { id: P.jo, name: 'Jo', color: M.tangerine, birthday: '1987-09-30', kind: 'person', starBalance: 0 },
    { id: P.maya, name: 'Maya', color: M.grape, birthday: '2017-02-03', kind: 'person', starBalance: 14 },
    { id: P.leo, name: 'Leo', color: M.sky, birthday: '2020-06-18', kind: 'person', starBalance: 6 },
  ];
  const cat = { school: uid(), sports: uid(), health: uid(), home: uid() };
  const categories: Category[] = [
    { id: cat.school, name: 'School', color: '#2F8DF0' }, { id: cat.sports, name: 'Sports', color: '#3FA34D' },
    { id: cat.health, name: 'Health', color: '#E5483B' }, { id: cat.home, name: 'Home', color: '#E8B500' },
  ];
  const ev = (o: Partial<EventItem> & Pick<EventItem, 'title' | 'profileId' | 'startsAt' | 'endsAt'>): EventItem => ({
    id: uid(), calendarId: null, categoryId: null, description: '', location: '', allDay: false, tz: TZ, rrule: null,
    recurrenceUntil: null, alertMinutes: [], source: 'local', ...o,
  });
  const calId = uid(), connId = uid();
  const events: EventItem[] = [
    ev({ title: 'Soccer practice', profileId: P.leo, categoryId: cat.sports, startsAt: iso(at(-7, 15, 30)), endsAt: iso(at(-7, 17)), rrule: 'FREQ=WEEKLY;BYDAY=MO,WE', location: 'Riverside field', alertMinutes: [30] }),
    ev({ title: 'Piano lesson', profileId: P.maya, categoryId: cat.school, startsAt: iso(at(0, 16)), endsAt: iso(at(0, 16, 45)), rrule: 'FREQ=WEEKLY;BYDAY=TH', alertMinutes: [15] }),
    ev({ title: 'Dentist', profileId: P.jo, categoryId: cat.health, startsAt: iso(at(1, 9, 15)), endsAt: iso(at(1, 10)), source: 'synced', calendarId: calId, location: 'Main St Dental' }),
    ev({ title: 'Team standup', profileId: P.sam, startsAt: iso(at(-14, 9, 30)), endsAt: iso(at(-14, 9, 45)), rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', source: 'synced', calendarId: calId }),
    ev({ title: 'Parent-teacher night', profileId: P.family, categoryId: cat.school, startsAt: iso(at(3, 18)), endsAt: iso(at(3, 19, 30)), location: 'Maple Elementary' }),
    ev({ title: 'Grandma visits', profileId: P.family, allDay: true, startsAt: iso(today.plus({ days: 4 })), endsAt: iso(today.plus({ days: 6 })) }),
    ev({ title: 'Library books due', profileId: P.maya, categoryId: cat.home, allDay: true, startsAt: iso(today.plus({ days: 2 })), endsAt: iso(today.plus({ days: 3 })) }),
    ev({ title: 'Swim class', profileId: P.leo, categoryId: cat.sports, startsAt: iso(at(5, 10)), endsAt: iso(at(5, 11)), rrule: 'FREQ=WEEKLY;BYDAY=SA' }),
  ];
  const task = (o: Partial<Task> & Pick<Task, 'title' | 'profileId'>): Task => ({
    id: uid(), groupId: uid(), kind: 'chore', emoji: '', timeOfDay: null, dueTime: null, startsOn: day(-14), endsOn: null,
    rrule: 'FREQ=DAILY', starValue: 1, active: true, sortOrder: 0, ...o,
  });
  const tasks: Task[] = [
    task({ title: 'Feed the cat', emoji: '🐱', profileId: P.maya, starValue: 2 }),
    task({ title: 'Pack soccer bag', emoji: '⚽', profileId: P.leo, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE', starValue: 1 }),
    task({ title: 'Brush teeth', emoji: '🪥', profileId: P.maya, kind: 'routine', timeOfDay: 'morning', starValue: 1 }),
    task({ title: 'Brush teeth', emoji: '🪥', profileId: P.leo, kind: 'routine', timeOfDay: 'morning', starValue: 1 }),
    task({ title: 'Get dressed', emoji: '👕', profileId: P.leo, kind: 'routine', timeOfDay: 'morning', starValue: 1 }),
    task({ title: 'Read for 15 minutes', emoji: '📖', profileId: P.maya, kind: 'routine', timeOfDay: 'evening', starValue: 2 }),
    task({ title: 'Set the table', emoji: '🍽️', profileId: P.leo, starValue: 2 }),
    task({ title: 'Take out the recycling', emoji: '♻️', profileId: P.sam, rrule: 'FREQ=WEEKLY;BYDAY=TU,FR', starValue: 0 }),
    task({ title: 'Water the plants', emoji: '🪴', profileId: P.jo, rrule: 'FREQ=WEEKLY;BYDAY=SU', starValue: 0 }),
  ];
  const completions: TaskCompletion[] = [
    { id: uid(), taskId: tasks[2].id, occurrenceOn: day(0), completedAt: iso(now) },
    { id: uid(), taskId: tasks[3].id, occurrenceOn: day(0), completedAt: iso(now) },
  ];
  const rewards: Reward[] = [
    { id: uid(), profileId: P.maya, title: 'Pick the movie', emoji: '🎬', starsNeeded: 10, active: true },
    { id: uid(), profileId: P.maya, title: 'Ice cream trip', emoji: '🍦', starsNeeded: 25, active: true },
    { id: uid(), profileId: P.leo, title: 'Extra bedtime story', emoji: '📚', starsNeeded: 5, active: true },
    { id: uid(), profileId: P.leo, title: 'Pick a toy', emoji: '🧸', starsNeeded: 30, active: true },
  ];
  const stars: StarEntry[] = [
    { id: uid(), profileId: P.maya, delta: 14, reason: 'manual', note: 'Starting balance', createdAt: iso(now.minus({ days: 3 })) },
    { id: uid(), profileId: P.leo, delta: 6, reason: 'manual', note: 'Starting balance', createdAt: iso(now.minus({ days: 3 })) },
  ];
  const grocery = uid(), packing = uid();
  const lists: List[] = [
    { id: grocery, name: 'Groceries', color: M.grass, emoji: '🛒', isGrocery: true, sortOrder: 0 },
    { id: packing, name: 'Beach weekend', color: M.teal, emoji: '🏖️', isGrocery: false, sortOrder: 1 },
  ];
  const it = (listId: string, text: string, done = false, i = 0): ListItem => ({ id: uid(), listId, text, done, sortOrder: i, recipeId: null });
  const items: ListItem[] = [
    it(grocery, 'Milk', true, 0), it(grocery, 'Bananas', false, 1), it(grocery, 'Pasta sauce', false, 2), it(grocery, 'Tortillas', false, 3),
    it(packing, 'Sunscreen', false, 0), it(packing, 'Towels', false, 1), it(packing, 'Sand toys', false, 2),
  ];
  const r1 = uid(), r2 = uid();
  const recipes: Recipe[] = [
    { id: r1, title: 'Weeknight tacos', category: 'Dinner', description: 'Fast and everyone builds their own.', ingredients: [{ text: 'Tortillas' }, { text: 'Ground turkey' }, { text: 'Shredded cheese' }, { text: 'Salsa' }], instructions: 'Brown the turkey with taco seasoning. Warm the tortillas. Set everything out and let people build their own.', source: 'manual', sourceUrl: '', favorite: true },
    { id: r2, title: 'Banana oat pancakes', category: 'Breakfast', description: '', ingredients: [{ text: 'Bananas' }, { text: 'Rolled oats' }, { text: 'Eggs' }], instructions: 'Blend, rest for 5 minutes, cook on a medium pan.', source: 'manual', sourceUrl: '', favorite: false },
  ];
  const meals: MealEntry[] = [
    { id: uid(), planDate: day(0), slot: 'dinner', recipeId: r1, title: 'Weeknight tacos', position: 0 },
    { id: uid(), planDate: day(1), slot: 'breakfast', recipeId: r2, title: 'Banana oat pancakes', position: 0 },
    { id: uid(), planDate: day(1), slot: 'dinner', recipeId: null, title: 'Pasta night', position: 0 },
  ];
  const al = uid();
  const albums: Album[] = [{ id: al, name: 'Sample photos', showOnDisplay: true }];
  const photos: Photo[] = [
    ['Morning light', '#FFD9A0', '#F28F6B'], ['Pine trees', '#BFE3C0', '#4F9D7A'], ['Evening sky', '#C9B8F0', '#5E6AD2'], ['Sea breeze', '#B7E6EC', '#3C8DC9'],
    ['Autumn walk', '#F6D58E', '#B8642B'], ['Snow day', '#E8F1FA', '#9DB7D5'],
  ].map(([label, a, b]) => ({ id: uid(), albumId: al, dataUrl: art(label, a, b), caption: label, width: 1200, height: 800 }));
  const campaigns: AdCampaign[] = [
    { id: uid(), advertiser: 'This app', kind: 'house', headline: 'Free for families, paid for by small ads', body: 'Ads only show between photos. They never show on the calendar or chores.', clickUrl: 'https://example.com/about-ads', childSafe: true, weight: 1 },
    { id: uid(), advertiser: 'Green Valley Dairy (sample)', kind: 'sponsor', headline: 'Fresh milk delivered Tuesdays', body: 'A made-up sponsor, to show how an ad looks.', clickUrl: 'https://example.com/dairy', childSafe: true, weight: 2 },
  ];
  const household: Household = { id: hh, name: 'Our home', timezone: TZ, weekStartsOn: 0, defaultView: 'week', adsEnabled: true, adsEveryNPhotos: 4, location: 'Vero Beach, FL' };
  const you = uid();
  return {
    v: 1, user: null, household, profiles, categories, events, overrides: [],
    countdowns: [{ id: uid(), title: 'Beach weekend', targetDate: day(9), emoji: '🏖️', showOnDisplay: true }, { id: uid(), title: 'Maya’s birthday', targetDate: day(98), emoji: '🎂', showOnDisplay: true }],
    tasks, completions, rewards, stars, lists, items, recipes, meals, albums, photos, campaigns,
    connections: [{ id: connId, provider: 'google', mode: 'one_way', displayName: 'Google Calendar', accountEmail: 'family@gmail.com', status: 'ok', lastSyncedAt: iso(now.minus({ minutes: 2 })), tokenCheckedAt: iso(now.set({ hour: 3, minute: 15 })), tokenFailures: 0, lastError: null, connectedAt: iso(now.minus({ days: 20 })) }],
    calendars: [
      { id: calId, connectionId: connId, externalId: 'family@gmail.com', name: 'Family', color: M.grape, enabled: true, profileId: null, isDefaultTarget: false },
      { id: uid(), connectionId: connId, externalId: 'work@group.calendar.google.com', name: 'Sam’s work', color: M.grass, enabled: true, profileId: P.sam, isDefaultTarget: false },
    ],
    devices: [],
    members: [{ id: you, name: 'Sam', email: 'sam@example.com', role: 'owner', isYou: true }, { id: uid(), name: 'Jo', email: 'jo@example.com', role: 'adult', isYou: false }],
    invitations: [], aiProviders: [], aiJobs: [], pin: null, pairing: null,
  };
}

/** A brand new, empty household for the sign-up flow. */
export function emptyState(o: { name: string; email: string; password: string; householdName: string; timezone: string }): State {
  const base = seed();
  const family = base.profiles.find((p) => p.kind === 'household')!;
  const userId = uid();
  return {
    ...base,
    user: { id: userId, name: o.name, email: o.email, password: o.password },
    household: { ...base.household, id: uid(), name: o.householdName, timezone: o.timezone, adsEnabled: false, location: '' },
    profiles: [{ ...family }, { id: uid(), name: o.name, color: M.sky, birthday: null, kind: 'person', starBalance: 0 }],
    categories: [], events: [], overrides: [], countdowns: [], tasks: [], completions: [], rewards: [], stars: [],
    lists: [{ id: uid(), name: 'Groceries', color: M.grass, emoji: '🛒', isGrocery: true, sortOrder: 0 }],
    items: [], recipes: [], meals: [], albums: [], photos: [], connections: [], calendars: [], devices: [],
    members: [{ id: userId, name: o.name, email: o.email, role: 'owner', isYou: true }], invitations: [], aiProviders: [], aiJobs: [],
    pin: null, pairing: null,
  };
}
