
import React, { useState, useEffect } from 'react';
import { User, CalendarEvent, Chore, Meal, MealType, Photo, UserRole } from '../types';
import { 
  Calendar, CheckSquare, Settings, Coffee, Utensils, 
  Image as ImageIcon, Moon, ChevronLeft, ChevronRight,
  CloudSun, Clock, Play, Pause, RefreshCw, X, LogOut,
  Sparkles, PartyPopper, Sun, Sunrise, Sunset, Undo, Trophy
} from 'lucide-react';

interface FamilyWallDashboardProps {
  familyName: string;
  users: User[];
  events: CalendarEvent[];
  chores: Chore[];
  meals: Meal[];
  photos: Photo[];
  onSettingsClick: () => void;
  onToggleChore: (id: string, userId?: string) => void;
  onUpdateMeal: (date: string, type: MealType, title: string) => void;
  currentUser: User | null;
  onLogout: () => void;
  activeTabOverride?: 'calendar' | 'chores' | 'meals' | 'photos';
}

type CalendarViewMode = 'day' | 'week' | 'month';

// Helper to check if a chore is valid for today
const isChoreScheduledForToday = (chore: Chore): boolean => {
  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' }); // "Monday"
  const dayNum = today.getDate().toString(); // "15"
  const dayIndex = today.getDay(); // 0 (Sun) - 6 (Sat)

  if (chore.frequency === 'daily') {
    if (chore.frequencyConfig === 'all') return true;
    if (chore.frequencyConfig === 'weekdays') return dayIndex >= 1 && dayIndex <= 5;
    return false;
  }
  
  if (chore.frequency === 'weekly') {
    // Check if config matches today's name (Case insensitive just to be safe)
    return chore.frequencyConfig.toLowerCase() === dayName.toLowerCase();
  }

  if (chore.frequency === 'monthly') {
    return chore.frequencyConfig === dayNum;
  }

  return false;
};

// CSS for Confetti Animation
const ConfettiStyles = () => (
  <style>{`
    @keyframes bang {
      from { transform: translate3d(0,0,0); opacity: 1; }
      to { transform: translate3d(var(--x), var(--y), 0); opacity: 0; }
    }
    .confetti-piece {
      position: absolute;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      animation: bang 1.5s ease-out forwards;
      opacity: 0;
    }
    @keyframes floatUp {
      0% { transform: translateY(100vh) scale(0.5); opacity: 0; }
      50% { opacity: 1; }
      100% { transform: translateY(-10vh) scale(1.5); opacity: 0; }
    }
    .grand-particle {
      position: absolute;
      bottom: 0;
      width: 20px;
      height: 20px;
      background: gold;
      animation: floatUp 3s linear forwards;
    }
  `}</style>
);

const FamilyWallDashboard: React.FC<FamilyWallDashboardProps> = ({ 
  familyName, users, events, chores, meals, photos, onSettingsClick, onToggleChore, onUpdateMeal, currentUser, onLogout, activeTabOverride
}) => {
  const [activeTab, setActiveTab] = useState<'calendar' | 'chores' | 'meals' | 'photos'>('calendar');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Calendar State
  const [calendarMode, setCalendarMode] = useState<CalendarViewMode>('week');
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Photo Frame State
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isSynced, setIsSynced] = useState(true);
  const [showSyncModal, setShowSyncModal] = useState(false);

  // Chore Completion Interaction State
  const [selectedChore, setSelectedChore] = useState<Chore | null>(null);
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [undoState, setUndoState] = useState<{choreId: string, kidId: string} | null>(null);

  // Grand Celebration State
  const [showGrandCelebration, setShowGrandCelebration] = useState<string | null>(null); // Kid ID

  // Apply activeTabOverride if present (for idle timer)
  useEffect(() => {
    if (activeTabOverride) {
        setActiveTab(activeTabOverride);
        if (activeTabOverride === 'photos') setIsPlaying(true);
    }
  }, [activeTabOverride]);

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Photo Slideshow
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (activeTab === 'photos' && isPlaying && isSynced && photos.length > 0) {
      interval = setInterval(() => {
        setCurrentPhotoIdx(prev => (prev + 1) % photos.length);
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [activeTab, isPlaying, isSynced, photos.length]);

  // Calendar Logic
  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday to start on Monday
    return new Date(d.setDate(diff));
  };

  const getMonthDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Get padding days from previous month to start grid on Monday
    const startPadding = (firstDay.getDay() + 6) % 7; 
    const days: Date[] = [];

    // Previous month days
    for (let i = startPadding; i > 0; i--) {
        days.push(new Date(year, month, 1 - i));
    }
    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
        days.push(new Date(year, month, i));
    }
    // Next month days to fill grid (42 cells total usually covers all)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
        days.push(new Date(year, month + 1, i));
    }
    return days;
  };

  const getCalendarDates = () => {
    if (calendarMode === 'day') return [new Date(calendarDate)];
    if (calendarMode === 'week') {
      const start = getWeekStart(calendarDate);
      return Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }
    if (calendarMode === 'month') {
        return getMonthDays(calendarDate);
    }
    return [];
  };

  const currentDates = getCalendarDates();
  
  // Use weekDates for Meal Planner specifically (always next 7 days from today, or current week)
  const mealDates = Array.from({ length: 7 }).map((_, i) => {
    const d = getWeekStart(new Date()); 
    d.setDate(d.getDate() + i);
    return d;
  });

  const handlePrev = () => {
    const d = new Date(calendarDate);
    if (calendarMode === 'day') d.setDate(d.getDate() - 1);
    else if (calendarMode === 'week') d.setDate(d.getDate() - 7);
    else if (calendarMode === 'month') d.setMonth(d.getMonth() - 1);
    setCalendarDate(d);
  };

  const handleNext = () => {
    const d = new Date(calendarDate);
    if (calendarMode === 'day') d.setDate(d.getDate() + 1);
    else if (calendarMode === 'week') d.setDate(d.getDate() + 7);
    else if (calendarMode === 'month') d.setMonth(d.getMonth() + 1);
    setCalendarDate(d);
  };

  const handleToday = () => setCalendarDate(new Date());

  const getEventsForDate = (date: Date) => {
    return events.filter(e => {
      const eventDate = new Date(e.start);
      return eventDate.getDate() === date.getDate() && 
             eventDate.getMonth() === date.getMonth() &&
             eventDate.getFullYear() === date.getFullYear();
    });
  };

  const getMeal = (date: Date, type: MealType) => {
    const dateStr = date.toISOString().split('T')[0];
    return meals.find(m => m.date === dateStr && m.type === type)?.title || '';
  };

  const handleMealEdit = (date: Date, type: MealType, currentVal: string) => {
     const newVal = window.prompt(`Update ${type} for ${getDayName(date)}:`, currentVal);
     if (newVal !== null) {
       const dateStr = date.toISOString().split('T')[0];
       onUpdateMeal(dateStr, type, newVal);
     }
  };

  const handleSyncPhotos = () => {
    setTimeout(() => {
      setIsSynced(true);
      setShowSyncModal(false);
    }, 1500);
  };

  const handleChoreClick = (chore: Chore, kidId: string) => {
      // Permission check
      const isParent = currentUser?.role === UserRole.PARENT;
      const isAssignedKid = currentUser?.id === kidId;
      const isKiosk = !currentUser;

      if (!isParent && !isAssignedKid && !isKiosk) return;
      
      const isCompleted = chore.completedBy.includes(kidId);
      if (isCompleted) {
          onToggleChore(chore.id, kidId);
          setUndoState(null); 
      } else {
          setSelectedChore(chore);
          setSelectedKidId(kidId);
      }
  };

  const confirmChoreCompletion = () => {
      if (!selectedChore || !selectedKidId) return;
      
      const choreId = selectedChore.id;
      const kidId = selectedKidId;

      // 1. Trigger normal toggle
      onToggleChore(choreId, kidId);
      
      // 2. Check for GRAND CELEBRATION Logic
      const kidChores = chores.filter(c => 
         c.assignments.some(a => a.userId === kidId) && isChoreScheduledForToday(c)
      );
      const currentlyCompletedCount = kidChores.filter(c => c.completedBy.includes(kidId)).length;
      
      if (currentlyCompletedCount + 1 === kidChores.length) {
          setShowGrandCelebration(kidId);
          setTimeout(() => setShowGrandCelebration(null), 5000);
      } else {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 2500);
      }
      
      setUndoState({
          choreId: choreId,
          kidId: kidId
      });
      
      setSelectedChore(null);
      setSelectedKidId(null);

      setTimeout(() => {
          setUndoState(prev => prev?.choreId === choreId ? null : prev);
      }, 5000);
  };

  const handleUndoAction = () => {
      if(undoState) {
          onToggleChore(undoState.choreId, undoState.kidId);
          setUndoState(null);
      }
  };

  const getDayName = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'short' });
  const getDateNum = (date: Date) => date.getDate();

  const celebratingKid = users.find(u => u.id === showGrandCelebration);

  return (
    <div className="flex h-screen bg-white font-sans">
      <ConfettiStyles />
      
      {/* Sidebar */}
      <div className="w-24 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-8 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="mb-2">
           <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-900/20">
             {familyName.charAt(0)}
           </div>
        </div>

        <nav className="flex-1 flex flex-col gap-6 w-full px-2">
          <NavButton icon={<Calendar size={24} />} label="Calendar" active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
          <NavButton icon={<CheckSquare size={24} />} label="Chores" active={activeTab === 'chores'} onClick={() => setActiveTab('chores')} />
          <NavButton icon={<Utensils size={24} />} label="Meals" active={activeTab === 'meals'} onClick={() => setActiveTab('meals')} />
          <NavButton icon={<ImageIcon size={24} />} label="Photos" active={activeTab === 'photos'} onClick={() => setActiveTab('photos')} />
        </nav>

        <div className="flex flex-col gap-4 mt-auto">
            {/* Generic Settings Button that asks 'Who is here?' */}
            <button 
                onClick={onSettingsClick}
                className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"
                title="Switch User / Settings"
            >
                {currentUser ? (
                    <img src={currentUser.avatar} className="w-8 h-8 rounded-full border-2 border-slate-200" alt="Me"/>
                ) : (
                    <Settings size={24} />
                )}
                <span className="text-[10px] font-medium uppercase tracking-wider">Settings</span>
            </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 relative">
        
        {/* Universal Header */}
        {activeTab !== 'photos' && (
          <header className="px-6 py-4 flex items-center justify-between bg-white border-b border-slate-100 h-20">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-serif text-slate-800 tracking-tight hidden md:block">{familyName}</h1>
              <div className="text-slate-400 text-lg font-light flex items-center gap-2 bg-slate-50 px-3 py-1 rounded-full">
                 <Clock size={18} />
                 {currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
            
            {activeTab === 'calendar' && (
               <div className="flex bg-slate-100 p-1 rounded-lg">
                  {(['day', 'week', 'month'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setCalendarMode(mode)}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                            calendarMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                          {mode}
                      </button>
                  ))}
               </div>
            )}
            
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2 text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full text-sm">
                  <CloudSun size={18} className="text-orange-400"/>
                  <span className="hidden md:inline">72° Sunny</span>
               </div>
               
               {activeTab === 'calendar' && (
                   <button 
                     onClick={handleToday}
                     className="px-3 py-1.5 bg-slate-900 text-white rounded-full text-sm font-medium hover:bg-slate-800 transition-colors"
                   >
                     Today
                   </button>
               )}
            </div>
          </header>
        )}

        {/* ... (Rest of dashboard remains similar, reusing previous XML structure for brevity where content is unchanged) ... */}
        {/* Calendar View */}
        {activeTab === 'calendar' && (
          <div className="flex-1 flex flex-col overflow-hidden p-4 relative">
             <div className="flex items-center justify-between mb-4 px-2">
                 <h2 className="text-2xl font-serif text-slate-700">
                    {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                 </h2>
             </div>
             
             <div className="flex-1 flex items-stretch gap-2">
                 <button onClick={handlePrev} className="w-12 flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-200/50 rounded-2xl transition-colors"><ChevronLeft size={32} /></button>
                 <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    {(calendarMode === 'week' || calendarMode === 'month') && (
                        <div className={`grid grid-cols-7 border-b border-slate-100 bg-slate-50/50`}>
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                                <div key={d} className="py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-400">{d}</div>
                            ))}
                        </div>
                    )}
                    <div className={`flex-1 overflow-y-auto ${calendarMode === 'day' ? 'p-0' : 'grid grid-cols-7 auto-rows-fr'}`}>
                        {currentDates.map((date, idx) => {
                            const isToday = date.getDate() === new Date().getDate() && date.getMonth() === new Date().getMonth() && date.getFullYear() === new Date().getFullYear();
                            const isCurrentMonth = date.getMonth() === calendarDate.getMonth();
                            const dayEvents = getEventsForDate(date);
                            
                            if (calendarMode === 'day') {
                                return (
                                    <div key={idx} className="h-full p-8 flex gap-8">
                                         <div className="w-48 text-center pt-4">
                                             <div className="text-6xl font-black text-slate-800">{getDateNum(date)}</div>
                                             <div className="text-xl text-slate-500 uppercase tracking-widest">{getDayName(date)}</div>
                                             {isToday && <div className="mt-2 inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-bold">TODAY</div>}
                                         </div>
                                         <div className="flex-1 border-l-2 border-slate-100 pl-8 space-y-4">
                                             {dayEvents.length === 0 && <p className="text-slate-400 italic text-xl">No events scheduled.</p>}
                                             {dayEvents.map(ev => (
                                                 <div key={ev.id} className={`bg-opacity-20 p-6 rounded-2xl border-l-8 ${ev.color.replace('bg-', 'border-').replace('text-', 'border-')}`}>
                                                     <h4 className="text-2xl font-bold text-slate-800">{ev.title}</h4>
                                                     <p className="text-slate-600 text-lg mt-1">
                                                        {new Date(ev.start).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})} - 
                                                        {new Date(ev.end).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}
                                                     </p>
                                                 </div>
                                             ))}
                                         </div>
                                    </div>
                                );
                            }
                            return (
                                <div key={idx} className={`min-h-[100px] border-r border-b border-slate-100 p-2 flex flex-col gap-1 transition-colors ${!isCurrentMonth && calendarMode === 'month' ? 'bg-slate-50/50 text-slate-300' : 'bg-white'} ${isToday ? 'ring-inset ring-2 ring-blue-200 bg-blue-50/30' : ''}`}>
                                    <div className="flex justify-between items-start"><span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : (isCurrentMonth ? 'text-slate-700' : 'text-slate-300')}`}>{getDateNum(date)}</span></div>
                                    <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                                        {dayEvents.slice(0, 4).map(event => (<div key={event.id} className={`text-xs truncate px-1.5 py-0.5 rounded border-l-2 ${event.color}`}>{event.title}</div>))}
                                        {dayEvents.length > 4 && (<span className="text-[10px] text-slate-400 pl-1">+{dayEvents.length - 4} more</span>)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                 </div>
                 <button onClick={handleNext} className="w-12 flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-200/50 rounded-2xl transition-colors"><ChevronRight size={32} /></button>
             </div>
          </div>
        )}

        {/* Chores View */}
        {activeTab === 'chores' && (
           <div className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto w-full">
              <h2 className="text-3xl font-serif text-slate-800 mb-8 flex items-center gap-3">
                  <Sparkles className="text-yellow-500" /> Today's Chores
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {users.filter(u => u.role === 'KID').map(kid => {
                   const todaysChores = chores.filter(c => c.assignments.some(a => a.userId === kid.id) && isChoreScheduledForToday(c));
                   const completedCount = todaysChores.filter(c => c.completedBy.includes(kid.id)).length;
                   const totalCount = todaysChores.length;
                   const progress = totalCount === 0 ? 0 : (completedCount / totalCount) * 100;
                   const groupedChores = {
                       morning: todaysChores.filter(c => c.timeOfDay === 'morning'),
                       afternoon: todaysChores.filter(c => c.timeOfDay === 'afternoon'),
                       evening: todaysChores.filter(c => c.timeOfDay === 'evening'),
                       all_day: todaysChores.filter(c => c.timeOfDay === 'all_day')
                   };

                   return (
                   <div key={kid.id} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
                      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                         <div className="flex items-center justify-between mb-4">
                             <div className="flex items-center gap-4">
                                <img src={kid.avatar} className="w-16 h-16 rounded-full border-4 border-white shadow-sm" alt={kid.name}/>
                                <div>
                                    <h3 className="font-bold text-xl text-slate-800">{kid.name}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1"><Sparkles size={10} /> {kid.points} pts</div>
                                    </div>
                                </div>
                             </div>
                             <div className="text-right"><span className="text-3xl font-black text-slate-700">{completedCount}</span><span className="text-slate-400 text-lg font-medium">/{totalCount}</span></div>
                         </div>
                         <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-1000 ease-out" style={{ width: `${progress}%` }}></div></div>
                      </div>
                      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                         {todaysChores.length === 0 && (<div className="text-center py-10 text-slate-400"><p className="italic">No chores scheduled for today!</p></div>)}
                         {Object.entries(groupedChores).map(([time, tasks]) => {
                             if (tasks.length === 0) return null;
                             let icon = <Clock size={16}/>; let label = "Anytime"; let color = "text-slate-500";
                             if (time === 'morning') { icon = <Sunrise size={16}/>; label = "Morning"; color = "text-orange-500"; }
                             if (time === 'afternoon') { icon = <Sun size={16}/>; label = "Afternoon"; color = "text-yellow-600"; }
                             if (time === 'evening') { icon = <Sunset size={16}/>; label = "Evening"; color = "text-indigo-500"; }
                             return (
                                 <div key={time}>
                                     <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2 ${color}`}>{icon} {label}</h4>
                                     <div className="space-y-3">
                                         {tasks.map(chore => {
                                             const isCompleted = chore.completedBy.includes(kid.id);
                                             const points = chore.assignments.find(a => a.userId === kid.id)?.points || 0;
                                             // Interaction check - Parents or specific Kid
                                             const canInteract = !currentUser || currentUser.role === UserRole.PARENT || currentUser.id === kid.id;
                                             return (
                                                 <button key={chore.id} onClick={() => handleChoreClick(chore, kid.id)} disabled={!canInteract}
                                                    className={`w-full text-left flex items-center p-3 rounded-2xl border transition-all group relative overflow-hidden ${isCompleted ? 'bg-green-50 border-green-200 opacity-70' : 'bg-white border-slate-100 hover:border-blue-300 hover:shadow-md hover:scale-[1.01]'} ${!canInteract ? 'cursor-default opacity-50' : 'cursor-pointer'}`}>
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-4 shadow-sm transition-colors ${isCompleted ? 'bg-green-500 text-white' : 'bg-blue-50 text-blue-600 group-hover:bg-blue-100'}`}><div className="w-6 h-6" dangerouslySetInnerHTML={{ __html: chore.icon }} /></div>
                                                    <div className="flex-1"><p className={`font-bold text-base ${isCompleted ? 'line-through text-slate-500' : 'text-slate-800'}`}>{chore.title}</p></div>
                                                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${isCompleted ? 'bg-green-200 text-green-800' : 'bg-slate-100 text-slate-500'}`}>+{points}</span>
                                                 </button>
                                             );
                                         })}
                                     </div>
                                 </div>
                             );
                         })}
                      </div>
                   </div>
                )})}
              </div>
           </div>
        )}

        {/* Meals View */}
        {activeTab === 'meals' && (
           <div className="flex-1 overflow-x-auto overflow-y-auto p-6">
              <h2 className="text-3xl font-serif text-slate-800 mb-6">Weekly Menu</h2>
              <div className="min-w-[1000px] grid grid-cols-8 gap-0 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                 <div className="p-4 bg-slate-50 border-b border-r border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-sm flex items-center justify-center">Meal Type</div>
                 {mealDates.map((date, idx) => (<div key={idx} className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-center">{getDayName(date)} <br/><span className="text-slate-400 font-normal">{getDateNum(date)}</span></div>))}
                 <div className="p-4 bg-orange-50/50 border-r border-b border-slate-100 font-bold text-orange-800 flex items-center gap-2"><Coffee size={18} /> Breakfast</div>
                 {mealDates.map((date, idx) => (<div key={`b-${idx}`} onClick={() => handleMealEdit(date, 'breakfast', getMeal(date, 'breakfast'))} className="p-4 border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors flex items-center justify-center text-center text-sm text-slate-600 relative group">{getMeal(date, 'breakfast') || <span className="opacity-20 italic">Add...</span>}</div>))}
                 <div className="p-4 bg-green-50/50 border-r border-b border-slate-100 font-bold text-green-800 flex items-center gap-2"><Utensils size={18} /> Lunch</div>
                 {mealDates.map((date, idx) => (<div key={`l-${idx}`} onClick={() => handleMealEdit(date, 'lunch', getMeal(date, 'lunch'))} className="p-4 border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors flex items-center justify-center text-center text-sm text-slate-600 group">{getMeal(date, 'lunch') || <span className="opacity-20 italic">Add...</span>}</div>))}
                 <div className="p-4 bg-indigo-50/50 border-r border-slate-100 font-bold text-indigo-800 flex items-center gap-2"><Moon size={18} /> Dinner</div>
                 {mealDates.map((date, idx) => (<div key={`d-${idx}`} onClick={() => handleMealEdit(date, 'dinner', getMeal(date, 'dinner'))} className="p-4 border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors flex items-center justify-center text-center text-sm text-slate-600 font-medium group">{getMeal(date, 'dinner') || <span className="opacity-20 italic">Add...</span>}</div>))}
              </div>
           </div>
        )}

        {/* Photos View */}
        {activeTab === 'photos' && (
           <div className="flex-1 relative bg-black flex flex-col items-center justify-center overflow-hidden group">
              {isSynced && photos.length > 0 ? (
                <>
                  <div className="absolute inset-0 z-0"><img src={photos[currentPhotoIdx].url} alt="Slideshow" className="w-full h-full object-cover opacity-30 blur-3xl scale-110" /></div>
                  <img src={photos[currentPhotoIdx].url} alt="Slideshow" className="max-h-full max-w-full z-10 shadow-2xl rounded-sm" />
                  <div className="absolute bottom-10 left-10 z-20 text-white/90 drop-shadow-md"><p className="text-2xl font-serif">{photos[currentPhotoIdx].location}</p><p className="text-sm opacity-70">{new Date(photos[currentPhotoIdx].date).toLocaleDateString()}</p></div>
                </>
              ) : (
                <div className="text-center z-10 text-white/50"><ImageIcon size={64} className="mx-auto mb-4 opacity-30"/><h3 className="text-2xl font-light mb-2">No photos connected</h3><button onClick={() => setShowSyncModal(true)} className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full font-medium transition-all flex items-center gap-2 mx-auto"><RefreshCw size={18} /> Connect Google Photos</button></div>
              )}
              <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity z-30">
                 <div className="bg-black/30 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-medium">{currentPhotoIdx + 1} / {Math.max(1, photos.length)}</div>
                 <div className="flex gap-2"><button onClick={() => setIsPlaying(!isPlaying)} className="p-3 bg-black/30 hover:bg-black/50 text-white rounded-full backdrop-blur-md">{isPlaying ? <Pause size={20}/> : <Play size={20}/>}</button>{!isSynced && (<button onClick={() => setShowSyncModal(true)} className="p-3 bg-blue-600/80 hover:bg-blue-600 text-white rounded-full backdrop-blur-md"><Settings size={20}/></button>)}</div>
              </div>
              <div className="absolute top-0 left-0 h-full w-1/4 z-20 cursor-w-resize" onClick={() => setCurrentPhotoIdx(prev => prev === 0 ? photos.length - 1 : prev - 1)}></div>
              <div className="absolute top-0 right-0 h-full w-1/4 z-20 cursor-e-resize" onClick={() => setCurrentPhotoIdx(prev => (prev + 1) % photos.length)}></div>
              {showSyncModal && (<div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"><div className="bg-white rounded-2xl max-w-md w-full p-8 text-center relative"><button onClick={() => setShowSyncModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800"><X/></button><div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6"><ImageIcon size={32} /></div><h3 className="text-2xl font-bold text-slate-800 mb-2">Connect Google Photos</h3><p className="text-slate-500 mb-8">Access your family albums to display on the wall.</p><button onClick={handleSyncPhotos} className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-3 px-4 rounded-xl transition-all">Link Google Account</button></div></div>)}
           </div>
        )}

        {/* Task Completion Modal */}
        {selectedChore && (
            <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center transform scale-100 animate-in zoom-in-95 duration-200">
                    <button onClick={() => setSelectedChore(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X/></button>
                    <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                        <div className="w-10 h-10" dangerouslySetInnerHTML={{ __html: selectedChore.icon }} />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800 mb-2">Finish {selectedChore.title}?</h3>
                    <p className="text-slate-500 mb-8">Are you ready to mark this task as done and collect your points?</p>
                    <button 
                        onClick={confirmChoreCompletion}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-lg rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-xl shadow-blue-200"
                    >
                        Yes, I did it! 🚀
                    </button>
                </div>
            </div>
        )}

        {/* Undo Toast */}
        {undoState && (
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[70] animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-6">
                    <span className="font-medium">Task Completed!</span>
                    <button onClick={handleUndoAction} className="text-blue-300 hover:text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2"><Undo size={16} /> Undo</button>
                </div>
            </div>
        )}

        {/* Confetti Overlay */}
        {showConfetti && !showGrandCelebration && (
            <div className="absolute inset-0 z-[60] pointer-events-none overflow-hidden flex items-center justify-center">
                 <div className="absolute inset-0 flex items-center justify-center"><PartyPopper size={120} className="text-yellow-400 animate-bounce" /></div>
                 {Array.from({ length: 50 }).map((_, i) => {
                     const x = (Math.random() - 0.5) * 800; const y = (Math.random() - 0.5) * 800; const color = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'][Math.floor(Math.random() * 5)];
                     return (<div key={i} className="confetti-piece" style={{ backgroundColor: color, left: '50%', top: '50%', '--x': `${x}px`, '--y': `${y}px`, animationDelay: `${Math.random() * 0.2}s` } as React.CSSProperties} />);
                 })}
            </div>
        )}

        {/* GRAND CELEBRATION OVERLAY */}
        {showGrandCelebration && celebratingKid && (
           <div className="absolute inset-0 z-[80] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in zoom-in-90 duration-500">
              <div className="relative">
                 {/* Massive Rotating Light Effect */}
                 <div className="absolute inset-0 bg-yellow-400/20 blur-3xl rounded-full scale-[2] animate-pulse"></div>
                 
                 <div className="relative z-10 flex flex-col items-center">
                    <div className="w-40 h-40 rounded-full border-8 border-yellow-400 p-2 bg-white shadow-[0_0_50px_rgba(250,204,21,0.5)] mb-6 animate-bounce">
                        <img src={celebratingKid.avatar} className="w-full h-full rounded-full object-cover" alt="Champion"/>
                    </div>
                    <Trophy size={80} className="text-yellow-400 drop-shadow-lg mb-4 animate-pulse" />
                    <h2 className="text-5xl md:text-7xl font-black text-white text-center tracking-tight drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
                       ALL TASKS DONE!
                    </h2>
                    <p className="text-2xl text-yellow-200 font-bold mt-4 uppercase tracking-widest">
                       {celebratingKid.name} is a superstar!
                    </p>
                 </div>
              </div>

              {/* Intense Particle System */}
              {Array.from({ length: 40 }).map((_, i) => (
                  <div 
                    key={`grand-${i}`}
                    className="grand-particle"
                    style={{
                       left: `${Math.random() * 100}%`,
                       animationDelay: `${Math.random() * 2}s`,
                       backgroundColor: ['#facc15', '#60a5fa', '#f472b6'][Math.floor(Math.random() * 3)]
                    }}
                  />
              ))}
           </div>
        )}

      </div>
    </div>
  );
};

const NavButton: React.FC<{ icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }> = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center gap-1 w-full py-3 rounded-xl transition-all ${active ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-800 hover:bg-slate-50'}`}
  >
    {icon}
    <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'text-blue-700' : 'text-slate-400'}`}>{label}</span>
  </button>
);

export default FamilyWallDashboard;
