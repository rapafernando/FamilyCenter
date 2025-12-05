
import React, { useState } from 'react';
import { User, AppState } from '../types';
import { ShieldAlert, Users, Database, LifeBuoy, X, Trash2, CheckCircle2, Server, LogOut } from 'lucide-react';

interface AdminPortalProps {
  state: AppState;
  onClose: () => void;
  onWipeData: () => void;
}

const AdminPortal: React.FC<AdminPortalProps> = ({ state, onClose, onWipeData }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'support'>('dashboard');
  const [supportMsg, setSupportMsg] = useState('');
  const [supportSent, setSupportSent] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  // Calculate stats
  const storageUsed = (JSON.stringify(state).length / 1024).toFixed(2); // KB
  const totalKids = state.users.filter(u => u.role === 'KID').length;
  const totalParents = state.users.filter(u => u.role === 'PARENT').length;
  
  const handleSendSupport = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would send to a backend
    console.log("Sending support message:", supportMsg);
    setSupportSent(true);
    setTimeout(() => {
        setSupportSent(false);
        setSupportMsg('');
    }, 3000);
  };

  const handleWipe = () => {
      onWipeData();
      // App will likely reload or unmount, but just in case
      window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900 text-slate-200 flex flex-col font-sans">
        {/* Header */}
        <div className="bg-slate-950 p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="bg-red-500/20 text-red-500 p-2 rounded-lg">
                    <ShieldAlert size={24} />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-white tracking-tight">System Admin Portal</h1>
                    <p className="text-xs text-slate-500">Site Reliability & Support Console</p>
                </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white flex items-center gap-2 px-4 py-2 hover:bg-slate-800 rounded-lg transition-colors">
                <LogOut size={16} /> Exit
            </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 bg-slate-900 border-r border-slate-800 p-4 space-y-2">
                <button 
                    onClick={() => setActiveTab('dashboard')} 
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                    <Server size={18} /> Accounts & Data
                </button>
                <button 
                    onClick={() => setActiveTab('support')} 
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${activeTab === 'support' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                    <LifeBuoy size={18} /> Customer Support
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-8 overflow-y-auto bg-slate-950/50">
                {activeTab === 'dashboard' && (
                    <div className="max-w-4xl mx-auto space-y-8">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                                <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><Users size={16}/> Total Accounts</h3>
                                <p className="text-3xl font-black text-white">{state.users.length}</p>
                                <p className="text-xs text-slate-500 mt-2">{totalParents} Parents, {totalKids} Kids</p>
                            </div>
                            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                                <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><Database size={16}/> Storage Used</h3>
                                <p className="text-3xl font-black text-white">{storageUsed} <span className="text-lg text-slate-500 font-medium">KB</span></p>
                                <p className="text-xs text-slate-500 mt-2">Local Browser Storage</p>
                            </div>
                            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                                <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><CheckCircle2 size={16}/> System Status</h3>
                                <p className="text-3xl font-black text-green-400">Healthy</p>
                                <p className="text-xs text-slate-500 mt-2">v1.2.0 • Build 2405</p>
                            </div>
                        </div>

                        {/* Account Management */}
                        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                            <div className="p-6 border-b border-slate-700">
                                <h3 className="font-bold text-lg text-white">Active Accounts Database</h3>
                            </div>
                            <div className="p-6">
                                <table className="w-full text-left text-sm text-slate-400">
                                    <thead>
                                        <tr className="border-b border-slate-700"><th className="pb-3 pl-2">Family Name</th><th className="pb-3">Admin</th><th className="pb-3">Created</th><th className="pb-3 text-right pr-2">Actions</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="py-4 pl-2 font-medium text-white">{state.familyName}</td>
                                            <td className="py-4">{state.users.find(u => u.role === 'PARENT')?.name || 'Unknown'}</td>
                                            <td className="py-4">{new Date().toLocaleDateString()}</td>
                                            <td className="py-4 text-right">
                                                {!confirmWipe ? (
                                                    <button onClick={() => setConfirmWipe(true)} className="text-red-400 hover:text-red-300 hover:bg-red-900/30 px-3 py-1.5 rounded-lg transition-colors font-medium text-xs border border-red-900/50">
                                                        Close Account
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className="text-xs text-red-500 font-bold">Are you sure?</span>
                                                        <button onClick={handleWipe} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Yes, Delete</button>
                                                        <button onClick={() => setConfirmWipe(false)} className="text-slate-400 hover:text-white px-2 text-xs">Cancel</button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'support' && (
                    <div className="max-w-2xl mx-auto bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-xl">
                        <div className="mb-8 text-center">
                            <div className="w-16 h-16 bg-blue-600/20 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <LifeBuoy size={32} />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Priority Support</h2>
                            <p className="text-slate-400">Direct line to site administration. How can we help?</p>
                        </div>

                        {supportSent ? (
                            <div className="bg-green-500/10 border border-green-500/20 p-6 rounded-xl text-center animate-in fade-in zoom-in-95">
                                <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-white mb-2">Message Sent!</h3>
                                <p className="text-slate-400">A support agent will review your case shortly.</p>
                            </div>
                        ) : (
                            <form onSubmit={handleSendSupport} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-400 mb-2">Issue Type</label>
                                    <select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none">
                                        <option>Bug Report</option>
                                        <option>Feature Request</option>
                                        <option>Account Issue</option>
                                        <option>Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-400 mb-2">Description</label>
                                    <textarea 
                                        required
                                        value={supportMsg}
                                        onChange={(e) => setSupportMsg(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none h-32"
                                        placeholder="Describe your issue in detail..."
                                    />
                                </div>
                                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-900/20">
                                    Submit Ticket
                                </button>
                            </form>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default AdminPortal;
