
import React, { useState } from 'react';
import { User, Chore, Reward, UserRole, TimeOfDay, ChoreFrequency, ChoreLog } from '../types';
import { Calendar as CalIcon, CheckSquare, Settings, Plus, Trash2, UserPlus, Save, Clock, Repeat, MoreVertical, Edit, Copy, BarChart2, TrendingUp, History, Gift, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

interface ParentPortalProps {
  familyName: string;
  users: User[];
  chores: Chore[];
  choreHistory?: ChoreLog[];
  rewards: Reward[];
  onAddChore: (chore: Omit<Chore, 'id'>) => void;
  onUpdateChore: (chore: Chore) => void;
  onDeleteChore: (id: string) => void;
  onApproveReward: (id: string) => void;
  onUpdateFamilyName: (name: string) => void;
  onAddUser: (name: string, role: UserRole) => void;
  onDeleteUser: (id: string) => void;
  onAddReward: (reward: Reward) => void;
  onDeleteReward: (id: string) => void;
  onRedeemSharedReward: (id: string) => void;
}

// ... (Keep existing CHORE_ICONS array) ...
const CHORE_ICONS = [
  { name: 'Sparkles', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>' },
  { name: 'Trash', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>' },
  { name: 'Bed', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>' },
  { name: 'Dishes', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3"/><path d="M21 15v6"/></svg>' },
  { name: 'Laundry', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.4a2 2 0 0 0-2-1.8H5.62a2 2 0 0 0-2 1.8L2 19.8c-.1.7.5 1.2 1.2 1.2h17.6c.7 0 1.3-.5 1.2-1.2z"/><path d="M12 7v5"/><path d="M9 15h6"/></svg>' },
  { name: 'Toys', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>' },
  { name: 'Study', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>' },
  { name: 'Pet', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.28 3.6-1.28 5.14 0 .34.66-.41 1.48-1.5 2.44-3.36 2.05-6.3 3.8-6.64 4.05-.14.1-.28.1-.4.07a1 1 0 0 1-.36-.07c-.34-.25-3.28-2-6.64-4.05-1.09-.96-1.84-1.78-1.5-2.44 1.54-1.28 3.65-1.28 5.14 0 1.54 1.28 2.5 3 2.5 3s.96-1.72 2.5-3z"/></svg>' },
  { name: 'Garden', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v2a6 6 0 0 1-6 6h12a6 6 0 0 0-6-6V2"/><path d="M10 10v4"/><path d="M4 22h12"/></svg>' },
  { name: 'Car', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>' }
];

const ParentPortal: React.FC<ParentPortalProps> = ({ 
  familyName, users, chores, rewards, choreHistory = [],
  onAddChore, onUpdateChore, onDeleteChore, onApproveReward, 
  onUpdateFamilyName, onAddUser, onDeleteUser, onAddReward, onDeleteReward, onRedeemSharedReward
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'chores' | 'rewards' | 'settings' | 'history'>('overview');
  
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
  const [freqConfig, setFreqConfig] = useState('all');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('all_day');
  const [selectedIcon, setSelectedIcon] = useState<string>(CHORE_ICONS[0].svg);
  const [activeMenuChoreId, setActiveMenuChoreId] = useState<string | null>(null);

  // New Reward Form State
  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardCost, setRewardCost] = useState(100);
  const [isSharedReward, setIsSharedReward] = useState(false);
  const [isCreatingReward, setIsCreatingReward] = useState(false);

  const kids = users.filter(u => u.role === UserRole.KID);
  const wishlistItems = rewards.filter(r => r.requestedBy && !r.approved);
  const parentCreatedRewards = rewards.filter(r => !r.requestedBy);

  // ... (Keep existing form handlers: handleAddUserSubmit, handleKidSelection, etc.) ...
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
        setKidPoints({ ...kidPoints, [kidId]: 50 });
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
      setSelectedIcon(CHORE_ICONS[0].svg);
      setIsCreatingChore(false);
  };

  const handleEditChore = (chore: Chore) => {
      setEditingChoreId(chore.id);
      setChoreTitle(chore.title);
      setChoreDesc(chore.description || '');
      setFrequency(chore.frequency);
      setFreqConfig(chore.frequencyConfig);
      setTimeOfDay(chore.timeOfDay);
      setSelectedIcon(chore.icon);
      
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

  const handleSaveChore = () => {
      if (!choreTitle.trim() || selectedKids.size === 0) {
          alert("Please enter a title and select at least one kid.");
          return;
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
          icon: selectedIcon
      };
      const existingChore = chores.find(c => c.id === editingChoreId);
      if (editingChoreId && existingChore) {
          onUpdateChore({ ...existingChore, ...choreData });
      } else {
          onAddChore(choreData);
      }
      resetForm();
  };
  
  const handleSaveReward = () => {
      if (!rewardTitle.trim()) return;
      onAddReward({
          id: `r-${Date.now()}`,
          title: rewardTitle,
          cost: rewardCost,
          approved: true,
          image: `https://ui-avatars.com/api/?name=${encodeURIComponent(rewardTitle)}&background=random`,
          isShared: isSharedReward
      });
      setRewardTitle('');
      setRewardCost(100);
      setIsSharedReward(false);
      setIsCreatingReward(false);
  };

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
                  <select value={freqConfig} onChange={(e) => setFreqConfig(e.target.value)} className="block w-full mt-1 p-2 border border-slate-300 rounded-lg">
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
                     <input type="number" min="1" max="31" value={freqConfig} onChange={(e) => setFreqConfig(e.target.value)} className="block w-full mt-1 p-2 border border-slate-300 rounded-lg"/>
                </div>
            </div>
          );
      }
  };

  const getWeeklyPointsData = () => {
     const dates = Array.from({length: 7}, (_, i) => {
         const d = new Date();
         d.setDate(d.getDate() - (6 - i));
         return d.toISOString().split('T')[0];
     });
     return dates.map(date => {
         const entry: any = { date: new Date(date).toLocaleDateString('en-US', {weekday: 'short'}) };
         kids.forEach(kid => {
             const points = choreHistory
                .filter(log => log.date === date && log.userId === kid.id)
                .reduce((sum, log) => sum + log.points, 0);
             entry[kid.name] = points;
         });
         return entry;
     });
  };

  const getRecentLogs = () => {
      return [...choreHistory].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
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
          <button onClick={() => setActiveTab('overview')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'overview' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><CalIcon size={20} /> Overview</button>
          <button onClick={() => setActiveTab('history')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><BarChart2 size={20} /> History & Analytics</button>
          <button onClick={() => setActiveTab('chores')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'chores' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><CheckSquare size={20} /> Chores Management</button>
          <button onClick={() => setActiveTab('rewards')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'rewards' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><Gift size={20} /> Rewards {wishlistItems.length > 0 && (<span className="ml-auto bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{wishlistItems.length}</span>)}</button>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}><Settings size={20} /> Settings</button>
        </nav>
        <div className="mt-auto pt-6 border-t border-slate-800"><p className="text-xs text-center opacity-40">Connected as Parent</p></div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        
        {/* ... (Keep Overview, History tabs as previously defined) ... */}
        {activeTab === 'overview' && (
           <div className="space-y-6">
              <h2 className="text-3xl font-bold text-slate-800">Family Overview</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 {kids.map(kid => (
                   <div key={kid.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                      <div className="flex items-center gap-4 mb-4"><img src={kid.avatar} className="w-12 h-12 rounded-full" alt={kid.name}/><div><h3 className="font-bold text-lg">{kid.name}</h3><p className="text-sm text-slate-500">Kid Account</p></div></div>
                      <div className="flex justify-between items-end"><div><p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Current Points</p><p className="text-3xl font-black text-blue-600">{kid.points}</p></div><div className="text-right"><p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Lifetime</p><p className="text-lg font-bold text-slate-700">{kid.totalPointsEarned}</p></div></div>
                   </div>
                 ))}
                 {kids.length === 0 && (<div className="bg-slate-50 p-6 rounded-2xl border border-dashed border-slate-300 flex items-center justify-center text-slate-400">No kid accounts yet. Go to Settings to add them.</div>)}
              </div>
           </div>
        )}

        {activeTab === 'history' && (
            <div className="space-y-8">
                 <div><h2 className="text-2xl font-bold text-slate-800">Analytics & History</h2><p className="text-slate-500">Track chore completion and points over time.</p></div>
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-96">
                        <h3 className="font-bold text-lg text-slate-700 mb-6 flex items-center gap-2"><TrendingUp size={20}/> Points Earned (Last 7 Days)</h3>
                        <ResponsiveContainer width="100%" height="80%">
                            <BarChart data={getWeeklyPointsData()}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                <Legend wrapperStyle={{paddingTop: '20px'}} />
                                {kids.map((kid, index) => (
                                    <Bar key={kid.id} dataKey={kid.name} fill={['#3b82f6', '#ec4899', '#8b5cf6', '#10b981'][index % 4]} radius={[4, 4, 0, 0]} barSize={40} />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="space-y-4">
                        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg"><h4 className="opacity-90 font-medium mb-1">Total Tasks Completed</h4><p className="text-4xl font-black">{choreHistory.length}</p><p className="text-xs opacity-70 mt-2">Since tracking began</p></div>
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><h4 className="text-slate-500 font-bold text-sm uppercase mb-4">Top Earner (All Time)</h4>{kids.length > 0 ? (() => { const topEarner = [...kids].sort((a,b) => b.totalPointsEarned - a.totalPointsEarned)[0]; return (<div className="flex items-center gap-4"><img src={topEarner.avatar} className="w-12 h-12 rounded-full" /><div><p className="font-bold text-xl">{topEarner.name}</p><p className="text-indigo-600 font-bold">{topEarner.totalPointsEarned} pts</p></div></div>) })() : <p className="text-slate-400">No data</p>}</div>
                    </div>
                </div>
            </div>
        )}

        {/* ... (Keep Chores Tab Logic) ... */}
        {activeTab === 'chores' && (
          <div className="space-y-8">
             <div className="flex items-center justify-between"><div><h2 className="text-2xl font-bold text-slate-800">Chore Management</h2><p className="text-slate-500">Create tasks and assign them to your kids.</p></div><button onClick={() => { resetForm(); setIsCreatingChore(!isCreatingChore); }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">{isCreatingChore ? 'Cancel' : <><Plus size={20} /> Add New Chore</>}</button></div>
             {isCreatingChore && (
                 <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200 animate-in fade-in slide-in-from-top-4">
                     {/* ... (Reuse existing Chores Form content) ... */}
                     <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold text-slate-800">{editingChoreId ? 'Edit Chore' : 'Create New Chore'}</h3></div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="space-y-6">
                             <div><label className="block text-sm font-bold text-slate-700 mb-2">Chore Title</label><input type="text" value={choreTitle} onChange={(e) => setChoreTitle(e.target.value)} placeholder="e.g. Make Bed, Wash Dishes" className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"/></div>
                             <div><label className="block text-sm font-bold text-slate-700 mb-2">Select Icon</label><div className="grid grid-cols-5 gap-3">{CHORE_ICONS.map((icon, idx) => (<button key={idx} onClick={() => setSelectedIcon(icon.svg)} className={`p-3 rounded-xl flex items-center justify-center transition-all ${selectedIcon === icon.svg ? 'bg-blue-600 text-white shadow-md scale-105' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`} title={icon.name}><div className="w-6 h-6" dangerouslySetInnerHTML={{ __html: icon.svg }} /></button>))}</div></div>
                             <div><label className="block text-sm font-bold text-slate-700 mb-2">Description (Optional)</label><textarea value={choreDesc} onChange={(e) => setChoreDesc(e.target.value)} placeholder="e.g. Put pillows in place and fold blanket" className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none h-20"/></div>
                             <div><label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><Clock size={16} className="text-slate-400"/> Time of Day</label><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{(['morning', 'afternoon', 'evening', 'all_day'] as const).map(t => (<button key={t} onClick={() => setTimeOfDay(t)} className={`px-2 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${timeOfDay === t ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{t.replace('_', ' ')}</button>))}</div></div>
                         </div>
                         <div className="space-y-6">
                             <div className="bg-slate-50 p-5 rounded-xl border border-slate-200"><label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><UserPlus size={16} className="text-slate-400"/> Assign To & Set Points</label><div className="space-y-3">{kids.length === 0 && <p className="text-sm text-red-500">No kids found. Add them in settings.</p>}{kids.map(kid => (<div key={kid.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200"><div className="flex items-center gap-3"><input type="checkbox" checked={selectedKids.has(kid.id)} onChange={() => handleKidSelection(kid.id)} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300"/><span className="font-medium text-slate-700">{kid.name}</span></div>{selectedKids.has(kid.id) && (<div className="flex items-center gap-2"><input type="number" value={kidPoints[kid.id]} onChange={(e) => handlePointChange(kid.id, parseInt(e.target.value) || 0)} className="w-20 px-2 py-1 border border-slate-300 rounded text-right"/><span className="text-xs text-slate-500 font-bold">PTS</span></div>)}</div>))}</div></div>
                             <div className="bg-slate-50 p-5 rounded-xl border border-slate-200"><label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Repeat size={16} className="text-slate-400"/> Frequency</label><div className="flex gap-2">{(['daily', 'weekly', 'monthly'] as const).map(f => (<button key={f} onClick={() => { setFrequency(f); setFreqConfig(f === 'weekly' ? 'Monday' : (f === 'monthly' ? '1' : 'all')); }} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${frequency === f ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{f}</button>))}</div>{renderFreqConfig()}</div>
                         </div>
                     </div>
                     <div className="mt-8 flex justify-end gap-4 border-t border-slate-100 pt-6"><button onClick={resetForm} className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Cancel</button><button onClick={handleSaveChore} className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-blue-200"><Save size={20} />{editingChoreId ? 'Update Chore' : 'Save Chore'}</button></div>
                 </div>
             )}
             <div className="bg-white p-6 rounded-2xl border border-slate-200 min-h-[400px]">
                <h3 className="text-xl font-bold mb-6 text-slate-800">Active Chores List</h3>
                <div className="overflow-visible"> 
                   <table className="w-full text-left border-collapse">
                      <thead><tr className="border-b border-slate-100"><th className="pb-3 text-slate-400 font-medium text-sm pl-4 w-16">Icon</th><th className="pb-3 text-slate-400 font-medium text-sm">Chore</th><th className="pb-3 text-slate-400 font-medium text-sm">Frequency</th><th className="pb-3 text-slate-400 font-medium text-sm">Assigned To</th><th className="pb-3 text-slate-400 font-medium text-sm text-right pr-4 w-16">Action</th></tr></thead>
                      <tbody className="divide-y divide-slate-50">
                         {chores.map(chore => (
                           <tr key={chore.id} className="group hover:bg-slate-50">
                              <td className="py-4 pl-4 align-top"><div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center p-2" dangerouslySetInnerHTML={{ __html: chore.icon }} /></td>
                              <td className="py-4 font-medium text-slate-700 align-top">{chore.title}<div className="text-xs text-slate-400 capitalize">{chore.timeOfDay.replace('_', ' ')}</div></td>
                              <td className="py-4 text-slate-600 text-sm align-top"><span className="capitalize font-medium">{chore.frequency}</span><span className="text-slate-400 block text-xs">{chore.frequencyConfig === 'all' ? 'Every Day' : chore.frequencyConfig}</span></td>
                              <td className="py-4 align-top"><div className="flex flex-col gap-1">{chore.assignments.map(a => { const user = users.find(u => u.id === a.userId); if (!user) return null; return (<div key={a.userId} className="flex items-center gap-2 text-sm"><img src={user.avatar} className="w-5 h-5 rounded-full" alt={user.name}/><span className="text-slate-600">{user.name} <span className="text-slate-400 text-xs">({a.points} pts)</span></span></div>); })}</div></td>
                              <td className="py-4 text-right pr-4 align-top relative">
                                <button onClick={() => setActiveMenuChoreId(activeMenuChoreId === chore.id ? null : chore.id)} className={`p-2 rounded-lg transition-colors ${activeMenuChoreId === chore.id ? 'bg-blue-100 text-blue-600' : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'}`}><MoreVertical size={18} /></button>
                                {activeMenuChoreId === chore.id && (
                                    <div className="absolute right-8 top-12 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                        <button onClick={() => handleEditChore(chore)} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50"><Edit size={16} className="text-blue-500"/> Edit Task</button>
                                        <button onClick={() => handleDuplicateChore(chore)} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50"><Copy size={16} className="text-purple-500"/> Duplicate</button>
                                        <button onClick={() => onDeleteChore(chore.id)} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"><Trash2 size={16} /> Delete</button>
                                    </div>
                                )}
                              </td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
        )}

        {/* Enhanced Rewards Tab */}
        {activeTab === 'rewards' && (
           <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div><h2 className="text-2xl font-bold text-slate-800">Rewards Center</h2><p className="text-slate-500">Manage wishlist items and create shared goals.</p></div>
                    <button onClick={() => setIsCreatingReward(!isCreatingReward)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"><Plus size={20} /> Create Reward</button>
                </div>

                {isCreatingReward && (
                     <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4">
                         <h3 className="text-lg font-bold mb-4">Create New Reward</h3>
                         <div className="flex gap-4 mb-4">
                             <div className="flex-1"><label className="block text-sm font-bold text-slate-700 mb-1">Title</label><input type="text" value={rewardTitle} onChange={(e) => setRewardTitle(e.target.value)} className="w-full px-4 py-2 border rounded-xl" placeholder="e.g. Pizza Night"/></div>
                             <div className="w-32"><label className="block text-sm font-bold text-slate-700 mb-1">Cost (Pts)</label><input type="number" value={rewardCost} onChange={(e) => setRewardCost(parseInt(e.target.value))} className="w-full px-4 py-2 border rounded-xl"/></div>
                         </div>
                         <div className="mb-6">
                             <label className="flex items-center gap-2 cursor-pointer">
                                 <input type="checkbox" checked={isSharedReward} onChange={(e) => setIsSharedReward(e.target.checked)} className="w-5 h-5 rounded text-blue-600"/>
                                 <span className="font-bold text-slate-700 flex items-center gap-2"><Users size={18}/> Shared Reward (Split cost among all kids)</span>
                             </label>
                             <p className="text-xs text-slate-400 mt-1 ml-7">If checked, the cost will be divided by the number of kids when redeemed.</p>
                         </div>
                         <div className="flex justify-end gap-2">
                             <button onClick={() => setIsCreatingReward(false)} className="px-4 py-2 text-slate-500">Cancel</button>
                             <button onClick={handleSaveReward} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold">Save Reward</button>
                         </div>
                     </div>
                )}

                {/* Pending Wishlist */}
                {wishlistItems.length > 0 && (
                   <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-lg mb-4 text-slate-800">Wishlist Requests (Pending)</h3>
                        <div className="space-y-3">
                            {wishlistItems.map(item => (
                                <div key={item.id} className="flex items-center justify-between bg-yellow-50 p-4 rounded-xl border border-yellow-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-slate-200"><img src={users.find(u => u.id === item.requestedBy)?.avatar} className="w-8 h-8 rounded-full" /></div>
                                        <div><p className="font-bold text-slate-800">{item.title}</p><p className="text-sm text-slate-500">Cost: {item.cost} pts</p></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => onDeleteReward(item.id)} className="px-3 py-1 text-red-500 font-bold hover:bg-red-50 rounded-lg">Deny</button>
                                        <button onClick={() => onApproveReward(item.id)} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors">Approve</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                   </div>
                )}

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-lg mb-4 text-slate-800">Available Rewards</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {parentCreatedRewards.map(reward => (
                            <div key={reward.id} className="border border-slate-200 rounded-xl p-4 flex flex-col relative overflow-hidden group">
                                {reward.isShared && <div className="absolute top-0 right-0 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-bl-xl"><Users size={12} className="inline mr-1"/> Shared</div>}
                                <div className="flex items-center gap-4 mb-4">
                                     <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden"><img src={reward.image} className="w-full h-full object-cover"/></div>
                                     <div>
                                         <h4 className="font-bold text-slate-800">{reward.title}</h4>
                                         <p className="text-sm text-slate-500 font-medium">{reward.cost} pts {reward.isShared && '(Total)'}</p>
                                     </div>
                                </div>
                                <div className="mt-auto flex gap-2">
                                    <button onClick={() => onDeleteReward(reward.id)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                                    {reward.isShared && (
                                        <button onClick={() => onRedeemSharedReward(reward.id)} className="flex-1 bg-blue-100 text-blue-700 hover:bg-blue-200 py-2 rounded-lg font-bold text-sm">Redeem for Group</button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
           </div>
        )}

        {/* ... (Keep Settings Tab) ... */}
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
