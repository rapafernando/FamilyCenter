import React, { useState, useEffect } from 'react';
import { User, Chore, Reward, UserRole, AppState, Meal, MealType } from './types';
import { INITIAL_USERS, INITIAL_CHORES, INITIAL_REWARDS, INITIAL_EVENTS, INITIAL_MEALS, INITIAL_PHOTOS } from './constants';
import AuthScreen from './components/AuthScreen';
import ParentPortal from './components/ParentPortal';
import KidDashboard from './components/KidDashboard';
import FamilyWallDashboard from './components/FamilyWallDashboard';
import { LogOut } from 'lucide-react';
import { fetchGoogleCalendarEvents } from './services/googleService';

type ViewState = 'WALL' | 'AUTH' | 'USER_SESSION';

const STORAGE_KEY = 'familySyncData';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('WALL');
  
  // Initialize state from LocalStorage or default constants
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure we merge with defaults to avoid missing keys from old versions
        return {
          familyName: 'My Family',
          users: [],
          chores: [],
          rewards: [],
          events: [],
          meals: [],
          photos: [],
          ...parsed,
          currentUser: null // Always reset current user on reload
        };
      } catch (e) {
        console.error("Failed to parse saved state", e);
      }
    }
    return {
      familyName: 'My Family',
      users: INITIAL_USERS,
      chores: INITIAL_CHORES,
      rewards: INITIAL_REWARDS,
      events: INITIAL_EVENTS,
      meals: INITIAL_MEALS,
      photos: INITIAL_PHOTOS,
      currentUser: null
    };
  });

  // Save to LocalStorage whenever state changes (excluding currentUser)
  useEffect(() => {
    const { currentUser, ...persistentState } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentState));
  }, [state]);

  const handleLogin = (user: User) => {
    setState(prev => ({ ...prev, currentUser: user }));
    setView('USER_SESSION');
  };

  const handleLogout = () => {
    setState(prev => ({ ...prev, currentUser: null }));
    setView('WALL');
  };

  // Google Sync Logic
  const handleGoogleSync = async (googleProfile: any) => {
    try {
      const googleEvents = await fetchGoogleCalendarEvents();
      
      setState(prev => ({
        ...prev,
        events: [...(prev.events || []), ...googleEvents],
        // If the current user is a parent, try to update their avatar/name if it's generic
        users: prev.users.map(u => 
          u.id === prev.currentUser?.id && u.role === UserRole.PARENT
            ? { ...u, name: googleProfile.given_name || u.name, avatar: googleProfile.picture || u.avatar } 
            : u
        )
      }));

    } catch (error) {
      console.error("Failed to sync calendar", error);
    }
  };

  // --- Actions ---

  const handleToggleChore = (choreId: string) => {
    setState(prev => {
      const chore = prev.chores.find(c => c.id === choreId);
      if (!chore) return prev;

      const isCompleting = !chore.completed;
      
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

  const handleDeleteChore = (id: string) => {
    setState(prev => ({
      ...prev,
      chores: prev.chores.filter(c => c.id !== id)
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
       image: `https://ui-avatars.com/api/?name=${encodeURIComponent(title)}&background=random`
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

  // Settings Actions
  const handleUpdateFamilyName = (name: string) => {
    setState(prev => ({ ...prev, familyName: name }));
  };

  const handleAddUser = (name: string, role: UserRole) => {
    const newUser: User = {
      id: `u${Date.now()}`,
      name,
      role,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
      points: 0,
      totalPointsEarned: 0
    };
    setState(prev => ({ ...prev, users: [...prev.users, newUser] }));
  };

  const handleDeleteUser = (id: string) => {
    if (state.users.length <= 1) {
      alert("You cannot delete the last user.");
      return;
    }
    setState(prev => ({
      ...prev,
      users: prev.users.filter(u => u.id !== id),
      chores: prev.chores.filter(c => c.assignedTo !== id) // Cleanup assigned chores
    }));
  };

  // --- Render ---

  if (view === 'WALL') {
    return (
      <FamilyWallDashboard 
        familyName={state.familyName}
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

  if (view === 'USER_SESSION' && state.currentUser) {
    return (
      <div className="h-screen w-full relative">
         <button 
          onClick={handleLogout}
          className="fixed top-4 right-4 z-50 bg-white/80 p-2 rounded-full shadow-sm hover:bg-slate-200 backdrop-blur-sm border border-slate-200"
          title="Exit to Dashboard"
         >
           <LogOut size={20} className="text-slate-600" />
         </button>
  
         {state.currentUser.role === UserRole.PARENT ? (
           <ParentPortal 
              familyName={state.familyName}
              users={state.users}
              chores={state.chores}
              rewards={state.rewards}
              onAddChore={handleAddChore}
              onDeleteChore={handleDeleteChore}
              onApproveReward={handleApproveReward}
              onUpdateFamilyName={handleUpdateFamilyName}
              onAddUser={handleAddUser}
              onDeleteUser={handleDeleteUser}
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