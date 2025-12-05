import React, { useState } from 'react';
import { User, Chore, Reward, UserRole, TimeOfDay, ChoreFrequency } from '../types';
import { Calendar as CalIcon, CheckSquare, Settings, Sparkles, Plus, Loader2, Trash2, UserPlus, Save, Clock, Repeat, MoreVertical, Edit, Copy } from 'lucide-react';
import { generateChoreIcon } from '../services/geminiService';

interface ParentPortalProps {
  familyName: string;
  users: User[];
  chores: Chore[];
  rewards: Reward[];
  onAddChore: (chore: Omit<Chore, 'id'>) => void;
  onUpdateChore: (chore: Chore) => void;
  onDeleteChore: (id: string) => void;
  onApproveReward: (id: string) => void;
  onUpdateFamilyName: (name: string) => void;
  onAddUser: (name: string, role: UserRole) => void;
  onDeleteUser: (id: string) => void;
}

const ParentPortal: React.FC<ParentPortalProps> = ({ 
  familyName, users, chores, rewards, 
  onAddChore, onUpdateChore, onDeleteChore, onApproveReward, 
  onUpdateFamilyName, onAddUser, onDeleteUser 
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'chores' | 'rewards' | 'settings'>('overview');
  
  // Settings Form State
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.KID);
  const [editingFamilyName, setEditingFamilyName] = useState(familyName);

  // New Chore Form State
  const [isCreatingChore, setIsCreatingChore] = useState(false);
  const [editingChoreId, setEditingChoreId] = useState<string | null>(null);
  
  const [choreTitle, setChoreTitle] = useState('');
  const [choreDesc, setChoreDesc] = useState('');
  const [selectedKids, setSelectedKids] = useState<Set<string>>(new Set());
  const [kidPoints, setKidPoints] = useState<Record<string, number>>({});
  const [frequency, setFrequency] = useState<ChoreFrequency>('daily');
  const [freqConfig, setFreqConfig] = useState('all'); // all, weekdays, monday, 1, etc.
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('all_day');
  const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);
  const [activeMenuChoreId, setActiveMenuChoreId] = useState<string | null>(null);

  const kids = users.filter(u => u.role === UserRole.KID);
  const wishlistItems = rewards.filter(r => r.requestedBy && !r.approved);

  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(newName.trim()) {
      onAddUser(newName, newRole);
      setNewName('');
    }
  };

  const handleKidSelection = (kidId: string) => {
    const newSelection = new Set(selectedKids);
    if (newSelection.has(kidId)) {
        newSelection.delete(kidId);
        const newPoints = { ...kidPoints };
        delete newPoints[kidId];
        setKidPoints(newPoints);
    } else {
        newSelection.add(kidId);
        setKidPoints({ ...kidPoints, [kidId]: 50 }); // Default points
    }
    setSelectedKids(newSelection);
  };

  const handlePointChange = (kidId: string, points: number) => {
      setKidPoints({ ...kidPoints, [kidId]: points });
  };

  const resetForm = () => {
      setChoreTitle('');
      setChoreDesc('');
      setSelectedKids(new Set());
      setKidPoints({});
      setFrequency('daily');
      setFreqConfig('all');
      setTimeOfDay('all_day');
      setEditingChoreId(null);
      setIsCreatingChore(false);
  };

  const handleEditChore = (chore: Chore) => {
      setEditingChoreId(chore.id);
      setChoreTitle(chore.title);
      setChoreDesc(chore.description || '');
      setFrequency(chore.frequency);
      setFreqConfig(chore.frequencyConfig);
      setTimeOfDay(chore.timeOfDay);
      
      const kidsSet = new Set<string>();
      const pointsMap: Record<string, number> = {};
      
      chore.assignments.forEach(a => {
          kidsSet.add(a.userId);
          pointsMap[a.userId] = a.points;
      });
      
      setSelectedKids(kidsSet);
      setKidPoints(pointsMap);
      
      setIsCreatingChore(true);
      setActiveMenuChoreId(null);
  };

  const handleDuplicateChore = (chore: Chore) => {
      onAddChore({
          ...chore,
          title: `${chore.title} (Copy)`,
          completedBy: []
      });
      setActiveMenuChoreId(null);
  };

  const handleSaveChore = async () => {
      if (!choreTitle.trim() || selectedKids.size === 0) {
          alert("Please enter a title and select at least one kid.");
          return;
      }

      let iconSvg = '';
      
      // Only generate new icon if title changed or it's a new chore without a pre-existing icon
      // For editing, we check if title is different from existing, or if we force regeneration
      // For simplicity here, we always regenerate on new, and regenerate on edit if we want, 
      // but let's assume we keep old icon if editing unless we want to change it.
      // To keep it simple: always generate on create. On edit, if title changed significantly? 
      // Let's just generate on create, and reuse on edit if not fetched.
      
      // However, the state doesn't hold the old icon in form. 
      // Let's re-generate if it's new, OR reuse if editing and we want to preserve?
      // Actually, let's just generate if creating. If editing, we find original chore.
      
      const existingChore = chores.find(c => c.id === editingChoreId);
      
      if (editingChoreId && existingChore && existingChore.title === choreTitle) {
           iconSvg = existingChore.icon;
      } else {
           setIsGeneratingIcon(true);
           iconSvg = await generateChoreIcon(choreTitle);
           setIsGeneratingIcon(false);
      }

      const assignments = Array.from(selectedKids).map(kidId => ({
          userId: kidId,
          points: kidPoints[kidId] || 0
      }));

      const choreData = {
          title: choreTitle,
          description: choreDesc,
          assignments,
          frequency,
          frequencyConfig: freqConfig,
          timeOfDay,
          completedBy: [],
          dueDate: new Date().toISOString(),
          icon: iconSvg
      };

      if (editingChoreId && existingChore) {
          onUpdateChore({
              ...existingChore,
              ...choreData,
              icon: iconSvg || existingChore.icon // Fallback
          });
      } else {
          onAddChore(choreData);
      }

      resetForm();
  };

  // Helper to render frequency config inputs
  const renderFreqConfig = () => {
      if (frequency === 'daily') {
          return (
              <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                      <input type="radio" name="dailyConfig" checked={freqConfig === 'all'} onChange={() => setFreqConfig('all')} />
                      <span className="text-sm">Every Day</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                      <input type="radio" name="dailyConfig" checked={freqConfig === 'weekdays'} onChange={() => setFreqConfig('weekdays')} />
                      <span className="text-sm">Weekdays Only</span>
                  </label>
              </div>
          );
      }
      if (frequency === 'weekly') {
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          return (
              <div className="mt-2">
                  <label className="text-xs text-slate-500 font-bold uppercase">Select Day</label>
                  <select 
                    value={freqConfig} 
                    onChange={(e) => setFreqConfig(e.target.value)}
                    className="block w-full mt-1 p-2 border border-slate-300 rounded-lg"
                  >
                      {days.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
              </div>
          );
      }
      if (frequency === 'monthly') {
          return (
            <div className="mt-2 grid grid-cols-2 gap-4">
                <div>
                     <label className="text-xs text-slate-500 font-bold uppercase">Day of Month (1-31)</label>
                     <input 
                        type="number" 
                        min="1" 
                        max="31" 
                        value={freqConfig} 
                        onChange={(e) => setFreqConfig(e.target.value)} 
                        className="block w-full mt-1 p-2 border border-slate-300 rounded-lg"
                     />
                </div>
            </div>
          );
      }
  };

  return (
    <div className="flex h-full bg-slate-100">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-slate-300 flex flex-col p-4 hidden md:flex">
        <div className="mb-10 px-2 pt-4">
          <h2 className="text-xl font-bold text-white tracking-tight truncate">{familyName}</h2>
          <p className="text-xs text-slate-500 mt-1">Parent Command Center</p>
        </div>
        
        <nav className="space-y-2 flex-1">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'overview' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <CalIcon size={20} /> Overview
          </button>
          <button 
            onClick={() => setActiveTab('chores')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'chores' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <CheckSquare size={20} /> Chores Management
          </button>
          <button 
            onClick={() => setActiveTab('rewards')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'rewards' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Sparkles size={20} /> Rewards
            {wishlistItems.length > 0 && (
               <span className="ml-auto bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{wishlistItems.length}</span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Settings size={20} /> Settings
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800">
           <p className="text-xs text-center opacity-40">Connected as Parent</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        
        {activeTab === 'overview' && (
           <div className="space-y-6">
              <h2 className="text-3xl font-bold text-slate-800">Family Overview</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 {kids.map(kid => (
                   <div key={kid.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                      <div className="flex items-center gap-4 mb-4">
                        <img src={kid.avatar} className="w-12 h-12 rounded-full" alt={kid.name}/>
                        <div>
                          <h3 className="font-bold text-lg">{kid.name}</h3>
                          <p className="text-sm text-slate-500">Kid Account</p>
                        </div>
                      </div>
                      <div className="flex justify-between items-end">
                        <div>
                           <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Current Points</p>
                           <p className="text-3xl font-black text-blue-600">{kid.points}</p>
                        </div>
                        <div className="text-right">
                           <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Lifetime</p>
                           <p className="text-lg font-bold text-slate-700">{kid.totalPointsEarned}</p>
                        </div>
                      </div>
                   </div>
                 ))}
                 {kids.length === 0 && (
                   <div className="bg-slate-50 p-6 rounded-2xl border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                     No kid accounts yet. Go to Settings to add them.
                   </div>
                 )}
              </div>
           </div>
        )}

        {activeTab === 'chores' && (
          <div className="space-y-8">
             {/* Header / Add Button */}
             <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Chore Management</h2>
                    <p className="text-slate-500">Create tasks and assign them to your kids.</p>
                </div>
                <button 
                    onClick={() => { resetForm(); setIsCreatingChore(!isCreatingChore); }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"
                >
                    {isCreatingChore ? 'Cancel' : <><Plus size={20} /> Add New Chore</>}
                </button>
             </div>

             {/* Add/Edit Chore Form */}
             {isCreatingChore && (
                 <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200 animate-in fade-in slide-in-from-top-4">
                     <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-slate-800">
                            {editingChoreId ? 'Edit Chore' : 'Create New Chore'}
                        </h3>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         {/* Left Column: Basic Info */}
                         <div className="space-y-6">
                             <div>
                                 <label className="block text-sm font-bold text-slate-700 mb-2">Chore Title</label>
                                 <input 
                                     type="text" 
                                     value={choreTitle}
                                     onChange={(e) => setChoreTitle(e.target.value)}
                                     placeholder="e.g. Make Bed, Wash Dishes"
                                     className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                 />
                                 <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                     <Sparkles size={12}/> AI will generate a unique icon for this task.
                                 </p>
                             </div>
                             <div>
                                 <label className="block text-sm font-bold text-slate-700 mb-2">Description (Optional)</label>
                                 <textarea 
                                     value={choreDesc}
                                     onChange={(e) => setChoreDesc(e.target.value)}
                                     placeholder="e.g. Put pillows in place and fold blanket"
                                     className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none h-24"
                                 />
                             </div>
                             
                             {/* Time of Day */}
                             <div>
                                 <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                                     <Clock size={16} className="text-slate-400"/> Time of Day
                                 </label>
                                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                     {(['morning', 'afternoon', 'evening', 'all_day'] as const).map(t => (
                                         <button 
                                             key={t}
                                             onClick={() => setTimeOfDay(t)}
                                             className={`px-2 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${timeOfDay === t ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                         >
                                             {t.replace('_', ' ')}
                                         </button>
                                     ))}
                                 </div>
                             </div>
                         </div>

                         {/* Right Column: Assignment & Frequency */}
                         <div className="space-y-6">
                             {/* Assignments */}
                             <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                 <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                     <UserPlus size={16} className="text-slate-400"/> Assign To & Set Points
                                 </label>
                                 <div className="space-y-3">
                                     {kids.length === 0 && <p className="text-sm text-red-500">No kids found. Add them in settings.</p>}
                                     {kids.map(kid => (
                                         <div key={kid.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                                             <div className="flex items-center gap-3">
                                                 <input 
                                                     type="checkbox" 
                                                     checked={selectedKids.has(kid.id)}
                                                     onChange={() => handleKidSelection(kid.id)}
                                                     className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                                                 />
                                                 <span className="font-medium text-slate-700">{kid.name}</span>
                                             </div>
                                             {selectedKids.has(kid.id) && (
                                                 <div className="flex items-center gap-2">
                                                     <input 
                                                         type="number" 
                                                         value={kidPoints[kid.id]}
                                                         onChange={(e) => handlePointChange(kid.id, parseInt(e.target.value) || 0)}
                                                         className="w-20 px-2 py-1 border border-slate-300 rounded text-right"
                                                     />
                                                     <span className="text-xs text-slate-500 font-bold">PTS</span>
                                                 </div>
                                             )}
                                         </div>
                                     ))}
                                 </div>
                             </div>

                             {/* Frequency */}
                             <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                 <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                     <Repeat size={16} className="text-slate-400"/> Frequency
                                 </label>
                                 <div className="flex gap-2">
                                     {(['daily', 'weekly', 'monthly'] as const).map(f => (
                                         <button 
                                             key={f}
                                             onClick={() => { setFrequency(f); setFreqConfig(f === 'weekly' ? 'Monday' : (f === 'monthly' ? '1' : 'all')); }}
                                             className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${frequency === f ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                         >
                                             {f}
                                         </button>
                                     ))}
                                 </div>
                                 {renderFreqConfig()}
                             </div>
                         </div>
                     </div>
                     
                     <div className="mt-8 flex justify-end gap-4 border-t border-slate-100 pt-6">
                         <button 
                             onClick={resetForm}
                             className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100"
                         >
                             Cancel
                         </button>
                         <button 
                             onClick={handleSaveChore}
                             disabled={isGeneratingIcon}
                             className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-70"
                         >
                             {isGeneratingIcon ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                             {editingChoreId ? 'Update Chore' : 'Save Chore'}
                         </button>
                     </div>
                 </div>
             )}

             {/* Existing Chores List */}
             <div className="bg-white p-6 rounded-2xl border border-slate-200 min-h-[400px]">
                <h3 className="text-xl font-bold mb-6 text-slate-800">Active Chores List</h3>
                <div className="overflow-visible"> 
                   <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100">
                           <th className="pb-3 text-slate-400 font-medium text-sm pl-4 w-16">Icon</th>
                           <th className="pb-3 text-slate-400 font-medium text-sm">Chore</th>
                           <th className="pb-3 text-slate-400 font-medium text-sm">Frequency</th>
                           <th className="pb-3 text-slate-400 font-medium text-sm">Assigned To</th>
                           <th className="pb-3 text-slate-400 font-medium text-sm text-right pr-4 w-16">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                         {chores.map(chore => (
                           <tr key={chore.id} className="group hover:bg-slate-50">
                              <td className="py-4 pl-4 align-top">
                                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center p-2" dangerouslySetInnerHTML={{ __html: chore.icon }} />
                              </td>
                              <td className="py-4 font-medium text-slate-700 align-top">
                                  {chore.title}
                                  <div className="text-xs text-slate-400 capitalize">{chore.timeOfDay.replace('_', ' ')}</div>
                              </td>
                              <td className="py-4 text-slate-600 text-sm align-top">
                                  <span className="capitalize font-medium">{chore.frequency}</span>
                                  <span className="text-slate-400 block text-xs">
                                      {chore.frequencyConfig === 'all' ? 'Every Day' : chore.frequencyConfig}
                                  </span>
                              </td>
                              <td className="py-4 align-top">
                                <div className="flex flex-col gap-1">
                                   {chore.assignments.map(a => {
                                       const user = users.find(u => u.id === a.userId);
                                       if (!user) return null;
                                       return (
                                           <div key={a.userId} className="flex items-center gap-2 text-sm">
                                               <img src={user.avatar} className="w-5 h-5 rounded-full" alt={user.name}/>
                                               <span className="text-slate-600">{user.name} <span className="text-slate-400 text-xs">({a.points} pts)</span></span>
                                           </div>
                                       );
                                   })}
                                </div>
                              </td>
                              <td className="py-4 text-right pr-4 align-top relative">
                                <button 
                                  onClick={() => setActiveMenuChoreId(activeMenuChoreId === chore.id ? null : chore.id)}
                                  className={`p-2 rounded-lg transition-colors ${activeMenuChoreId === chore.id ? 'bg-blue-100 text-blue-600' : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'}`}
                                >
                                  <MoreVertical size={18} />
                                </button>
                                
                                {/* Dropdown Menu */}
                                {activeMenuChoreId === chore.id && (
                                    <div className="absolute right-8 top-12 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                        <button 
                                            onClick={() => handleEditChore(chore)}
                                            className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50"
                                        >
                                            <Edit size={16} className="text-blue-500"/> Edit Task
                                        </button>
                                        <button 
                                            onClick={() => handleDuplicateChore(chore)}
                                            className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50"
                                        >
                                            <Copy size={16} className="text-purple-500"/> Duplicate
                                        </button>
                                        <button 
                                            onClick={() => onDeleteChore(chore.id)}
                                            className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                                        >
                                            <Trash2 size={16} /> Delete
                                        </button>
                                    </div>
                                )}
                              </td>
                           </tr>
                         ))}
                         {chores.length === 0 && (
                           <tr>
                             <td colSpan={5} className="py-8 text-center text-slate-400 italic">No chores created yet.</td>
                           </tr>
                         )}
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'rewards' && (
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-lg mb-4 text-slate-800">Pending Approvals</h3>
                {wishlistItems.length === 0 ? (
                  <p className="text-slate-400 italic py-4">No pending requests.</p>
                ) : (
                  <div className="space-y-3">
                    {wishlistItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-slate-50 p-4 rounded-xl">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-slate-200">
                             <img src={users.find(u => u.id === item.requestedBy)?.avatar} className="w-8 h-8 rounded-full" />
                           </div>
                           <div>
                              <p className="font-bold text-slate-800">{item.title}</p>
                              <p className="text-sm text-slate-500">Cost: {item.cost} pts</p>
                           </div>
                        </div>
                        <button 
                          onClick={() => onApproveReward(item.id)}
                          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                        >
                          Approve
                        </button>
                      </div>
                    ))}
                  </div>
                )}
           </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-8 max-w-4xl">
            {/* General Settings */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Settings size={20} className="text-slate-400"/> General
              </h3>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-500 mb-1">Family Name</label>
                  <input 
                    type="text" 
                    value={editingFamilyName}
                    onChange={(e) => setEditingFamilyName(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button 
                  onClick={() => onUpdateFamilyName(editingFamilyName)}
                  className="px-6 py-2.5 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 flex items-center gap-2"
                >
                  <Save size={18} /> Save
                </button>
              </div>
            </div>

            {/* User Management */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <UserPlus size={20} className="text-slate-400"/> Family Members
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {users.map(user => (
                  <div key={user.id} className="border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <img src={user.avatar} className="w-10 h-10 rounded-full bg-slate-100" />
                        <div>
                          <p className="font-bold text-slate-700">{user.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${user.role === UserRole.PARENT ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {user.role}
                          </span>
                        </div>
                     </div>
                     <button 
                        onClick={() => onDeleteUser(user.id)}
                        className="text-slate-300 hover:text-red-500 p-2"
                        title="Remove User"
                     >
                       <Trash2 size={16} />
                     </button>
                  </div>
                ))}
              </div>

              <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                 <h4 className="font-bold text-slate-700 mb-4">Add New Member</h4>
                 <form onSubmit={handleAddUserSubmit} className="flex flex-col md:flex-row gap-4">
                    <input 
                      type="text" 
                      placeholder="Name (e.g., Mom, Leo)" 
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="flex-1 px-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select 
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as UserRole)}
                      className="px-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value={UserRole.KID}>Kid</option>
                      <option value={UserRole.PARENT}>Parent</option>
                    </select>
                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">
                      Add Member
                    </button>
                 </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentPortal;