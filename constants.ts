import { User, Chore, Reward, CalendarEvent, UserRole, Meal, Photo } from './types';

// Default initial state for a fresh app
// We need at least one parent to allow login and configuration
export const INITIAL_USERS: User[] = [
  {
    id: 'p1',
    name: 'Parent',
    avatar: 'https://ui-avatars.com/api/?name=Parent&background=0D8ABC&color=fff',
    role: UserRole.PARENT,
    points: 0,
    totalPointsEarned: 0
  }
];

export const INITIAL_CHORES: Chore[] = [];

export const INITIAL_REWARDS: Reward[] = [
  {
    id: 'r1',
    title: 'Screen Time (30 mins)',
    cost: 50,
    approved: true,
    image: 'https://images.unsplash.com/photo-1517430816045-df4b7de8dbd8?w=200&h=200&fit=crop'
  }
];

export const INITIAL_EVENTS: CalendarEvent[] = [];

// Generate empty structure for meals to prevent errors, but empty titles
const today = new Date();
export const INITIAL_MEALS: Meal[] = [];
for (let i = 0; i < 7; i++) {
  const d = new Date(today);
  d.setDate(today.getDate() + i);
  const dateStr = d.toISOString().split('T')[0];
  
  INITIAL_MEALS.push({ id: `m-b-${i}`, date: dateStr, type: 'breakfast', title: '' });
  INITIAL_MEALS.push({ id: `m-l-${i}`, date: dateStr, type: 'lunch', title: '' });
  INITIAL_MEALS.push({ id: `m-d-${i}`, date: dateStr, type: 'dinner', title: '' });
}

export const INITIAL_PHOTOS: Photo[] = [];