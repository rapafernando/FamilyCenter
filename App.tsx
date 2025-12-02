import React, { useState, useEffect } from 'react';
import { User, Chore, Reward, CalendarEvent, UserRole, AppState, Meal, MealType } from './types';
import { INITIAL_USERS, INITIAL_CHORES, INITIAL_REWARDS, INITIAL_EVENTS, INITIAL_MEALS, INITIAL_PHOTOS } from './constants';
import AuthScreen from './components/AuthScreen';
import ParentPortal from './components/ParentPortal';
import KidDashboard from './components/KidDashboard';
import FamilyWallDashboard from './components/FamilyWallDashboard';
import { LogOut } from 'lucide-react';
import { fetchGoogleCalendarEvents } from './services/googleService';

type ViewState = 'WALL' | 'AUTH' | 'USER_SESSION';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('WALL');
  const [state, setState] = useState<AppState>({
    users: INITIAL_USERS,
    chores: INITIAL_CHORES,
    rewards: INITIAL_REWARDS,
    events: INITIAL_EVENTS,
    meals: INITIAL_MEALS,
    photos: INITIAL_PHOTOS,
    currentUser: null
  });

  const handleLogin = (user: User) => {
    setState(prev => ({ ...prev, currentUser: user }));
    setView('USER_SESSION');
  };

  const handleLogout = () => {
    setState(prev => ({ ...prev, currentUser: null }));
    setView('WALL');
  };

  // Called after Google Auth successful, fetches calendar
  const handleGoogleSync = async (googleProfile: any) => {
    try {
      const googleEvents = await fetchGoogleCalendarEvents();
      
      // Merge local fixed events with synced events
      setState(prev => ({
        ...prev,
        events: [...INITIAL_EVENTS, ...googleEvents]
      }));

      // Optionally update a parent user with Google Avatar/Name
      setState(prev => ({
        ...prev,
        users: prev.users.map(u => 
          u.id === 'p1' ? { ...u, name: googleProfile.given_name || u.name, avatar: googleProfile.picture || u.avatar } : u
        )
      }));

    } catch (error) {
      console.error("Failed to sync calendar", error);
    }
  };

  const handleToggleChore = (choreId: string) => {
    setState(prev => {
      const chore = prev.chores.find(c => c.id === choreId);
      if (!chore) return prev;

      const isCompleting = !chore.completed;
      
      // Update Users Points
      const updatedUsers = prev.users.map(u => {
        if (u.id === chore.assignedTo) {
          return {
            ...u,
            points: isCompleting ? u.points + chore.points : u.points - chore.points,
            totalPointsEarned: isCompleting ? u.totalPointsEarned + chore.points : u.totalPointsEarned - chore.points
          };
        }
        return u;
      });

      // Update Chore Status
      const updatedChores = prev.chores.map(c => 
        c.id === choreId ? { ...c, completed: isCompleting } : c
      );

      return {
        ...prev,
        users: updatedUsers,
        chores: updatedChores
      };
    });
  };

  const handleAddChore = (newChore: Omit<Chore, 'id'>) => {
     setState(prev => ({
        ...prev,
        chores: [...prev.chores, { ...newChore, id: `c${Date.now()}` }]
     }));
  };

  const handleRequestReward = (title: string, cost: number) => {
     if(!state.currentUser) return;
     
     const newReward: Reward = {
       id: `r${Date.now()}`,
       title,
       cost,
       requestedBy: state.currentUser.id,
       approved: false,
       image: `https://picsum.photos/seed/${Date.now()}/200/200`
     };

     setState(prev => ({
       ...prev,
       rewards: [...prev.rewards, newReward]
     }));
  };

  const handleApproveReward = (id: string) => {
    setState(prev => ({
      ...prev,
      rewards: prev.rewards.map(r => r.id === id ? { ...r, approved: true } : r)
    }));
  };

  const handleUpdateMeal = (date: string, type: MealType, title: string) => {
    setState(prev => {
      const existingMealIndex = prev.meals.findIndex(m => m.date === date && m.type === type);
      const newMeals = [...prev.meals];
      
      if (existingMealIndex >= 0) {
        newMeals[existingMealIndex] = { ...newMeals[existingMealIndex], title };
      } else {
        newMeals.push({
          id: `m-${Date.now()}`,
          date,
          type,
          title
        });
      }
      return { ...prev, meals: newMeals };
    });
  };

  // 1. Kiosk/Wall Mode (Default)
  if (view === 'WALL') {
    return (
      <FamilyWallDashboard 
        users={state.users}
        events={state.events}
        chores={state.chores}
        meals={state.meals}
        photos={state.photos}
        onSettingsClick={() => setView('AUTH')}
        onToggleChore={handleToggleChore}
        onUpdateMeal={handleUpdateMeal}
      />
    );
  }

  // 2. Auth Screen (Triggered by Settings)
  if (view === 'AUTH') {
    return (
      <AuthScreen 
        users={state.users} 
        onLogin={handleLogin}
        onGoogleSuccess={handleGoogleSync}
        onCancel={() => setView('WALL')}
      />
    );
  }

  // 3. Authenticated User Sessions
  if (view === 'USER_SESSION' && state.currentUser) {
    return (
      <div className="h-screen w-full relative">
         {/* Logout Button */}
         <button 
          onClick={handleLogout}
          className="fixed top-4 right-4 z-50 bg-white/80 p-2 rounded-full shadow-sm hover:bg-slate-200 backdrop-blur-sm border border-slate-200"
          title="Exit to Dashboard"
         >
           <LogOut size={20} className="text-slate-600" />
         </button>
  
         {state.currentUser.role === UserRole.PARENT ? (
           <ParentPortal 
              users={state.users}
              chores={state.chores}
              rewards={state.rewards}
              onAddChore={handleAddChore}
              onApproveReward={handleApproveReward}
           />
         ) : (
           <KidDashboard 
              currentUser={state.currentUser}
              chores={state.chores}
              rewards={state.rewards}
              onToggleChore={handleToggleChore}
              onRequestReward={handleRequestReward}
           />
         )}
      </div>
    );
  }

  return null;
};

export default App;