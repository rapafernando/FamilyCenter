import { User, Chore, Reward, CalendarEvent, UserRole, Meal, Photo } from './types';

export const INITIAL_USERS: User[] = [
  {
    id: 'p1',
    name: 'Mom',
    avatar: 'https://picsum.photos/seed/mom/200/200',
    role: UserRole.PARENT,
    points: 0,
    totalPointsEarned: 0
  },
  {
    id: 'p2',
    name: 'Dad',
    avatar: 'https://picsum.photos/seed/dad/200/200',
    role: UserRole.PARENT,
    points: 0,
    totalPointsEarned: 0
  },
  {
    id: 'k1',
    name: 'Leo',
    avatar: 'https://picsum.photos/seed/leo/200/200',
    role: UserRole.KID,
    points: 350,
    totalPointsEarned: 1200
  },
  {
    id: 'k2',
    name: 'Mia',
    avatar: 'https://picsum.photos/seed/mia/200/200',
    role: UserRole.KID,
    points: 120,
    totalPointsEarned: 800
  }
];

export const INITIAL_CHORES: Chore[] = [
  {
    id: 'c1',
    title: 'Make Bed',
    points: 50,
    assignedTo: 'k1',
    recurrence: 'daily',
    completed: false,
    dueDate: new Date().toISOString(),
    icon: 'bed'
  },
  {
    id: 'c2',
    title: 'Feed Dog',
    points: 100,
    assignedTo: 'k1',
    recurrence: 'daily',
    completed: true,
    dueDate: new Date().toISOString(),
    icon: 'dog'
  },
  {
    id: 'c3',
    title: 'Homework',
    points: 200,
    assignedTo: 'k2',
    recurrence: 'daily',
    completed: false,
    dueDate: new Date().toISOString(),
    icon: 'book'
  },
  {
    id: 'c4',
    title: 'Clear Table',
    points: 75,
    assignedTo: 'k2',
    recurrence: 'daily',
    completed: false,
    dueDate: new Date().toISOString(),
    icon: 'trash'
  }
];

export const INITIAL_REWARDS: Reward[] = [
  {
    id: 'r1',
    title: 'Extra Hour of iPad',
    cost: 500,
    approved: true,
    image: 'https://picsum.photos/seed/ipad/200/200'
  },
  {
    id: 'r2',
    title: 'Pizza Night',
    cost: 1500,
    approved: true,
    image: 'https://picsum.photos/seed/pizza/200/200'
  },
  {
    id: 'r3',
    title: 'New Lego Set',
    cost: 5000,
    requestedBy: 'k1',
    approved: false, // Wishlist item
    image: 'https://picsum.photos/seed/lego/200/200'
  }
];

export const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: 'e1',
    title: 'Soccer Practice',
    start: new Date().toISOString(), // Today
    end: new Date().toISOString(),
    type: 'sports',
    color: 'bg-green-100 text-green-800 border-green-200'
  },
  {
    id: 'e2',
    title: 'Piano Lesson',
    start: new Date(Date.now() + 3 * 3600000).toISOString(), // Today later
    end: new Date(Date.now() + 4 * 3600000).toISOString(),
    type: 'school',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-200'
  },
  {
    id: 'e3',
    title: 'Grocery Run',
    start: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    end: new Date(Date.now() + 86400000).toISOString(),
    type: 'family',
    color: 'bg-teal-100 text-teal-800 border-teal-200'
  },
  {
    id: 'e4',
    title: 'Coffee with Diane',
    start: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    end: new Date(Date.now() + 86400000).toISOString(),
    type: 'family',
    color: 'bg-rose-100 text-rose-800 border-rose-200'
  },
  {
    id: 'e5',
    title: 'Grandma Birthday',
    start: new Date(Date.now() + 86400000 * 2).toISOString(), // Day after
    end: new Date(Date.now() + 86400000 * 2).toISOString(),
    type: 'birthday',
    color: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  {
    id: 'e6',
    title: 'History Test',
    start: new Date(Date.now() + 86400000 * 2).toISOString(),
    end: new Date(Date.now() + 86400000 * 2).toISOString(),
    type: 'school',
    color: 'bg-red-100 text-red-800 border-red-200'
  },
  {
    id: 'e7',
    title: 'Movie Night',
    start: new Date(Date.now() + 86400000 * 3).toISOString(),
    end: new Date(Date.now() + 86400000 * 3).toISOString(),
    type: 'family',
    color: 'bg-amber-100 text-amber-800 border-amber-200'
  }
];

// Generate initial meals for next 7 days
const today = new Date();
export const INITIAL_MEALS: Meal[] = [];
for (let i = 0; i < 7; i++) {
  const d = new Date(today);
  d.setDate(today.getDate() + i);
  const dateStr = d.toISOString().split('T')[0];
  
  INITIAL_MEALS.push({
    id: `m-b-${i}`,
    date: dateStr,
    type: 'breakfast',
    title: i % 2 === 0 ? 'Oatmeal & Fruit' : 'Pancakes'
  });
  INITIAL_MEALS.push({
    id: `m-l-${i}`,
    date: dateStr,
    type: 'lunch',
    title: i % 2 === 0 ? 'Turkey Sandwiches' : 'Chicken Salad'
  });
  INITIAL_MEALS.push({
    id: `m-d-${i}`,
    date: dateStr,
    type: 'dinner',
    title: i === 5 ? 'Pizza Night!' : i % 2 === 0 ? 'Spaghetti Bolognese' : 'Grilled Salmon'
  });
}

export const INITIAL_PHOTOS: Photo[] = [
  { id: 'ph1', url: 'https://picsum.photos/seed/family1/1200/800', date: '2023-06-15', location: 'Beach Trip' },
  { id: 'ph2', url: 'https://picsum.photos/seed/family2/1200/800', date: '2023-07-04', location: 'Backyard BBQ' },
  { id: 'ph3', url: 'https://picsum.photos/seed/family3/1200/800', date: '2023-08-20', location: 'Hiking Trail' },
  { id: 'ph4', url: 'https://picsum.photos/seed/family4/1200/800', date: '2023-09-10', location: 'First Day of School' },
  { id: 'ph5', url: 'https://picsum.photos/seed/family5/1200/800', date: '2023-10-31', location: 'Halloween' },
  { id: 'ph6', url: 'https://picsum.photos/seed/family6/1200/800', date: '2023-11-24', location: 'Thanksgiving' },
  { id: 'ph7', url: 'https://picsum.photos/seed/family7/1200/800', date: '2023-12-25', location: 'Christmas Morning' },
];