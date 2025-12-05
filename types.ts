
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

export interface Reward {
  id: string;
  title: string;
  cost: number;
  image?: string;
  requestedBy?: string; // If it's a wishlist item
  approved: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO Date string
  end: string;
  type: 'family' | 'birthday' | 'sports' | 'school';
  color: string;
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
  rewards: Reward[];
  events: CalendarEvent[];
  meals: Meal[];
  photos: Photo[];
  currentUser: User | null;
}
