
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Chore, Reward, UserRole, AppState, Meal, MealType, ChoreAssignment, ChoreLog, CalendarSource, PhotoConfig, CalendarEvent, SystemAdminUser } from './types';
import { INITIAL_USERS, INITIAL_CHORES, INITIAL_REWARDS, INITIAL_EVENTS, INITIAL_MEALS, INITIAL_PHOTOS, INITIAL_CHORE_LOGS, INITIAL_CALENDAR_SOURCES, INITIAL_PHOTO_CONFIG } from './constants';
import AuthScreen from './components/AuthScreen';
import ParentPortal from './components/ParentPortal';
import KidDashboard from './components/KidDashboard';
import FamilyWallDashboard from './components/FamilyWallDashboard';
import SetupScreen from './components/SetupScreen';
import SuperAdminPortal from './components/SuperAdminPortal';
import { LogOut } from 'lucide-react';
import { fetchGoogleCalendarEvents, fetchPhotosFromAlbum } from './services/googleService';

// --- STORAGE CONSTANTS ---
const DB_KEY = 'FAMILY_DB'; // Stores Record<string, AppState>
const ACTIVE_FAMILY_KEY = 'ACTIVE_FAMILY_ID'; // Stores string (id)
const ADMINS_KEY = 'SYSTEM_ADMINS'; // Stores SystemAdminUser[]
const LEGACY_STORAGE_KEY = 'familySyncData'; // Old single-tenant key
const IDLE_TIMEOUT_MS = 300000; // 5 Minutes

type ViewState = 'WALL' | 'AUTH' | 'USER_SESSION' | 'SETUP' | 'ADMIN_PORTAL';

// --- INITIAL STATE HELPERS ---
const getInitialFamilyState = (id: string, name: string): AppState => ({
    id,
    familyName: name,
    users: INITIAL_USERS,
    chores: INITIAL_CHORES,
    choreHistory: INITIAL_CHORE_LOGS,
    rewards: INITIAL_REWARDS,
    events: INITIAL_EVENTS,
    meals: INITIAL_MEALS,
    photos: INITIAL_PHOTOS,
    calendarSources: INITIAL_CALENDAR_SOURCES,
    photoConfig: INITIAL_PHOTO_CONFIG,
    currentUser: null,
    lastResetDate: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString()
});

const App: React.FC = () => {
  // --- DATABASE & SESSION STATE ---
  const [db, setDb] = useState<Record<string, AppState>>({});
  const [admins, setAdmins] = useState<SystemAdminUser[]>([]);
  const [activeFamilyId, setActiveFamilyId] = useState<string | null>(null);
  
  // --- MIGRATION & INIT EFFECT ---
  useEffect(() => {
      // 1. Load System Admins
      try {
          const storedAdmins = localStorage.getItem(ADMINS_KEY);
          if (storedAdmins) setAdmins(JSON.parse(storedAdmins));
      } catch (e) { console.error("Failed to load admins", e); }

      // 2. Load DB
      let loadedDb: Record<string, AppState> = {};
      try {
          const storedDb = localStorage.getItem(DB_KEY);
          if (storedDb) {
              loadedDb = JSON.parse(storedDb);
          } else {
              // MIGRATION: Check for legacy data
              const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
              if (legacy) {
                  const parsedLegacy = JSON.parse(legacy);
                  const newId = `fam-${Date.now()}`;
                  // Enhance legacy object with new required ID field
                  loadedDb[newId] = { ...parsedLegacy, id: newId, createdAt: new Date().toISOString() };
                  localStorage.setItem(DB_KEY, JSON.stringify(loadedDb));
                  localStorage.removeItem(LEGACY_STORAGE_KEY); // Cleanup
                  localStorage.setItem(ACTIVE_FAMILY_KEY, newId); // Auto-login
                  console.log("Migrated legacy data to Multi-tenant DB");
              }
          }
      } catch (e) { console.error("DB Load Error", e); }
      setDb(loadedDb);

      // 3. Load Active Session
      const activeId = localStorage.getItem(ACTIVE_FAMILY_KEY);
      if (activeId && loadedDb[activeId]) {
          setActiveFamilyId(activeId);
      }
  }, []);

  // --- PERSISTENCE EFFECT ---
  useEffect(() => {
      if (Object.keys(db).length > 0) {
          localStorage.setItem(DB_KEY, JSON.stringify(db));
      }
  }, [db]);

  useEffect(() => {
      localStorage.setItem(ADMINS_KEY, JSON.stringify(admins));
  }, [admins]);

  useEffect(() => {
      if (activeFamilyId) {
          localStorage.setItem(ACTIVE_FAMILY_KEY, activeFamilyId);
      } else {
          localStorage.removeItem(ACTIVE_FAMILY_KEY);
      }
  }, [activeFamilyId]);

  // --- ROUTING LOGIC ---
  // Check URL for /admin path
  const [isAdminPath, setIsAdminPath] = useState(window.location.pathname === '/admin');

  // --- DERIVED STATE ---
  const state = activeFamilyId ? db[activeFamilyId] : null;
  
  // View State logic
  const [view, setView] = useState<ViewState>(() => {
      if (window.location.pathname === '/admin') return 'ADMIN_PORTAL';
      return 'WALL'; // Will check state existence below
  });

  // Sync view with state availability
  useEffect(() => {
      if (isAdminPath) {
          setView('ADMIN_PORTAL');
      } else if (!state) {
          setView('SETUP');
      } else if (view === 'SETUP') {
          // If we have state but view is setup, move to wall
          setView('WALL');
      }
  }, [isAdminPath, state]);

  // --- HELPER TO UPDATE ACTIVE FAMILY STATE ---
  const updateActiveFamily = (updater: (prev: AppState) => AppState) => {
      if (!activeFamilyId) return;
      setDb(prev => ({
          ...prev,
          [activeFamilyId]: updater(prev[activeFamilyId])
      }));
  };

  // --- IDLE TIMER ---
  const [wallActiveTab, setWallActiveTab] = useState<'calendar' | 'chores' | 'meals' | 'photos' | undefined>(undefined);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (view !== 'AUTH' && view !== 'SETUP' && view !== 'ADMIN_PORTAL' && state && state.photos.length > 0) {
        idleTimerRef.current = setTimeout(() => {
            setView('WALL');
            setWallActiveTab('photos');
        }, IDLE_TIMEOUT_MS);
    }
  }, [view, state]);

  useEffect(() => {
      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
      const handleActivity = () => {
          resetIdleTimer();
          if (wallActiveTab === 'photos') setWallActiveTab(undefined); 
      };
      events.forEach(e => window.addEventListener(e, handleActivity));
      resetIdleTimer();
      return () => {
          events.forEach(e => window.removeEventListener(e, handleActivity));
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      };
  }, [resetIdleTimer, wallActiveTab]);

  // --- SYNC SERVICE ---
  useEffect(() => {
      if (!state || !state.googleAccessToken) return;
      
      const syncData = async () => {
          let allEvents: CalendarEvent[] = [];
          if (state.calendarSources.length > 0) {
              for (const source of state.calendarSources) {
                  const prefix = source.type === 'personal' ? `[${source.ownerName}]` : '';
                  const token = source.accessToken || state.googleAccessToken;
                  if (token) {
                    const fetched = await fetchGoogleCalendarEvents(token, source.googleCalendarId, source.color, prefix);
                    allEvents = [...allEvents, ...fetched];
                  }
              }
              if (allEvents.length > 0) {
                  updateActiveFamily(prev => ({ ...prev, events: allEvents }));
              }
          }
          const photoToken = state.photoConfig.accessToken || state.googleAccessToken;
          if (photoToken && state.photoConfig.albumId) {
              const fetchedPhotos = await fetchPhotosFromAlbum(photoToken, state.photoConfig.albumId);
              if (fetchedPhotos.length > 0) {
                  updateActiveFamily(prev => ({ ...prev, photos: fetchedPhotos }));
              }
          }
      };

      syncData();
      const interval = setInterval(syncData, 15 * 60 * 1000);
      return () => clearInterval(interval);
  }, [activeFamilyId, state?.calendarSources, state?.photoConfig]); // Only re-run if config changes or family changes

  // --- ACTIONS ---

  // 1. SETUP & AUTH
  const handleSetupComplete = (googleProfile: any, token: string) => {
     const newId = `fam-${Date.now()}`;
     const familyName = googleProfile.family_name ? `${googleProfile.family_name} Family` : 'My Family';
     
     const newAdminUser: User = {
         id: `u-${Date.now()}`,
         name: googleProfile.name || 'Admin',
         avatar: googleProfile.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(googleProfile.name)}`,
         email: googleProfile.email,
         role: UserRole.PARENT,
         points: 0,
         totalPointsEarned: 0
     };
     
     const newFamilyState: AppState = {
         ...getInitialFamilyState(newId, familyName),
         users: [newAdminUser],
         currentUser: newAdminUser,
         googleAccessToken: token
     };

     setDb(prev => ({ ...prev, [newId]: newFamilyState }));
     setActiveFamilyId(newId);
     setView('USER_SESSION');
  };

  const handleLogin = (user: User) => {
    updateActiveFamily(prev => ({ ...prev, currentUser: user }));
    setView('USER_SESSION');
  };

  const handleLogout = () => {
    updateActiveFamily(prev => ({ ...prev, currentUser: null }));
    setView('WALL');
  };
  
  // Used by AuthScreen to exit the current family context (Simulate "Sign Out" of device)
  const handleExitFamily = () => {
      setActiveFamilyId(null);
      setView('SETUP');
  };

  // 2. ADMIN PORTAL ACTIONS
  const handleLoginAsFamily = (familyId: string) => {
      setActiveFamilyId(familyId);
      setIsAdminPath(false);
      window.history.pushState({}, '', '/');
      setView('WALL');
  };

  const handleDeleteFamily = (familyId: string) => {
      setDb(prev => {
          const next = { ...prev };
          delete next[familyId];
          return next;
      });
      if (activeFamilyId === familyId) setActiveFamilyId(null);
  };
  
  const handleAddAdmin = (admin: SystemAdminUser) => setAdmins(prev => [...prev, admin]);
  const handleDeleteAdmin = (id: string) => setAdmins(prev => prev.filter(a => a.id !== id));

  // 3. APP ACTIONS (Wrappers around updateActiveFamily)
  const handleSetPin = (userId: string, pin: string) => updateActiveFamily(prev => ({ ...prev, users: prev.users.map(u => u.id === userId ? { ...u, pin } : u) }));
  const handleAddReward = (reward: Reward) => updateActiveFamily(prev => ({ ...prev, rewards: [...prev.rewards, reward] }));
  const handleUpdateReward = (updatedReward: Reward) => updateActiveFamily(prev => ({ ...prev, rewards: prev.rewards.map(r => r.id === updatedReward.id ? updatedReward : r) }));
  const handleDeleteReward = (id: string) => updateActiveFamily(prev => ({ ...prev, rewards: prev.rewards.filter(r => r.id !== id) }));
  const handleAddCalendarSource = (source: CalendarSource) => updateActiveFamily(prev => ({ ...prev, calendarSources: [...prev.calendarSources, source] }));
  const handleRemoveCalendarSource = (id: string) => updateActiveFamily(prev => ({ ...prev, calendarSources: prev.calendarSources.filter(s => s.id !== id) }));
  const handleSetPhotoConfig = (config: PhotoConfig) => updateActiveFamily(prev => ({ ...prev, photoConfig: config }));
  const handleSetGoogleToken = (token: string) => updateActiveFamily(prev => ({ ...prev, googleAccessToken: token }));
  
  const handleRedeemSharedReward = (rewardId: string) => {
      if (!state) return;
      const reward = state.rewards.find(r => r.id === rewardId);
      if (!reward || !reward.isShared) return;
      const kids = state.users.filter(u => u.role === UserRole.KID);
      if (kids.length === 0) return;
      const costPerKid = Math.ceil(reward.cost / kids.length);
      const poorKids = kids.filter(k => k.points < costPerKid);
      if (poorKids.length > 0) {
          alert(`Cannot redeem yet! ${poorKids.map(k => k.name).join(', ')} need(s) more points.`);
          return;
      }
      const updatedUsers = state.users.map(u => {
          if (u.role === UserRole.KID) return { ...u, points: u.points - costPerKid };
          return u;
      });
      updateActiveFamily(prev => ({ ...prev, users: updatedUsers }));
  };

  const handleToggleChore = (choreId: string, asUserId?: string) => {
    updateActiveFamily(prev => {
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
            if (alreadyCompleted) newCompletedBy = newCompletedBy.filter(id => id !== targetUserId);
            else newCompletedBy.push(targetUserId);
            return { ...c, completedBy: newCompletedBy };
        }
        return c;
      });
      let updatedHistory = [...(prev.choreHistory || [])];
      if (!alreadyCompleted) {
         updatedHistory.push({ id: `log-${Date.now()}`, choreId: chore.id, choreTitle: chore.title, userId: targetUserId, userName: targetUser.name, points: assignment.points, date: todayDate, timestamp: new Date().toISOString() });
      } else {
         const logIndex = updatedHistory.findIndex(l => l.choreId === choreId && l.userId === targetUserId && l.date === todayDate);
         if (logIndex > -1) updatedHistory.splice(logIndex, 1);
      }
      return { ...prev, users: updatedUsers, chores: updatedChores, choreHistory: updatedHistory, currentUser: prev.currentUser?.id === targetUserId ? updatedUsers.find(u => u.id === targetUserId) || prev.currentUser : prev.currentUser };
    });
  };

  const handleAddChore = (newChore: Omit<Chore, 'id'>) => updateActiveFamily(prev => ({ ...prev, chores: [...prev.chores, { ...newChore, id: `c${Date.now()}` }] }));
  const handleUpdateChore = (updatedChore: Chore) => updateActiveFamily(prev => ({ ...prev, chores: prev.chores.map(c => c.id === updatedChore.id ? updatedChore : c) }));
  const handleDeleteChore = (id: string) => updateActiveFamily(prev => ({ ...prev, chores: prev.chores.filter(c => c.id !== id) }));
  const handleRequestReward = (title: string, cost: number) => {
     if(!state?.currentUser) return;
     const newReward: Reward = { id: `r${Date.now()}`, title, cost, requestedBy: state.currentUser.id, approved: false, image: `https://ui-avatars.com/api/?name=${encodeURIComponent(title)}&background=random` };
     updateActiveFamily(prev => ({ ...prev, rewards: [...prev.rewards, newReward] }));
  };
  const handleApproveReward = (id: string, adjustedCost?: number) => updateActiveFamily(prev => ({ ...prev, rewards: prev.rewards.map(r => r.id === id ? { ...r, approved: true, cost: adjustedCost !== undefined ? adjustedCost : r.cost } : r) }));
  const handleUpdateMeal = (date: string, type: MealType, title: string) => updateActiveFamily(prev => { const existingMealIndex = prev.meals.findIndex(m => m.date === date && m.type === type); const newMeals = [...prev.meals]; if (existingMealIndex >= 0) newMeals[existingMealIndex] = { ...newMeals[existingMealIndex], title }; else newMeals.push({ id: `m-${Date.now()}`, date, type, title }); return { ...prev, meals: newMeals }; });
  const handleUpdateFamilyName = (name: string) => updateActiveFamily(prev => ({ ...prev, familyName: name }));
  const handleAddUser = (name: string, role: UserRole) => { const newUser: User = { id: `u${Date.now()}`, name, role, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`, points: 0, totalPointsEarned: 0, email: role === UserRole.PARENT ? 'newparent@example.com' : undefined }; updateActiveFamily(prev => ({ ...prev, users: [...prev.users, newUser] })); };
  const handleDeleteUser = (id: string) => { if (!state || state.users.length <= 1) { alert("You cannot delete the last user."); return; } updateActiveFamily(prev => ({ ...prev, users: prev.users.filter(u => u.id !== id), chores: prev.chores.filter(c => c.assignments.length > 1 || c.assignments[0].userId !== id).map(c => ({ ...c, assignments: c.assignments.filter(a => a.userId !== id) })) })); };

  // --- RENDER ---

  if (view === 'ADMIN_PORTAL') {
      return (
        <SuperAdminPortal 
            db={db} 
            admins={admins}
            onLoginAsFamily={handleLoginAsFamily} 
            onDeleteFamily={handleDeleteFamily}
            onAddAdmin={handleAddAdmin}
            onDeleteAdmin={handleDeleteAdmin}
        />
      );
  }

  if (view === 'SETUP' || !state) return <SetupScreen onSetupComplete={handleSetupComplete} />;

  if (view === 'AUTH') {
    return <AuthScreen users={state.users} onLogin={handleLogin} onCancel={() => setView('WALL')} onSetPin={handleSetPin} onAdminLogin={handleExitFamily} />;
  }

  if (view === 'WALL') {
    return <FamilyWallDashboard familyName={state.familyName} users={state.users} events={state.events || []} chores={state.chores || []} meals={state.meals || []} photos={state.photos || []} onSettingsClick={() => setView('AUTH')} onToggleChore={handleToggleChore} onUpdateMeal={handleUpdateMeal} currentUser={state.currentUser} onLogout={handleLogout} activeTabOverride={wallActiveTab} />;
  }

  if (view === 'USER_SESSION' && state.currentUser) {
    return (
      <div className="h-screen w-full relative">
         <button onClick={() => setView('WALL')} className="fixed top-4 right-4 z-50 bg-white/80 p-2 rounded-full shadow-sm hover:bg-slate-200 backdrop-blur-sm border border-slate-200" title="Back to Wall"><LogOut size={20} className="text-slate-600" /></button>
         {state.currentUser.role === UserRole.PARENT ? (
           <ParentPortal 
              familyName={state.familyName} users={state.users} chores={state.chores} rewards={state.rewards} choreHistory={state.choreHistory} calendarSources={state.calendarSources} photoConfig={state.photoConfig} currentUser={state.currentUser} googleAccessToken={state.googleAccessToken}
              onAddChore={handleAddChore} onUpdateChore={handleUpdateChore} onDeleteChore={handleDeleteChore} onApproveReward={handleApproveReward} onUpdateFamilyName={handleUpdateFamilyName} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} onAddReward={handleAddReward} onUpdateReward={handleUpdateReward} onDeleteReward={handleDeleteReward} onRedeemSharedReward={handleRedeemSharedReward} onAddCalendarSource={handleAddCalendarSource} onRemoveCalendarSource={handleRemoveCalendarSource} onSetPhotoConfig={handleSetPhotoConfig} onSetGoogleToken={handleSetGoogleToken}
           />
         ) : (
           <KidDashboard currentUser={state.currentUser} chores={state.chores} rewards={state.rewards} onToggleChore={handleToggleChore} onRequestReward={handleRequestReward} onAddCalendarSource={handleAddCalendarSource} />
         )}
      </div>
    );
  }

  return null;
};

export default App;
