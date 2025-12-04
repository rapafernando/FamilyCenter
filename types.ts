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

export interface Chore {
  id: string;
  title: string;
  description?: string;
  points: number;
  assignedTo: string; // User ID
  recurrence: 'daily' | 'weekly' | 'once';
  completed: boolean;
  dueDate: string; // ISO Date string
  icon?: string;
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