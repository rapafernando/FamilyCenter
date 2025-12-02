import React, { useState } from 'react';
import { User, Chore, Reward } from '../types';
import { CheckCircle2, Circle, Gift, Trophy, Star, Plus } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface KidDashboardProps {
  currentUser: User;
  chores: Chore[];
  rewards: Reward[];
  onToggleChore: (id: string) => void;
  onRequestReward: (title: string, cost: number) => void;
}

const KidDashboard: React.FC<KidDashboardProps> = ({ currentUser, chores, rewards, onToggleChore, onRequestReward }) => {
  const [activeTab, setActiveTab] = useState<'chores' | 'rewards' | 'wishlist'>('chores');
  const [wishInput, setWishInput] = useState('');
  const [wishCost, setWishCost] = useState(100);

  const myChores = chores.filter(c => c.assignedTo === currentUser.id);
  const myRewards = rewards.filter(r => !r.requestedBy || r.requestedBy === currentUser.id);
  
  // Simple completion stats
  const completedCount = myChores.filter(c => c.completed).length;
  const totalCount = myChores.length;
  const progress = totalCount === 0 ? 0 : (completedCount / totalCount) * 100;

  const handleAddWish = () => {
    if (wishInput.trim()) {
      onRequestReward(wishInput, wishCost);
      setWishInput('');
      setWishCost(100);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white p-6 shadow-sm flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <img src={currentUser.avatar} alt="Me" className="w-16 h-16 rounded-full border-2 border-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Hi, {currentUser.name}!</h1>
            <p className="text-slate-500">Let's crush today!</p>
          </div>
        </div>
        <div className="bg-yellow-50 px-6 py-3 rounded-2xl flex items-center gap-3 border border-yellow-100">
          <div className="bg-yellow-400 p-2 rounded-full text-white">
            <Star size={24} fill="white" />
          </div>
          <div>
            <span className="block text-sm text-yellow-700 font-bold uppercase tracking-wide">My Points</span>
            <span className="text-3xl font-black text-slate-800">{currentUser.points}</span>
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        {/* Navigation Tabs */}
        <div className="flex gap-4 mb-8">
          <button 
            onClick={() => setActiveTab('chores')}
            className={`flex-1 py-4 rounded-xl font-bold text-lg transition-all ${activeTab === 'chores' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
          >
            My Chores
          </button>
          <button 
            onClick={() => setActiveTab('rewards')}
            className={`flex-1 py-4 rounded-xl font-bold text-lg transition-all ${activeTab === 'rewards' ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
          >
            Rewards Store
          </button>
           <button 
            onClick={() => setActiveTab('wishlist')}
            className={`flex-1 py-4 rounded-xl font-bold text-lg transition-all ${activeTab === 'wishlist' ? 'bg-pink-500 text-white shadow-lg shadow-pink-200' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
          >
            My Wishlist
          </button>
        </div>

        {/* Content */}
        {activeTab === 'chores' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              {myChores.length === 0 && (
                <div className="text-center py-10 text-slate-400 bg-white rounded-2xl">
                  <Trophy size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="text-xl">All caught up! You are awesome!</p>
                </div>
              )}
              {myChores.map(chore => (
                <div 
                  key={chore.id} 
                  onClick={() => onToggleChore(chore.id)}
                  className={`group relative overflow-hidden p-6 rounded-2xl transition-all cursor-pointer border-2 ${chore.completed ? 'bg-green-50 border-green-200' : 'bg-white border-slate-100 hover:border-blue-300 hover:shadow-md'}`}
                >
                  <div className="flex items-center justify-between z-10 relative">
                    <div className="flex items-center gap-4">
                      {chore.completed ? 
                        <CheckCircle2 size={32} className="text-green-500" /> : 
                        <Circle size={32} className="text-slate-300 group-hover:text-blue-400" />
                      }
                      <div>
                        <h3 className={`text-xl font-bold ${chore.completed ? 'text-green-800 line-through opacity-70' : 'text-slate-800'}`}>{chore.title}</h3>
                        <p className={`text-sm ${chore.completed ? 'text-green-600' : 'text-slate-500'}`}>
                          {chore.recurrence === 'daily' ? 'Due Today' : 'Weekly Goal'}
                        </p>
                      </div>
                    </div>
                    <div className={`px-4 py-1.5 rounded-full font-bold ${chore.completed ? 'bg-green-200 text-green-800' : 'bg-blue-100 text-blue-700'}`}>
                      +{chore.points}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Progress Card */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center">
              <h3 className="text-xl font-bold text-slate-700 mb-6">Daily Progress</h3>
              <div className="h-64 w-64 relative">
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[{ value: progress }, { value: 100 - progress }]}
                        innerRadius={80}
                        outerRadius={100}
                        startAngle={90}
                        endAngle={-270}
                        paddingAngle={0}
                        dataKey="value"
                      >
                        <Cell key="completed" fill="#4ade80" stroke="none" />
                        <Cell key="remaining" fill="#f1f5f9" stroke="none" />
                      </Pie>
                    </PieChart>
                 </ResponsiveContainer>
                 <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-5xl font-black text-slate-800">{Math.round(progress)}%</span>
                    <span className="text-slate-400 font-medium uppercase tracking-widest text-sm">Complete</span>
                 </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rewards' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {myRewards.filter(r => r.approved).map(reward => {
              const canAfford = currentUser.points >= reward.cost;
              return (
                <div key={reward.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 flex flex-col">
                  <div className="h-40 bg-slate-100 overflow-hidden relative">
                    <img src={reward.image} alt={reward.title} className="w-full h-full object-cover" />
                    <div className="absolute top-2 right-2 bg-black/50 text-white px-3 py-1 rounded-full text-sm font-bold backdrop-blur-sm">
                      {reward.cost} pts
                    </div>
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <h3 className="text-lg font-bold text-slate-800 mb-2">{reward.title}</h3>
                    <div className="mt-auto pt-4">
                      <button 
                        disabled={!canAfford}
                        className={`w-full py-3 rounded-xl font-bold text-lg transition-all ${
                          canAfford 
                          ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-200' 
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {canAfford ? 'Redeem Reward' : `Need ${reward.cost - currentUser.points} more`}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'wishlist' && (
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-8 text-white shadow-xl shadow-pink-200">
               <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
                 <Gift /> Make a Wish
               </h3>
               <p className="mb-6 opacity-90">Add something you want to work towards!</p>
               <div className="flex gap-4">
                 <input 
                    type="text" 
                    placeholder="I want..."
                    value={wishInput}
                    onChange={(e) => setWishInput(e.target.value)}
                    className="flex-1 bg-white/20 border border-white/30 rounded-xl px-4 py-3 text-white placeholder-white/60 focus:outline-none focus:bg-white/30 backdrop-blur-md"
                 />
                 <div className="relative w-32">
                    <input 
                      type="number" 
                      value={wishCost}
                      onChange={(e) => setWishCost(Number(e.target.value))}
                      className="w-full bg-white/20 border border-white/30 rounded-xl pl-4 pr-8 py-3 text-white focus:outline-none focus:bg-white/30 backdrop-blur-md"
                    />
                    <span className="absolute right-3 top-3 text-xs opacity-70 font-bold">PTS</span>
                 </div>
                 <button 
                  onClick={handleAddWish}
                  className="bg-white text-pink-600 font-bold px-6 py-3 rounded-xl hover:bg-pink-50 transition-colors"
                 >
                   <Plus />
                 </button>
               </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-slate-600 uppercase tracking-wide text-sm">My Wishlist Items</h3>
              {myRewards.filter(r => r.requestedBy === currentUser.id).map(item => (
                <div key={item.id} className="bg-white p-4 rounded-xl flex items-center justify-between border border-slate-100">
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center text-pink-500">
                       <Gift size={20} />
                     </div>
                     <div>
                       <p className="font-bold text-slate-800">{item.title}</p>
                       <p className="text-sm text-slate-500">{item.cost} points</p>
                     </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold ${item.approved ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {item.approved ? 'Approved' : 'Waiting for Parent'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KidDashboard;