import React, { useState } from 'react';
import { User, Chore, Reward, CalendarEvent, UserRole } from '../types';
import { Calendar as CalIcon, CheckSquare, Settings, Sparkles, Plus, Loader2 } from 'lucide-react';
import { suggestChores, AIChoreSuggestion } from '../services/geminiService';

interface ParentPortalProps {
  users: User[];
  chores: Chore[];
  rewards: Reward[];
  onAddChore: (chore: Omit<Chore, 'id'>) => void;
  onApproveReward: (id: string) => void;
}

const ParentPortal: React.FC<ParentPortalProps> = ({ users, chores, rewards, onAddChore, onApproveReward }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'chores' | 'rewards'>('overview');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AIChoreSuggestion[]>([]);
  
  const kids = users.filter(u => u.role === UserRole.KID);
  const wishlistItems = rewards.filter(r => r.requestedBy && !r.approved);

  const handleAiSuggest = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    const suggestions = await suggestChores(aiPrompt);
    setAiSuggestions(suggestions);
    setIsGenerating(false);
  };

  const addSuggestion = (s: AIChoreSuggestion, kidId: string) => {
    onAddChore({
      title: s.title,
      description: s.description,
      points: s.points,
      assignedTo: kidId,
      recurrence: 'once',
      completed: false,
      dueDate: new Date().toISOString(),
      icon: 'star'
    });
    // Remove from list after adding
    setAiSuggestions(prev => prev.filter(p => p.title !== s.title));
  };

  return (
    <div className="flex h-full bg-slate-100">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-slate-300 flex flex-col p-4 hidden md:flex">
        <div className="mb-10 px-2 pt-4">
          <h2 className="text-2xl font-bold text-white tracking-tight">Family<span className="text-blue-400">Sync</span></h2>
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
            <CheckSquare size={20} /> Chores & AI
          </button>
          <button 
            onClick={() => setActiveTab('rewards')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'rewards' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Settings size={20} /> Rewards
            {wishlistItems.length > 0 && (
               <span className="ml-auto bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{wishlistItems.length}</span>
            )}
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800">
           <p className="text-xs text-center opacity-40">Connected as Parent</p>
        </div>
      </div>

      {/* Mobile Nav Placeholder (Simplified for demo) */}
      
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
              </div>
              
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-lg mb-4 text-slate-800">Pending Approvals</h3>
                {wishlistItems.length === 0 ? (
                  <p className="text-slate-400 italic">No pending requests.</p>
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
           </div>
        )}

        {activeTab === 'chores' && (
          <div className="space-y-8">
             <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-200">
                <div className="flex items-start gap-4 mb-6">
                   <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                     <Sparkles size={32} />
                   </div>
                   <div>
                     <h3 className="text-2xl font-bold">Magic Chore Creator</h3>
                     <p className="text-indigo-100 max-w-xl">Use Gemini AI to break down tasks. Type something like "Clean the messy kitchen" or "Get ready for school".</p>
                   </div>
                </div>
                
                <div className="flex gap-3 mb-6">
                   <input 
                      type="text" 
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Describe a task..."
                      className="flex-1 px-5 py-4 rounded-xl text-slate-900 focus:outline-none focus:ring-4 focus:ring-white/30"
                      onKeyDown={(e) => e.key === 'Enter' && handleAiSuggest()}
                   />
                   <button 
                    onClick={handleAiSuggest}
                    disabled={isGenerating}
                    className="px-8 py-4 bg-white text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors disabled:opacity-70 flex items-center gap-2"
                   >
                     {isGenerating ? <Loader2 className="animate-spin"/> : 'Generate'}
                   </button>
                </div>

                {/* AI Suggestions Results */}
                {aiSuggestions.length > 0 && (
                   <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
                      <h4 className="font-bold mb-4 text-sm uppercase tracking-wide opacity-80">AI Suggestions</h4>
                      <div className="grid gap-4">
                        {aiSuggestions.map((suggestion, idx) => (
                           <div key={idx} className="bg-white text-slate-800 p-4 rounded-lg flex items-center justify-between shadow-lg">
                              <div>
                                 <p className="font-bold text-lg">{suggestion.title}</p>
                                 <p className="text-sm text-slate-500">{suggestion.description}</p>
                                 <span className="inline-block mt-2 text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded">{suggestion.points} pts</span>
                              </div>
                              <div className="flex gap-2">
                                 {kids.map(kid => (
                                   <button 
                                      key={kid.id}
                                      onClick={() => addSuggestion(suggestion, kid.id)}
                                      className="w-10 h-10 rounded-full border border-slate-200 overflow-hidden hover:ring-2 ring-indigo-500 transition-all tooltip"
                                      title={`Assign to ${kid.name}`}
                                   >
                                      <img src={kid.avatar} className="w-full h-full" alt={kid.name} />
                                   </button>
                                 ))}
                              </div>
                           </div>
                        ))}
                      </div>
                   </div>
                )}
             </div>

             <div className="bg-white p-6 rounded-2xl border border-slate-200">
                <h3 className="text-xl font-bold mb-6 text-slate-800">Active Chores List</h3>
                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-100">
                           <th className="pb-3 text-slate-400 font-medium text-sm">Chore</th>
                           <th className="pb-3 text-slate-400 font-medium text-sm">Assigned To</th>
                           <th className="pb-3 text-slate-400 font-medium text-sm">Points</th>
                           <th className="pb-3 text-slate-400 font-medium text-sm">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                         {chores.map(chore => (
                           <tr key={chore.id} className="group hover:bg-slate-50">
                              <td className="py-4 font-medium text-slate-700">{chore.title}</td>
                              <td className="py-4">
                                <div className="flex items-center gap-2">
                                   <img src={users.find(u => u.id === chore.assignedTo)?.avatar} className="w-6 h-6 rounded-full"/>
                                   <span className="text-sm text-slate-600">{users.find(u => u.id === chore.assignedTo)?.name}</span>
                                </div>
                              </td>
                              <td className="py-4 text-slate-600">{chore.points}</td>
                              <td className="py-4">
                                 {chore.completed 
                                   ? <span className="text-green-600 text-sm font-bold bg-green-100 px-2 py-1 rounded">Done</span>
                                   : <span className="text-slate-400 text-sm">Pending</span>
                                 }
                              </td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentPortal;