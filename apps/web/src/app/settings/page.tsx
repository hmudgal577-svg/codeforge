'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { User, Lock, Trash2, ArrowLeft, Save, Loader2, Code2, Shield, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, hydrate, setAuth, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'danger'>('profile');

  // Profile state
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Delete state
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { hydrate(); }, []);
  useEffect(() => {
    if (!isAuthenticated && !useAuthStore.getState().isLoading) { router.push('/login'); return; }
    if (user) {
      setUsername(user.username || '');
      setAvatarUrl(user.avatarUrl || '');
    }
  }, [isAuthenticated, user]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api.patch('/auth/profile', { username, avatarUrl: avatarUrl || null });
      const updated = res.data.data;
      setAuth({ ...user!, username: updated.username, avatarUrl: updated.avatarUrl }, useAuthStore.getState().token!);
      toast.success('Profile updated!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally { setSavingProfile(false); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setChangingPassword(true);
    try {
      await api.patch('/auth/password', { oldPassword, newPassword });
      toast.success('Password changed! Please login again.');
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally { setChangingPassword(false); }
  };

  const deleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') { toast.error('Type DELETE to confirm'); return; }
    setDeleting(true);
    try {
      await api.delete('/auth/account', { body: JSON.stringify({ password: deletePassword }) } as any);
      toast.success('Account deleted');
      logout();
      router.push('/');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete account');
    } finally { setDeleting(false); }
  };

  if (!isAuthenticated) return null;

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'security' as const, label: 'Security', icon: Lock },
    { id: 'danger' as const, label: 'Danger Zone', icon: Trash2 },
  ];

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Header */}
      <header className="border-b border-surface-800 bg-surface-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/dashboard')} className="p-2 hover:bg-surface-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold">Settings</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* Sidebar tabs */}
          <div className="w-48 shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-brand-500/10 text-brand-400'
                      : 'text-zinc-500 hover:text-white hover:bg-surface-800'
                  }`}>
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeTab === 'profile' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-xl font-bold mb-6">Profile</h2>
                <form onSubmit={saveProfile} className="space-y-6">
                  {/* Avatar preview */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-brand-600 flex items-center justify-center text-2xl font-bold text-white">
                      {username[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="font-medium">{user?.username}</p>
                      <p className="text-sm text-zinc-500">{user?.email}</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Username</label>
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                      className="input-field" required minLength={3} />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Avatar URL</label>
                    <input type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://example.com/avatar.jpg" className="input-field" />
                    <p className="text-xs text-zinc-600 mt-1">Leave empty for default avatar</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Email</label>
                    <input type="email" value={user?.email || ''} disabled
                      className="input-field opacity-50 cursor-not-allowed" />
                    <p className="text-xs text-zinc-600 mt-1">Email cannot be changed</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Role</label>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-brand-400" />
                      <span className="text-sm px-2.5 py-1 bg-brand-500/10 text-brand-400 rounded-md font-medium">
                        {user?.role}
                      </span>
                    </div>
                  </div>

                  <button type="submit" disabled={savingProfile} className="btn-primary flex items-center gap-2">
                    {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {savingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                </form>
              </motion.div>
            )}

            {activeTab === 'security' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-xl font-bold mb-6">Change Password</h2>
                <form onSubmit={changePassword} className="space-y-5 max-w-md">
                  <div>
                    <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Current Password</label>
                    <div className="relative">
                      <input type={showOld ? 'text' : 'password'} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)}
                        className="input-field pr-10" required />
                      <button type="button" onClick={() => setShowOld(!showOld)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                        {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-zinc-400 mb-1.5 block">New Password</label>
                    <div className="relative">
                      <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                        className="input-field pr-10" required minLength={6} />
                      <button type="button" onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Confirm New Password</label>
                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input-field" required minLength={6} />
                  </div>

                  <button type="submit" disabled={changingPassword} className="btn-primary flex items-center gap-2">
                    {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    {changingPassword ? 'Changing...' : 'Change Password'}
                  </button>
                </form>
              </motion.div>
            )}

            {activeTab === 'danger' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-xl font-bold mb-2 text-red-400">Danger Zone</h2>
                <p className="text-sm text-zinc-500 mb-6">Once you delete your account, there is no going back. Please be certain.</p>

                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Enter your password</label>
                    <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)}
                      className="input-field" placeholder="Your current password" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Type DELETE to confirm</label>
                    <input type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
                      className="input-field" placeholder="DELETE" />
                  </div>
                  <button onClick={deleteAccount} disabled={deleting || deleteConfirm !== 'DELETE' || !deletePassword}
                    className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {deleting ? 'Deleting...' : 'Delete Account Permanently'}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
