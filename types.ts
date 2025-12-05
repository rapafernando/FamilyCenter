
export enum UserRole {
  PARENT = 'PARENT',
  KID = 'KID'
}

export interface User {
  id: string;
  name: string;
  avatar: string; // URL
  role: UserRole;
  points: number; // Current balance
  totalPointsEarned: number; // Lifetime stats
  pin?: string; // 4-digit PIN for parents
  email?: string; // For password reset
}

export interface ChoreAssignment {
  userId: string;
  points: number;
}

export type ChoreFrequency = 'daily' | 'weekly' | 'monthly';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'all_day';

export interface Chore {
  id: string;
  title: string;
  description?: string;
  assignments: ChoreAssignment[]; // Who does it and for how much
  frequency: ChoreFrequency;
  frequencyConfig: string; // JSON string or simple string identifying details (e.g. "weekdays", "monday", "15")
  timeOfDay: TimeOfDay;
  completedBy: string[]; // Array of user IDs who completed it today
  dueDate: string; // ISO Date string for the current active instance
  icon: string; // SVG String
}

// New Interface for Historical Tracking
export interface ChoreLog {
  id: string;
  choreId: string;
  choreTitle: string;
  userId: string;
  userName: string;
  points: number;
  date: string; // ISO Date YYYY-MM-DD
  timestamp: string; // Full ISO timestamp
}

export interface Reward {
  id: string;
  title: string;
  cost: number;
  image?: string;
  requestedBy?: string; // If it's a wishlist item. Null if created by parent.
  approved: boolean;
  isShared?: boolean; // If true, cost is split among all kids
  redeemed?: boolean; // For tracking history in parent portal
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO Date string
  end: string;
  type: 'family' | 'birthday' | 'sports' | 'school';
  color: string;
}

export interface CalendarSource {
  id: string;
  googleCalendarId: string;
  name: string;
  color: string;
  type: 'personal' | 'family';
  ownerId: string; // User ID of who linked it
  ownerName: string;
  accessToken: string; // Storing for prototype (Production should use refresh tokens/backend)
}

export interface PhotoConfig {
  albumId?: string;
  albumName?: string;
  accessToken?: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface Meal {
  id: string;
  date: string; // ISO Date string YYYY-MM-DD
  type: MealType;
  title: string;
}

export interface Photo {
  id: string;
  url: string;
  date: string;
  location?: string;
}

export interface AppState {
  familyName: string;
  users: User[];
  chores: Chore[];
  choreHistory: ChoreLog[]; // New history array
  rewards: Reward[];
  events: CalendarEvent[];
  calendarSources: CalendarSource[];
  photoConfig: PhotoConfig;
  meals: Meal[];
  photos: Photo[];
  currentUser: User | null;
}
