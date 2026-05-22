'use client';
import { useState, useEffect } from 'react';
import { X, Search, UserPlus, Users, Crown, Pencil, Eye, Loader2, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Member {
  id: string;
  userId: string;
  role: string;
  user: { id: string; username: string; email: string; avatarUrl?: string };
}

const ROLE_ICONS: Record<string, { icon: typeof Crown; label: string; color: string }> = {
  OWNER: { icon: Crown, label: 'Owner', color: 'text-yellow-400' },
  EDITOR: { icon: Pencil, label: 'Editor', color: 'text-blue-400' },
  VIEWER: { icon: Eye, label: 'Viewer', color: 'text-zinc-400' },
};

export function InviteModal({
  isOpen,
  onClose,
  workspaceId,
}: {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteRole, setInviteRole] = useState('EDITOR');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) loadMembers();
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) searchUsers();
      else setSearchResults([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadMembers = async () => {
    try {
      const res = await api.get(`/workspaces/${workspaceId}/members`);
      setMembers(res.data.data || []);
    } catch {}
    setLoading(false);
  };

  const searchUsers = async () => {
    setSearching(true);
    try {
      const res = await api.get(`/workspaces/search/users`, {
        params: { q: searchQuery, exclude: workspaceId },
      } as any);
      setSearchResults(res.data.data || []);
    } catch {}
    setSearching(false);
  };

  const inviteUser = async (userId: string) => {
    try {
      await api.post(`/workspaces/${workspaceId}/members`, {
        userId,
        role: inviteRole,
      });
      toast.success('Member added!');
      setSearchQuery('');
      setSearchResults([]);
      loadMembers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to invite');
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      await api.delete(`/workspaces/${workspaceId}/members/${memberId}`);
      toast.success('Member removed');
      loadMembers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-6" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-bold">Team Members</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-700 rounded-lg text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Invite */}
        <div className="p-4 border-b border-surface-800 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username or email..."
                className="input-field pl-10 text-sm"
              />
            </div>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
              className="input-field w-28 text-sm">
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="bg-surface-800 rounded-lg border border-surface-700 max-h-40 overflow-y-auto">
              {searchResults.map((u) => (
                <button key={u.id} onClick={() => inviteUser(u.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-700 transition-colors text-left">
                  <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {u.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.username}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{u.email}</p>
                  </div>
                  <UserPlus className="w-4 h-4 text-brand-400 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {searching && (
            <div className="flex justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
            </div>
          )}
        </div>

        {/* Members list */}
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-center text-zinc-600 text-sm py-8">No members yet</p>
          ) : (
            members.map((m) => {
              const roleInfo = ROLE_ICONS[m.role] || ROLE_ICONS.VIEWER;
              const RoleIcon = roleInfo.icon;
              return (
                <div key={m.id} className="flex items-center gap-3 px-6 py-3 border-b border-surface-800/50 group">
                  <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                    {m.user.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.user.username}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{m.user.email}</p>
                  </div>
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${roleInfo.color}`}>
                    <RoleIcon className="w-3 h-3" />
                    {roleInfo.label}
                  </span>
                  {m.role !== 'OWNER' && (
                    <button onClick={() => removeMember(m.id)}
                      className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded text-zinc-500 hover:text-red-400 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-surface-800 bg-surface-800/30">
          <p className="text-[11px] text-zinc-600">{members.length} member{members.length !== 1 ? 's' : ''} in this workspace</p>
        </div>
      </div>
    </div>
  );
}
