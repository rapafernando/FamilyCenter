
import React, { useState, useEffect } from 'react';
import { AppState, SystemAdminUser } from '../types';
import { Shield, Users, Search, Trash2, LogIn, Plus, Mail, Activity, Server, LayoutDashboard, UserCog } from 'lucide-react';

interface SuperAdminPortalProps {
  db: Record<string, AppState>;
  admins: SystemAdminUser[];
  onLoginAsFamily: (familyId: string) => void;
  onDeleteFamily: (familyId: string) => void;
  onAddAdmin: (admin: SystemAdminUser) => void;
  onDeleteAdmin: (adminId: string) => void;
}

const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({ 
  db, admins, onLoginAsFamily, onDeleteFamily, onAddAdmin, onDeleteAdmin 
}) => {
  const [activeView, setActiveView] = useState<'tenants' | 'users' | 'support'>('tenants');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'SUPER_ADMIN' | 'SUPPORT_AGENT'>('SUPPORT_AGENT');

  const families = Object.values(db);
  const filteredFamilies = families.filter(f => 
    f.familyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminName || !newAdminEmail) return;
    
    const newAdmin: SystemAdminUser = {
      id: `adm-${Date.now()}`,
      name: newAdminName,
      email: newAdminEmail,
      role: newAdminRole,
      createdAt: new Date().toISOString()
    };
    
    onAddAdmin(newAdmin);
    setIsAddingAdmin(false);
    setNewAdminName('');
    setNewAdminEmail('');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3 mb-1">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Shield size={20} className="text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">Admin Console</h1>
          </div>
          <p className="text-xs text-slate-500">Super Admin Access</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveView('tenants')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeView === 'tenants' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <LayoutDashboard size={18} /> Tenants (Families)
          </button>
          <button 
            onClick={() => setActiveView('users')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeView === 'users' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <UserCog size={18} /> User Maintenance
          </button>
          <button 
            onClick={() => setActiveView('support')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeView === 'support' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Activity size={18} /> Support Monitor
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">SA</div>
              <div>
                  <p className="text-sm font-bold">Current User</p>
                  <p className="text-xs text-slate-500">Super Admin</p>
              </div>
           </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center">
           <h2 className="text-2xl font-bold text-slate-800">
              {activeView === 'tenants' && 'Account Management'}
              {activeView === 'users' && 'System Administrators'}
              {activeView === 'support' && 'Support Dashboard'}
           </h2>
           <a href="/" className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-2">
              Go to Public App &rarr;
           </a>
        </header>

        <div className="p-8">
          {activeView === 'tenants' && (
            <div className="space-y-6">
               {/* Stats Row */}
               <div className="grid grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Total Families</p>
                      <p className="text-3xl font-black text-slate-800">{families.length}</p>
                  </div>
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Total Users</p>
                      <p className="text-3xl font-black text-slate-800">{families.reduce((acc, f) => acc + f.users.length, 0)}</p>
                  </div>
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Database Size</p>
                      <p className="text-3xl font-black text-slate-800">{(JSON.stringify(db).length / 1024).toFixed(1)} KB</p>
                  </div>
               </div>

               {/* Search & List */}
               <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-200 flex items-center gap-4">
                     <div className="relative flex-1 max-w-md">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                           type="text" 
                           placeholder="Search by Family Name or ID..." 
                           value={searchTerm}
                           onChange={(e) => setSearchTerm(e.target.value)}
                           className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                     </div>
                  </div>
                  
                  <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                          <tr>
                              <th className="px-6 py-4 font-bold">Family Name</th>
                              <th className="px-6 py-4 font-bold">Members</th>
                              <th className="px-6 py-4 font-bold">Created</th>
                              <th className="px-6 py-4 font-bold">Integrations</th>
                              <th className="px-6 py-4 font-bold text-right">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {filteredFamilies.map(family => (
                              <tr key={family.id} className="hover:bg-slate-50/50">
                                  <td className="px-6 py-4">
                                      <div className="font-bold text-slate-800">{family.familyName}</div>
                                      <div className="text-xs text-slate-400 font-mono">{family.id}</div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="flex -space-x-2">
                                          {family.users.slice(0, 4).map(u => (
                                              <img key={u.id} src={u.avatar} className="w-8 h-8 rounded-full border-2 border-white" title={u.name} />
                                          ))}
                                          {family.users.length > 4 && (
                                              <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-xs text-slate-500">+{family.users.length - 4}</div>
                                          )}
                                      </div>
                                  </td>
                                  <td className="px-6 py-4 text-slate-600">
                                      {new Date(family.createdAt || Date.now()).toLocaleDateString()}
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="flex gap-2">
                                          {family.calendarSources.length > 0 && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">Cal</span>}
                                          {family.photoConfig.accessToken && <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">Photos</span>}
                                          {family.calendarSources.length === 0 && !family.photoConfig.accessToken && <span className="text-slate-400 text-xs">-</span>}
                                      </div>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                          <button 
                                            onClick={() => onLoginAsFamily(family.id)}
                                            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                          >
                                              <LogIn size={14} /> Login As
                                          </button>
                                          <button 
                                            onClick={() => {
                                                if (confirm(`Are you sure you want to delete ${family.familyName}? This cannot be undone.`)) {
                                                    onDeleteFamily(family.id);
                                                }
                                            }}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete Account"
                                          >
                                              <Trash2 size={16} />
                                          </button>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                          {filteredFamilies.length === 0 && (
                              <tr>
                                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                      No families found. Go to the app to create one.
                                  </td>
                              </tr>
                          )}
                      </tbody>
                  </table>
               </div>
            </div>
          )}

          {activeView === 'users' && (
             <div className="max-w-4xl">
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-slate-700">Internal Users</h3>
                    <button 
                      onClick={() => setIsAddingAdmin(true)}
                      className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-800"
                    >
                        <Plus size={16} /> Add System Admin
                    </button>
                 </div>

                 {isAddingAdmin && (
                     <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6 animate-in fade-in slide-in-from-top-4">
                         <h4 className="font-bold mb-4">New Admin User</h4>
                         <form onSubmit={handleCreateAdmin} className="grid grid-cols-2 gap-4">
                             <div>
                                 <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Full Name</label>
                                 <input required type="text" value={newAdminName} onChange={e => setNewAdminName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500" />
                             </div>
                             <div>
                                 <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email Address</label>
                                 <input required type="email" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500" />
                             </div>
                             <div>
                                 <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Role</label>
                                 <select value={newAdminRole} onChange={e => setNewAdminRole(e.target.value as any)} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white">
                                     <option value="SUPPORT_AGENT">Support Agent</option>
                                     <option value="SUPER_ADMIN">Super Admin</option>
                                 </select>
                             </div>
                             <div className="col-span-2 flex justify-end gap-2 mt-2">
                                 <button type="button" onClick={() => setIsAddingAdmin(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg font-bold text-sm">Cancel</button>
                                 <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm">Create User</button>
                             </div>
                         </form>
                     </div>
                 )}

                 <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                     <table className="w-full text-left text-sm">
                         <thead className="bg-slate-50 text-slate-500">
                             <tr>
                                 <th className="px-6 py-4 font-bold">Name</th>
                                 <th className="px-6 py-4 font-bold">Role</th>
                                 <th className="px-6 py-4 font-bold">Created At</th>
                                 <th className="px-6 py-4 font-bold text-right">Actions</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                             {admins.map(admin => (
                                 <tr key={admin.id}>
                                     <td className="px-6 py-4">
                                         <div className="font-bold text-slate-800">{admin.name}</div>
                                         <div className="text-xs text-slate-500">{admin.email}</div>
                                     </td>
                                     <td className="px-6 py-4">
                                         <span className={`px-2 py-1 rounded text-xs font-bold ${admin.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                             {admin.role.replace('_', ' ')}
                                         </span>
                                     </td>
                                     <td className="px-6 py-4 text-slate-500">
                                         {new Date(admin.createdAt).toLocaleDateString()}
                                     </td>
                                     <td className="px-6 py-4 text-right">
                                         <button onClick={() => onDeleteAdmin(admin.id)} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg">
                                             <Trash2 size={16} />
                                         </button>
                                     </td>
                                 </tr>
                             ))}
                             {admins.length === 0 && (
                                 <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">No admin users configured.</td></tr>
                             )}
                         </tbody>
                     </table>
                 </div>
             </div>
          )}

          {activeView === 'support' && (
              <div className="flex flex-col items-center justify-center h-96 text-slate-400 bg-white rounded-xl border border-slate-200 border-dashed">
                  <Server size={48} className="mb-4 opacity-50" />
                  <h3 className="text-xl font-bold text-slate-600">Support Dashboard</h3>
                  <p>Ticket system integration pending.</p>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminPortal;
