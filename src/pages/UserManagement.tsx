import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, Shield, Save, X } from 'lucide-react';
import { getSystemUsers, saveSystemUsers, SystemUser, getCurrentUser } from '../services/db';
import { useLanguage } from '../i18n';
import { cn } from '../Layout';

export default function UserManagement() {
  const { t } = useLanguage();
  const currentUser = getCurrentUser();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);

  useEffect(() => {
    setUsers(getSystemUsers());
  }, []);

  if (currentUser.role !== 'superadmin') {
    return (
      <div className="p-8 max-w-7xl mx-auto flex flex-col items-center justify-center flex-1 min-h-[50vh]">
        <Shield className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Access Denied</h2>
        <p className="text-slate-500 mt-2">You need superadmin permissions to view this page.</p>
      </div>
    );
  }

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (u: SystemUser) => {
    setEditingUser(u);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      const newUsers = users.filter(u => u.id !== id);
      setUsers(newUsers);
      saveSystemUsers(newUsers);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      const newUsers = editingUser.id.startsWith('new_') 
        ? [...users, { ...editingUser, id: Math.random().toString(36).substr(2, 9) }]
        : users.map(u => u.id === editingUser.id ? editingUser : u);
      setUsers(newUsers);
      saveSystemUsers(newUsers);
      setIsModalOpen(false);
      setEditingUser(null);
    }
  };

  const handleAddUser = () => {
    setEditingUser({
      id: 'new_1',
      name: '',
      email: '',
      role: 'sales',
      status: 'Active',
      permissions: ['view_customers']
    });
    setIsModalOpen(true);
  };

  const roles = [
    { value: 'superadmin', label: 'Super Admin' },
    { value: 'admin', label: 'Admin' },
    { value: 'sales', label: 'Sales' },
    { value: 'support', label: 'Support' }
  ];

  const availablePermissions = [
    { value: 'view_customers', label: 'View Customers' },
    { value: 'edit_customers', label: 'Edit Customers' },
    { value: 'reply_inbox', label: 'Reply in Inbox' },
    { value: 'manage_knowledge', label: 'Manage Knowledge Base' },
    { value: 'manage_agents', label: 'Manage Agents' },
    { value: 'all', label: 'Full Access (All)' }
  ];

  return (
    <div className="w-full p-8 flex flex-col gap-8 h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">System Users</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage user roles and permissions.</p>
        </div>
        <button 
          onClick={handleAddUser}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl shadow-sm flex flex-col flex-1 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name / Email</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredUsers.map(user => (
                 <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors">
                   <td className="px-6 py-4">
                     <div className="font-medium text-slate-900 dark:text-white">{user.name}</div>
                     <div className="text-sm text-slate-500">{user.email}</div>
                   </td>
                   <td className="px-6 py-4">
                     <span className="px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded text-xs font-mono border border-purple-200 dark:border-purple-500/20">
                       {user.role}
                     </span>
                   </td>
                   <td className="px-6 py-4">
                     <span className={cn("px-2 py-1 rounded text-xs font-medium", user.status === 'Active' ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400")}>
                       {user.status}
                     </span>
                   </td>
                   <td className="px-6 py-4 text-right">
                     <div className="flex items-center justify-end gap-2">
                       <button onClick={() => handleEdit(user)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                         <Edit2 className="w-4 h-4" />
                       </button>
                       <button onClick={() => handleDelete(user.id)} className="p-2 text-slate-400 hover:text-red-600 transition-colors" disabled={user.email === currentUser.email}>
                         <Trash2 className="w-4 h-4" />
                       </button>
                     </div>
                   </td>
                 </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-white/10">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingUser.id.startsWith('new_') ? 'Add User' : 'Edit User'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="user-form" onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</label>
                    <input 
                      required
                      type="text" 
                      value={editingUser.name}
                      onChange={e => setEditingUser({...editingUser, name: e.target.value})}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email Address</label>
                    <input 
                      required
                      type="email" 
                      value={editingUser.email}
                      onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Role</label>
                    <select 
                      value={editingUser.role}
                      onChange={e => setEditingUser({...editingUser, role: e.target.value as any})}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                    <select 
                      value={editingUser.status}
                      onChange={e => setEditingUser({...editingUser, status: e.target.value as any})}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Permissions</label>
                  <div className="grid grid-cols-2 gap-2">
                    {availablePermissions.map(p => {
                      const hasPerm = editingUser.permissions.includes(p.value);
                      return (
                        <label key={p.value} className="flex items-start gap-2 cursor-pointer group">
                          <div className="mt-0.5 relative flex items-center justify-center w-4 h-4">
                            <input 
                              type="checkbox" 
                              className="peer sr-only"
                              checked={hasPerm}
                              onChange={(e) => {
                                let newPerms = [...editingUser.permissions];
                                if (e.target.checked) {
                                  newPerms.push(p.value);
                                } else {
                                  newPerms = newPerms.filter(x => x !== p.value);
                                }
                                setEditingUser({...editingUser, permissions: newPerms});
                              }}
                            />
                            <div className="w-4 h-4 border border-slate-300 dark:border-white/20 rounded bg-white dark:bg-white/5 peer-checked:bg-blue-500 peer-checked:border-blue-500 transition-colors"></div>
                            {hasPerm && <svg className="absolute w-3 h-3 text-white pointer-events-none" viewBox="0 0 14 14" fill="none"><path d="M3 8L6 11L11 3.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" stroke="currentColor"/></svg>}
                          </div>
                          <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{p.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-slate-100 dark:border-white/10 flex justify-end gap-3 bg-slate-50 dark:bg-white/[0.02]">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                form="user-form"
                type="submit"
                className="px-4 py-2 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
