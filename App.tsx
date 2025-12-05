
import React, { useState, useEffect } from 'react';
import { User, Chore, Reward, UserRole, AppState, Meal, MealType, ChoreAssignment, ChoreLog } from './types';
import { INITIAL_USERS, INITIAL_CHORES, INITIAL_REWARDS, INITIAL_EVENTS, INITIAL_MEALS, INITIAL_PHOTOS, INITIAL_CHORE_LOGS } from './constants';
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
          choreHistory: Array.isArray(parsed.choreHistory) ? parsed.choreHistory : INITIAL_CHORE_LOGS,
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
      choreHistory: INITIAL_CHORE_LOGS,
      rewards: INITIAL_REWARDS,
      events: INITIAL_EVENTS,
      meals: INITIAL_MEALS,
      photos: INITIAL_PHOTOS,
      currentUser: null
    };
  });

  const [view, setView] = useState<ViewState>('WALL'); // Default to Wall

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
    setView('USER_SESSION'); // Go straight to session after login
  };

  const handleLogout = () => {
    setState(prev => ({ ...prev, currentUser: null }));
    setView('WALL');
  };

  const handleOpenAuth = () => {
    setView('AUTH');
  };

  const handleCloseAuth = () => {
    setView('WALL');
  };

  const handleSetPin = (userId: string, pin: string) => {
    setState(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === userId ? { ...u, pin } : u)
    }));
  };

  const handleAddReward = (reward: Reward) => {
     setState(prev => ({
       ...prev,
       rewards: [...prev.rewards, reward]
     }));
  };

  const handleUpdateReward = (updatedReward: Reward) => {
      setState(prev => ({
          ...prev,
          rewards: prev.rewards.map(r => r.id === updatedReward.id ? updatedReward : r)
      }));
  };

  const handleDeleteReward = (id: string) => {
    setState(prev => ({
      ...prev,
      rewards: prev.rewards.filter(r => r.id !== id)
    }));
  };

  // Shared Reward Redemption Logic
  const handleRedeemSharedReward = (rewardId: string) => {
      const reward = state.rewards.find(r => r.id === rewardId);
      if (!reward || !reward.isShared) return;

      const kids = state.users.filter(u => u.role === UserRole.KID);
      if (kids.length === 0) {
          alert("No kids to redeem for!");
          return;
      }

      const costPerKid = Math.ceil(reward.cost / kids.length);
      
      // Check if all kids can afford it
      const poorKids = kids.filter(k => k.points < costPerKid);
      
      if (poorKids.length > 0) {
          alert(`Cannot redeem yet! ${poorKids.map(k => k.name).join(', ')} need(s) more points. Cost is ${costPerKid} per kid.`);
          return;
      }

      // Deduct points
      const updatedUsers = state.users.map(u => {
          if (u.role === UserRole.KID) {
              return { ...u, points: u.points - costPerKid };
          }
          return u;
      });

      // Mark reward as redeemed (optional, or just keep it available)
      // For now, let's just deduct points and show success
      setState(prev => ({ ...prev, users: updatedUsers }));
      alert(`Success! Redeemed ${reward.title}. Deducted ${costPerKid} points from each kid.`);
  };

  // --- Actions (Existing) ---

  const handleToggleChore = (choreId: string, asUserId?: string) => {
    setState(prev => {
      const chore = prev.chores.find(c => c.id === choreId);
      if (!chore) return prev;
      const targetUserId = asUserId || prev.currentUser?.id;
      if (!targetUserId) return prev;
      const targetUser = prev.users.find(u => u.id === targetUserId);
      if (!targetUser) return prev;
      const assignment = chore.assignments.find(a => a.userId === targetUserId);
      if (!assignment) return prev; 
      const alreadyCompleted = chore.completedBy.includes(targetUserId);
      const todayDate = new Date().toISOString().split('T')[0];
      const updatedUsers = prev.users.map(u => {
        if (u.id === targetUserId) {
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
                newCompletedBy = newCompletedBy.filter(id => id !== targetUserId);
            } else {
                newCompletedBy.push(targetUserId);
            }
            return { ...c, completedBy: newCompletedBy };
        }
        return c;
      });
      let updatedHistory = [...(prev.choreHistory || [])];
      if (!alreadyCompleted) {
         const newLog: ChoreLog = {
             id: `log-${Date.now()}`,
             choreId: chore.id,
             choreTitle: chore.title,
             userId: targetUserId,
             userName: targetUser.name,
             points: assignment.points,
             date: todayDate,
             timestamp: new Date().toISOString()
         };
         updatedHistory.push(newLog);
      } else {
         const logIndex = updatedHistory.findIndex(l => l.choreId === choreId && l.userId === targetUserId && l.date === todayDate);
         if (logIndex > -1) {
             updatedHistory.splice(logIndex, 1);
         }
      }
      const updatedCurrentUser = prev.currentUser?.id === targetUserId ? updatedUsers.find(u => u.id === targetUserId) || prev.currentUser : prev.currentUser;
      return {
        ...prev,
        users: updatedUsers,
        chores: updatedChores,
        choreHistory: updatedHistory,
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

  const handleUpdateChore = (updatedChore: Chore) => {
    setState(prev => ({
      ...prev,
      chores: prev.chores.map(c => c.id === updatedChore.id ? updatedChore : c)
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
     setState(prev => ({ ...prev, rewards: [...prev.rewards, newReward] }));
  };

  const handleApproveReward = (id: string, adjustedCost?: number) => {
    setState(prev => ({
      ...prev,
      rewards: prev.rewards.map(r => 
          r.id === id 
            ? { ...r, approved: true, cost: adjustedCost !== undefined ? adjustedCost : r.cost } 
            : r
      )
    }));
  };

  const handleUpdateMeal = (date: string, type: MealType, title: string) => {
    setState(prev => {
      const existingMealIndex = prev.meals.findIndex(m => m.date === date && m.type === type);
      const newMeals = [...prev.meals];
      if (existingMealIndex >= 0) {
        newMeals[existingMealIndex] = { ...newMeals[existingMealIndex], title };
      } else {
        newMeals.push({ id: `m-${Date.now()}`, date, type, title });
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
      totalPointsEarned: 0,
      email: role === UserRole.PARENT ? 'newparent@example.com' : undefined // Placeholder
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
      chores: prev.chores.filter(c => c.assignments.length > 1 || c.assignments[0].userId !== id).map(c => ({
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
        onCancel={handleCloseAuth}
        onSetPin={handleSetPin}
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
        onSettingsClick={handleOpenAuth} // Opens the "Who is here" screen
        onToggleChore={handleToggleChore}
        onUpdateMeal={handleUpdateMeal}
        currentUser={state.currentUser} // Likely null in wall mode, but passed if active
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
              choreHistory={state.choreHistory}
              onAddChore={handleAddChore}
              onUpdateChore={handleUpdateChore}
              onDeleteChore={handleDeleteChore}
              onApproveReward={handleApproveReward}
              onUpdateFamilyName={handleUpdateFamilyName}
              onAddUser={handleAddUser}
              onDeleteUser={handleDeleteUser}
              onAddReward={handleAddReward}
              onUpdateReward={handleUpdateReward}
              onDeleteReward={handleDeleteReward}
              onRedeemSharedReward={handleRedeemSharedReward}
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
