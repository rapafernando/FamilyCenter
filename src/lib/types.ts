// Domain types. Field names mirror replica/schema.sql in camelCase so the real data layer is a straight swap.
export type ID = string;
export type ISODate = string; // 2026-10-28
export type ISOTime = string; // 2026-10-28T14:30:00.000Z

export type Role = 'owner' | 'adult' | 'viewer';
export type Household = {
  id: ID; name: string; timezone: string; weekStartsOn: number; defaultView: 'day' | 'week' | 'month';
  adsEnabled: boolean; adsEveryNPhotos: number; location: string;
};
export type Profile = {
  id: ID; name: string; color: string; birthday: ISODate | null; kind: 'person' | 'household' | 'other'; starBalance: number;
};
export type Category = { id: ID; name: string; color: string };
export type EventItem = {
  id: ID; calendarId: ID | null; profileId: ID; categoryId: ID | null; title: string; description: string; location: string;
  allDay: boolean; startsAt: ISOTime; endsAt: ISOTime; tz: string; rrule: string | null; recurrenceUntil: ISOTime | null;
  alertMinutes: number[]; source: 'local' | 'synced' | 'imported';
};
export type EventOverride = {
  id: ID; eventId: ID; recurrenceId: ISOTime; cancelled: boolean; title?: string; location?: string; description?: string;
  startsAt?: ISOTime; endsAt?: ISOTime; profileId?: ID;
};
/** One thing on the calendar after repeats are expanded and overrides applied. */
export type Occurrence = {
  key: string; eventId: ID; recurrenceId: ISOTime; title: string; description: string; location: string;
  profileId: ID; categoryId: ID | null; allDay: boolean; startsAt: ISOTime; endsAt: ISOTime; tz: string;
  repeats: boolean; source: EventItem['source']; calendarId: ID | null; alertMinutes: number[];
};
export type Countdown = { id: ID; title: string; targetDate: ISODate; emoji: string; showOnDisplay: boolean };

export type Task = {
  id: ID; groupId: ID; profileId: ID; kind: 'chore' | 'routine'; title: string; emoji: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | null; dueTime: string | null; startsOn: ISODate; endsOn: ISODate | null;
  rrule: string | null; starValue: number; active: boolean; sortOrder: number;
};
export type TaskCompletion = { id: ID; taskId: ID; occurrenceOn: ISODate; completedAt: ISOTime };
export type TaskForDay = { task: Task; done: boolean };
export type Reward = { id: ID; profileId: ID; title: string; emoji: string; starsNeeded: number; active: boolean };
export type StarEntry = { id: ID; profileId: ID; delta: number; reason: 'task' | 'manual' | 'redeem' | 'reversal'; note: string; createdAt: ISOTime };

export type List = { id: ID; name: string; color: string; emoji: string; isGrocery: boolean; sortOrder: number };
export type ListItem = { id: ID; listId: ID; text: string; done: boolean; sortOrder: number; recipeId: ID | null };
export type Ingredient = { text: string };
export type Recipe = {
  id: ID; title: string; category: string; description: string; ingredients: Ingredient[]; instructions: string;
  source: 'manual' | 'import' | 'ai'; sourceUrl: string; favorite: boolean;
};
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MealEntry = { id: ID; planDate: ISODate; slot: MealSlot; recipeId: ID | null; title: string; position: number };

export type Album = { id: ID; name: string; showOnDisplay: boolean };
export type Photo = { id: ID; albumId: ID; dataUrl: string; caption: string; width: number; height: number };
export type Slide =
  | { type: 'photo'; id: ID; dataUrl: string; caption: string }
  | { type: 'ad'; id: ID; campaignId: ID; advertiser: string; headline: string; body: string };
export type AdCampaign = { id: ID; advertiser: string; kind: 'house' | 'sponsor'; headline: string; body: string; clickUrl: string; childSafe: boolean; weight: number };

export type ConnStatus = 'ok' | 'syncing' | 'stale' | 'needs_reauth' | 'error' | 'paused';
export type Connection = {
  id: ID; provider: 'google'; mode: 'one_way' | 'two_way'; displayName: string; accountEmail: string; status: ConnStatus;
  lastSyncedAt: ISOTime | null; tokenCheckedAt: ISOTime | null; tokenFailures: number; lastError: string | null; connectedAt: ISOTime;
};
export type SyncedCalendar = { id: ID; connectionId: ID; externalId: string; name: string; color: string; enabled: boolean; canWrite: boolean; profileId: ID | null; isDefaultTarget: boolean };

export type Device = { id: ID; nickname: string; kind: 'display' | 'browser'; lastSeenAt: ISOTime | null; createdAt: ISOTime; config: { theme?: 'auto' | 'light' | 'dark'; idleMinutes?: number } };
export type Member = { id: ID; name: string; email: string; role: Role; isYou: boolean };
export type Invitation = { id: ID; email: string; role: 'adult' | 'viewer'; token: string; expiresAt: ISOTime };

export type AiProviderName = 'openai' | 'anthropic' | 'google' | 'openai_compatible';
export type AiProvider = { id: ID; provider: AiProviderName; label: string; model: string; baseUrl: string; keyLast4: string; isDefault: boolean; enabled: boolean };
export type AiKind = 'meal_plan' | 'event_import' | 'recipe_import';
export type AiProposalItem = { id: string; label: string; detail: string; payload: Record<string, unknown> };
export type AiJob = { id: ID; kind: AiKind; status: 'queued' | 'running' | 'needs_review' | 'applied' | 'failed' | 'discarded'; proposal: AiProposalItem[]; error: string | null };

export type Session = { user: { id: ID; name: string; email: string } | null; deviceId: ID | null; role: Role | null; /** Runs this server: may change server-wide settings (Google sign-in, updates). */ admin?: boolean };

export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
