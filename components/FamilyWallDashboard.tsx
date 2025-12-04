import React, { useState, useEffect } from 'react';
import { User, CalendarEvent, Chore, Meal, MealType, Photo } from '../types';
import { 
  Calendar, CheckSquare, Settings, Coffee, Utensils, 
  Image as ImageIcon, List, Moon, ChevronLeft, ChevronRight,
  CloudSun, Clock, Play, Pause, RefreshCw, X
} from 'lucide-react';

interface FamilyWallDashboardProps {
  familyName: string;
  users: User[];
  events: CalendarEvent[];
  chores: Chore[];
  meals: Meal[];
  photos: Photo[];
  onSettingsClick: () => void;
  onToggleChore: (id: string) => void;
  onUpdateMeal: (date: string, type: MealType, title: string) => void;
}

const FamilyWallDashboard: React.FC<FamilyWallDashboardProps> = ({ 
  familyName, users, events, chores, meals, photos, onSettingsClick, onToggleChore, onUpdateMeal
}) => {
  const [activeTab, setActiveTab] = useState<'calendar' | 'tasks' | 'meals' | 'photos'>('calendar');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Photo Frame State
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isSynced, setIsSynced] = useState(true);
  const [showSyncModal, setShowSyncModal] = useState(false);

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

  const weekDates = Array.from({ length: 5 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  const getEventsForDate = (date: Date) => {
    return events.filter(e => {
      const eventDate = new Date(e.start);
      return eventDate.getDate() === date.getDate() && 
             eventDate.getMonth() === date.getMonth();
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

  const getDayName = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'short' });
  const getDateNum = (date: Date) => date.getDate();

  return (
    <div className="flex h-screen bg-white font-sans">
      {/* Sidebar */}
      <div className="w-24 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-8 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="mb-2">
           <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold text-xl">
             {familyName.charAt(0)}
           </div>
        </div>

        <nav className="flex-1 flex flex-col gap-6 w-full px-2">
          <NavButton icon={<Calendar size={24} />} label="Calendar" active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
          <NavButton icon={<CheckSquare size={24} />} label="Tasks" active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} />
          <NavButton icon={<Utensils size={24} />} label="Meals" active={activeTab === 'meals'} onClick={() => setActiveTab('meals')} />
          <NavButton icon={<ImageIcon size={24} />} label="Photos" active={activeTab === 'photos'} onClick={() => setActiveTab('photos')} />
          <NavButton icon={<List size={24} />} label="Lists" />
          <NavButton icon={<Moon size={24} />} label="Sleep" />
        </nav>

        <button 
          onClick={onSettingsClick}
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors mt-auto"
        >
          <Settings size={24} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Settings</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
        
        {/* Universal Header (Hidden on Photos mode) */}
        {activeTab !== 'photos' && (
          <header className="px-8 py-5 flex items-center justify-between bg-white border-b border-slate-100">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-serif text-slate-800 tracking-tight">{familyName}</h1>
              <div className="text-slate-400 text-lg font-light flex items-center gap-2">
                 <Clock size={18} />
                 {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2 text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full text-sm">
                  <CloudSun size={18} className="text-orange-400"/>
                  <span>72° Sunny</span>
               </div>
               
               <div className="flex -space-x-2">
                  {users.map(u => (
                    <img key={u.id} src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full border-2 border-white" />
                  ))}
               </div>

               <div className="flex gap-2 ml-4">
                  <button className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><ChevronLeft size={20} /></button>
                  <button className="px-3 py-1 bg-slate-900 text-white rounded-full text-sm font-medium">Today</button>
                  <button className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><ChevronRight size={20} /></button>
               </div>
            </div>
          </header>
        )}

        {/* Calendar View */}
        {activeTab === 'calendar' && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
            <div className="h-full grid grid-cols-5 gap-4 min-w-[800px]">
              {weekDates.map((date, idx) => {
                const isToday = date.getDate() === new Date().getDate();
                const dayEvents = getEventsForDate(date);
                
                return (
                  <div key={idx} className={`flex flex-col h-full rounded-2xl border ${isToday ? 'bg-white border-blue-200 shadow-sm ring-1 ring-blue-100' : 'bg-white border-slate-100'}`}>
                    <div className="p-4 border-b border-slate-50">
                      <p className={`text-2xl font-serif mb-1 ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>{getDayName(date)} <span className="font-sans font-bold">{getDateNum(date)}</span></p>
                      {isToday && <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-wide">Today</span>}
                    </div>
                    <div className="p-3 space-y-3 flex-1 overflow-y-auto">
                      {dayEvents.length === 0 && (
                        <div className="h-full flex items-center justify-center text-slate-300 italic text-sm">
                          No events
                        </div>
                      )}
                      
                      {dayEvents.map(event => (
                        <div key={event.id} className={`p-3 rounded-xl border-l-4 shadow-sm text-sm ${event.color}`}>
                          <p className="font-bold truncate">{event.title}</p>
                          <p className="opacity-80 text-xs mt-1">
                            {new Date(event.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tasks Summary View */}
        {activeTab === 'tasks' && (
           <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
              <h2 className="text-3xl font-serif text-slate-800 mb-8">Today's Chores</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {users.filter(u => u.role === 'KID').map(kid => (
                   <div key={kid.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-100">
                         <img src={kid.avatar} className="w-12 h-12 rounded-full" alt={kid.name}/>
                         <div>
                            <h3 className="font-bold text-lg text-slate-800">{kid.name}</h3>
                            <p className="text-slate-500 text-sm">{kid.points} points available</p>
                         </div>
                      </div>
                      <div className="space-y-3">
                         {chores.filter(c => c.assignedTo === kid.id).map(chore => (
                           <div 
                              key={chore.id} 
                              onClick={() => onToggleChore(chore.id)}
                              className={`flex items-center p-3 rounded-xl border cursor-pointer transition-all ${chore.completed ? 'bg-green-50 border-green-200 opacity-60' : 'hover:bg-slate-50 border-slate-100'}`}
                           >
                              <div className={`w-6 h-6 rounded-full border-2 mr-4 flex items-center justify-center ${chore.completed ? 'bg-green-500 border-green-500' : 'border-slate-300'}`}>
                                 {chore.completed && <CheckSquare size={14} className="text-white" />}
                              </div>
                              <div className="flex-1">
                                 <p className={`font-medium ${chore.completed ? 'line-through text-slate-500' : 'text-slate-700'}`}>{chore.title}</p>
                              </div>
                              <span className="text-xs font-bold text-slate-400">+{chore.points}</span>
                           </div>
                         ))}
                         {chores.filter(c => c.assignedTo === kid.id).length === 0 && (
                            <p className="text-center text-slate-400 py-4 italic">No chores assigned today!</p>
                         )}
                      </div>
                   </div>
                ))}
                {users.filter(u => u.role === 'KID').length === 0 && (
                   <div className="col-span-2 text-center text-slate-400 py-10 bg-white rounded-2xl">
                     No kid accounts found. Please add them in Settings.
                   </div>
                )}
              </div>
           </div>
        )}

        {/* Meals View */}
        {activeTab === 'meals' && (
           <div className="flex-1 overflow-x-auto overflow-y-auto p-6">
              <h2 className="text-3xl font-serif text-slate-800 mb-6">Weekly Menu</h2>
              <div className="min-w-[1000px] grid grid-cols-6 gap-0 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                 
                 {/* Header Row */}
                 <div className="p-4 bg-slate-50 border-b border-r border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-sm flex items-center justify-center">
                    Meal Type
                 </div>
                 {weekDates.map((date, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-center">
                       {getDayName(date)} <br/>
                       <span className="text-slate-400 font-normal">{getDateNum(date)}</span>
                    </div>
                 ))}

                 {/* Breakfast Row */}
                 <div className="p-4 bg-orange-50/50 border-r border-b border-slate-100 font-bold text-orange-800 flex items-center gap-2">
                    <Coffee size={18} /> Breakfast
                 </div>
                 {weekDates.map((date, idx) => (
                    <div 
                      key={`b-${idx}`} 
                      onClick={() => handleMealEdit(date, 'breakfast', getMeal(date, 'breakfast'))}
                      className="p-4 border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors flex items-center justify-center text-center text-sm text-slate-600 relative group"
                    >
                       {getMeal(date, 'breakfast') || <span className="opacity-20 italic">Add...</span>}
                    </div>
                 ))}

                 {/* Lunch Row */}
                 <div className="p-4 bg-green-50/50 border-r border-b border-slate-100 font-bold text-green-800 flex items-center gap-2">
                    <Utensils size={18} /> Lunch
                 </div>
                 {weekDates.map((date, idx) => (
                    <div 
                      key={`l-${idx}`} 
                      onClick={() => handleMealEdit(date, 'lunch', getMeal(date, 'lunch'))}
                      className="p-4 border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors flex items-center justify-center text-center text-sm text-slate-600 group"
                    >
                       {getMeal(date, 'lunch') || <span className="opacity-20 italic">Add...</span>}
                    </div>
                 ))}

                 {/* Dinner Row */}
                 <div className="p-4 bg-indigo-50/50 border-r border-slate-100 font-bold text-indigo-800 flex items-center gap-2">
                    <Moon size={18} /> Dinner
                 </div>
                 {weekDates.map((date, idx) => (
                    <div 
                      key={`d-${idx}`} 
                      onClick={() => handleMealEdit(date, 'dinner', getMeal(date, 'dinner'))}
                      className="p-4 border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors flex items-center justify-center text-center text-sm text-slate-600 font-medium group"
                    >
                       {getMeal(date, 'dinner') || <span className="opacity-20 italic">Add...</span>}
                    </div>
                 ))}
              </div>
              <p className="mt-4 text-slate-400 text-sm text-center">Tap any meal slot to edit the menu.</p>
           </div>
        )}

        {/* Photo Frame View */}
        {activeTab === 'photos' && (
           <div className="flex-1 relative bg-black flex flex-col items-center justify-center overflow-hidden group">
              {/* Main Photo */}
              {isSynced && photos.length > 0 ? (
                <>
                  <div className="absolute inset-0 z-0">
                    <img 
                      src={photos[currentPhotoIdx].url} 
                      alt="Slideshow" 
                      className="w-full h-full object-cover opacity-30 blur-3xl scale-110" 
                    />
                  </div>
                  <img 
                    src={photos[currentPhotoIdx].url} 
                    alt="Slideshow" 
                    className="max-h-full max-w-full z-10 shadow-2xl rounded-sm" 
                  />
                  <div className="absolute bottom-10 left-10 z-20 text-white/90 drop-shadow-md">
                     <p className="text-2xl font-serif">{photos[currentPhotoIdx].location}</p>
                     <p className="text-sm opacity-70">{new Date(photos[currentPhotoIdx].date).toLocaleDateString()}</p>
                  </div>
                </>
              ) : (
                <div className="text-center z-10 text-white/50">
                   <ImageIcon size={64} className="mx-auto mb-4 opacity-30"/>
                   <h3 className="text-2xl font-light mb-2">No photos connected</h3>
                   <button 
                      onClick={() => setShowSyncModal(true)}
                      className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full font-medium transition-all flex items-center gap-2 mx-auto"
                   >
                     <RefreshCw size={18} /> Connect Google Photos
                   </button>
                </div>
              )}

              {/* Controls Overlay (Visible on hover) */}
              <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity z-30">
                 <div className="bg-black/30 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-medium">
                    {currentPhotoIdx + 1} / {Math.max(1, photos.length)}
                 </div>
                 <div className="flex gap-2">
                    <button onClick={() => setIsPlaying(!isPlaying)} className="p-3 bg-black/30 hover:bg-black/50 text-white rounded-full backdrop-blur-md">
                       {isPlaying ? <Pause size={20}/> : <Play size={20}/>}
                    </button>
                    {!isSynced && (
                      <button onClick={() => setShowSyncModal(true)} className="p-3 bg-blue-600/80 hover:bg-blue-600 text-white rounded-full backdrop-blur-md">
                        <Settings size={20}/>
                      </button>
                    )}
                 </div>
              </div>
              
              {/* Navigation Zones */}
              <div className="absolute top-0 left-0 h-full w-1/4 z-20 cursor-w-resize" onClick={() => setCurrentPhotoIdx(prev => prev === 0 ? photos.length - 1 : prev - 1)}></div>
              <div className="absolute top-0 right-0 h-full w-1/4 z-20 cursor-e-resize" onClick={() => setCurrentPhotoIdx(prev => (prev + 1) % photos.length)}></div>

              {/* Sync Modal */}
              {showSyncModal && (
                 <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-8 text-center relative">
                       <button onClick={() => setShowSyncModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800"><X/></button>
                       <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                          <ImageIcon size={32} />
                       </div>
                       <h3 className="text-2xl font-bold text-slate-800 mb-2">Connect Google Photos</h3>
                       <p className="text-slate-500 mb-8">Access your family albums to display on the wall.</p>
                       <button 
                          onClick={handleSyncPhotos}
                          className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-3 px-4 rounded-xl transition-all"
                       >
                         <svg className="w-5 h-5" viewBox="0 0 24 24">
                           <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                           <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                           <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                           <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                         </svg>
                         Link Google Account
                       </button>
                    </div>
                 </div>
              )}
           </div>
        )}
      </div>
    </div>
  );
};

const NavButton: React.FC<{ icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }> = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center gap-1 w-full py-3 rounded-xl transition-all ${active ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
  >
    {icon}
    <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
  </button>
);

export default FamilyWallDashboard;