
import React, { useState, useEffect } from 'react';
import { User, Chore, Reward, UserRole, AppState, Meal, MealType, ChoreAssignment } from './types';
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
  // Initialize state from LocalStorage or default constants
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure we always have at least one user if the saved array is empty (edge case fix)
        const safeUsers = (parsed.users && Array.isArray(parsed.users) && parsed.users.length > 0) 
          ? parsed.users 
          : INITIAL_USERS;
        
        // MIGRATION: Fix old chores that might be missing the new fields
        const safeChores = (Array.isArray(parsed.chores) ? parsed.chores : INITIAL_CHORES).map((c: any) => {
           // If 'assignments' array is missing, try to migrate from old 'assignedTo' field
           if (!c.assignments || !Array.isArray(c.assignments)) {
             const assignments: ChoreAssignment[] = [];
             if (c.assignedTo) {
               assignments.push({ userId: c.assignedTo, points: c.points || 0 });
             }
             return {
               ...c,
               assignments,
               frequency: c.frequency || 'daily',
               frequencyConfig: c.frequencyConfig || 'all',
               timeOfDay: c.timeOfDay || 'all_day',
               completedBy: Array.isArray(c.completedBy) ? c.completedBy : (c.completed ? (c.assignedTo ? [c.assignedTo] : []) : []),
               icon: c.icon || '<svg></svg>'
             } as Chore;
           }
           return c as Chore;
        });
        
        return {
          familyName: 'My Family',
          currentUser: null,
          ...parsed, // Override defaults with saved data
          users: safeUsers,
          events: Array.isArray(parsed.events) ? parsed.events : INITIAL_EVENTS,
          chores: safeChores,
          meals: Array.isArray(parsed.meals) ? parsed.meals : INITIAL_MEALS,
          rewards: Array.isArray(parsed.rewards) ? parsed.rewards : INITIAL_REWARDS,
          photos: Array.isArray(parsed.photos) ? parsed.photos : INITIAL_PHOTOS,
        };
      }
    } catch (e) {
      console.error("Failed to parse saved state", e);
    }
    // Default fallback
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

  // Determine initial view based on whether we have a logged-in user
  const [view, setView] = useState<ViewState>(() => {
    return state.currentUser ? 'WALL' : 'AUTH';
  });

  // Save to LocalStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save state", e);
    }
  }, [state]);

  const handleLogin = (user: User) => {
    setState(prev => ({ ...prev, currentUser: user }));
    setView('WALL'); 
  };

  const handleLogout = () => {
    setState(prev => ({ ...prev, currentUser: null }));
    setView('AUTH');
  };

  const handleSessionOpen = () => {
    setView('USER_SESSION');
  };

  // Google Sync Logic
  const handleGoogleSync = async (googleProfile: any) => {
    try {
      const googleEvents = await fetchGoogleCalendarEvents();
      
      setState(prev => ({
        ...prev,
        events: [...(prev.events || []), ...(googleEvents || [])],
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
      if (!chore || !prev.currentUser) return prev;

      // Find if current user is assigned to this chore
      const assignment = chore.assignments.find(a => a.userId === prev.currentUser?.id);
      if (!assignment) return prev; // User not assigned

      // Check if user already completed it today
      const alreadyCompleted = chore.completedBy.includes(prev.currentUser.id);

      const updatedUsers = prev.users.map(u => {
        if (u.id === prev.currentUser?.id) {
          return {
            ...u,
            points: alreadyCompleted ? u.points - assignment.points : u.points + assignment.points,
            totalPointsEarned: alreadyCompleted ? u.totalPointsEarned - assignment.points : u.totalPointsEarned + assignment.points
          };
        }
        return u;
      });

      const updatedChores = prev.chores.map(c => {
        if (c.id === choreId) {
            let newCompletedBy = [...c.completedBy];
            if (alreadyCompleted) {
                newCompletedBy = newCompletedBy.filter(id => id !== prev.currentUser?.id);
            } else {
                newCompletedBy.push(prev.currentUser?.id || '');
            }
            return { ...c, completedBy: newCompletedBy };
        }
        return c;
      });

      // Update current user state as well to reflect points immediately
      const updatedCurrentUser = updatedUsers.find(u => u.id === prev.currentUser?.id) || prev.currentUser;

      return {
        ...prev,
        users: updatedUsers,
        chores: updatedChores,
        currentUser: updatedCurrentUser
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
      chores: prev.chores.filter(c => 
        // Keep chore if assigned to multiple people, just remove this user from assignments
        c.assignments.length > 1 || c.assignments[0].userId !== id
      ).map(c => ({
          ...c,
          assignments: c.assignments.filter(a => a.userId !== id)
      }))
    }));
  };

  // --- Render ---

  if (view === 'AUTH') {
    return (
      <AuthScreen 
        users={state.users} 
        onLogin={handleLogin}
        onGoogleSuccess={(profile) => {
           handleGoogleSync(profile);
           const parent = state.users.find(u => u.role === UserRole.PARENT);
           if(parent) handleLogin(parent);
        }}
        onCancel={() => {}} 
      />
    );
  }

  if (view === 'WALL') {
    return (
      <FamilyWallDashboard 
        familyName={state.familyName}
        users={state.users}
        events={state.events || []}
        chores={state.chores || []}
        meals={state.meals || []}
        photos={state.photos || []}
        onSettingsClick={handleSessionOpen}
        onToggleChore={handleToggleChore}
        onUpdateMeal={handleUpdateMeal}
        currentUser={state.currentUser}
        onLogout={handleLogout}
      />
    );
  }

  if (view === 'USER_SESSION' && state.currentUser) {
    return (
      <div className="h-screen w-full relative">
         <button 
          onClick={() => setView('WALL')}
          className="fixed top-4 right-4 z-50 bg-white/80 p-2 rounded-full shadow-sm hover:bg-slate-200 backdrop-blur-sm border border-slate-200"
          title="Back to Wall"
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
