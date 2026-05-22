'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, Code2, Users, Clock, FolderOpen, LogOut, Search, Settings, Shield, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { NotificationsDropdown } from '@/components/notifications-dropdown';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const LANG_COLORS: Record<string,string> = {
  javascript: 'bg-yellow-500/20 text-yellow-400',
  typescript: 'bg-blue-400/20 text-blue-300',
  python: 'bg-blue-500/20 text-blue-400',
  cpp: 'bg-purple-500/20 text-purple-400',
  c: 'bg-purple-400/20 text-purple-300',
  java: 'bg-red-500/20 text-red-400',
  go: 'bg-cyan-500/20 text-cyan-400',
  rust: 'bg-orange-500/20 text-orange-400',
  ruby: 'bg-red-400/20 text-red-300',
  php: 'bg-indigo-500/20 text-indigo-400',
  perl: 'bg-sky-500/20 text-sky-400',
  r: 'bg-blue-600/20 text-blue-300',
  dart: 'bg-teal-500/20 text-teal-400',
  kotlin: 'bg-violet-500/20 text-violet-400',
  scala: 'bg-rose-500/20 text-rose-400',
  swift: 'bg-orange-400/20 text-orange-300',
  csharp: 'bg-green-500/20 text-green-400',
  lua: 'bg-indigo-400/20 text-indigo-300',
  powershell: 'bg-blue-500/20 text-blue-400',
  bash: 'bg-emerald-500/20 text-emerald-400',
};

function SkeletonCard() {
  return (
    <div className="bg-surface-900 border border-surface-700 rounded-xl p-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-lg bg-surface-800" />
        <div className="w-16 h-6 rounded-md bg-surface-800" />
      </div>
      <div className="h-5 w-3/4 bg-surface-800 rounded mb-3" />
      <div className="h-3 w-1/2 bg-surface-800/60 rounded" />
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-surface-800">
        <div className="h-3 w-12 bg-surface-800 rounded" />
        <div className="h-3 w-12 bg-surface-800 rounded" />
        <div className="h-3 w-20 bg-surface-800 rounded ml-auto" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, hydrate, logout } = useAuthStore();
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [newWs, setNewWs] = useState({ name: '', language: 'javascript', description: '' });
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { hydrate(); }, []);
  useEffect(() => {
    if (!isAuthenticated && !useAuthStore.getState().isLoading) { router.push('/login'); return; }
    if (isAuthenticated) fetchWorkspaces();
  }, [isAuthenticated]);

  const fetchWorkspaces = async () => {
    try { const res = await api.get('/workspaces'); setWorkspaces(res.data.data || []); }
    catch { toast.error('Failed to load workspaces'); }
    finally { setLoading(false); }
  };

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true);
    try {
      const res = await api.post('/workspaces', newWs);
      toast.success('Workspace created!');
      router.push(`/workspace/${res.data.data.id}`);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setCreating(false); }
  };

  const deleteWorkspace = async (wsId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this workspace? This cannot be undone.')) return;
    setDeletingId(wsId);
    try {
      await api.delete(`/workspaces/${wsId}`);
      setWorkspaces((prev) => prev.filter((w) => w.id !== wsId));
      toast.success('Workspace deleted');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
    setDeletingId(null);
  };

  const filtered = workspaces.filter(w => w.name.toLowerCase().includes(search.toLowerCase()));
  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-surface-950">
      <header className="border-b border-surface-800 bg-surface-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold">CodeForge</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 bg-surface-900 border border-surface-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 w-56" />
            </div>
            <div className="flex items-center gap-2 pl-4 border-l border-surface-800">
              <NotificationsDropdown />
              {user?.role === 'ADMIN' && (
                <button onClick={() => router.push('/admin')}
                  className="p-2 hover:bg-surface-700 rounded-lg text-zinc-400 hover:text-yellow-400 transition-colors" title="Admin Dashboard">
                  <Shield className="w-4.5 h-4.5" />
                </button>
              )}
              <button onClick={() => router.push('/settings')}
                className="p-2 hover:bg-surface-700 rounded-lg text-zinc-400 hover:text-white transition-colors" title="Settings">
                <Settings className="w-4.5 h-4.5" />
              </button>
              <div className="h-5 w-px bg-surface-700 mx-1" />
              <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-sm font-bold">
                {user?.username?.[0]?.toUpperCase()}
              </div>
              <span className="text-sm text-zinc-400">{user?.username}</span>
              <button onClick={() => { api.post('/auth/logout').catch(()=>{}); logout(); router.push('/'); }}
                className="text-zinc-500 hover:text-red-400 transition-colors" title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div><h1 className="text-3xl font-bold">Workspaces</h1><p className="text-zinc-500 mt-1">Your coding projects</p></div>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Workspace</button>
        </div>

        {showCreate && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-6" onClick={() => setShowCreate(false)}>
            <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} onClick={e => e.stopPropagation()} className="bg-surface-900 border border-surface-700 rounded-2xl p-8 w-full max-w-lg">
              <h2 className="text-xl font-bold mb-6">Create New Workspace</h2>
              <form onSubmit={createWorkspace} className="space-y-5">
                <div><label className="text-sm font-medium text-zinc-400 mb-1.5 block">Name</label>
                  <input type="text" value={newWs.name} onChange={e => setNewWs({...newWs, name: e.target.value})} placeholder="my-project" required className="input-field" /></div>
                <div><label className="text-sm font-medium text-zinc-400 mb-1.5 block">Language</label>
                  <select value={newWs.language} onChange={e => setNewWs({...newWs, language: e.target.value})} className="input-field">
                    <optgroup label="Popular">
                      <option value="javascript">JavaScript</option>
                      <option value="typescript">TypeScript</option>
                      <option value="python">Python</option>
                      <option value="java">Java</option>
                      <option value="cpp">C++</option>
                      <option value="c">C</option>
                      <option value="go">Go</option>
                    </optgroup>
                    <optgroup label="Web & Scripting">
                      <option value="php">PHP</option>
                      <option value="ruby">Ruby</option>
                      <option value="perl">Perl</option>
                      <option value="lua">Lua</option>
                    </optgroup>
                    <optgroup label="Mobile & Modern">
                      <option value="dart">Dart</option>
                      <option value="kotlin">Kotlin</option>
                      <option value="swift">Swift</option>
                      <option value="rust">Rust</option>
                      <option value="scala">Scala</option>
                      <option value="csharp">C#</option>
                    </optgroup>
                    <optgroup label="Data & Shell">
                      <option value="r">R</option>
                      <option value="powershell">PowerShell</option>
                      <option value="bash">Bash</option>
                    </optgroup>
                  </select></div>
                <div><label className="text-sm font-medium text-zinc-400 mb-1.5 block">Description (optional)</label>
                  <input type="text" value={newWs.description} onChange={e => setNewWs({...newWs, description: e.target.value})} placeholder="A short description..." className="input-field" /></div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" disabled={creating} className="btn-primary flex-1">{creating ? 'Creating...' : 'Create'}</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <FolderOpen className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-zinc-400 mb-2">{search ? 'No matching workspaces' : 'No workspaces yet'}</h3>
            <p className="text-zinc-600 mb-4">{search ? 'Try a different search' : 'Create your first workspace to start coding'}</p>
            {!search && <button onClick={() => setShowCreate(true)} className="btn-primary mt-4"><Plus className="w-4 h-4 inline mr-2" /> Create Workspace</button>}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((ws, i) => (
              <motion.div key={ws.id} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
                onClick={() => router.push(`/workspace/${ws.id}`)} className="card cursor-pointer hover:border-brand-500/30 group relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center group-hover:bg-brand-500/10 transition-colors">
                    <Code2 className="w-5 h-5 text-zinc-400 group-hover:text-brand-400 transition-colors" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${LANG_COLORS[ws.language] || 'bg-zinc-500/20 text-zinc-400'}`}>{ws.language}</span>
                    <button onClick={(e) => deleteWorkspace(ws.id, e)} disabled={deletingId === ws.id}
                      className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded-md text-zinc-500 hover:text-red-400 transition-all" title="Delete workspace">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-lg mb-1 group-hover:text-brand-400 transition-colors">{ws.name}</h3>
                {ws.description && <p className="text-xs text-zinc-600 line-clamp-1">{ws.description}</p>}
                <div className="flex items-center gap-4 text-xs text-zinc-600 mt-4 pt-4 border-t border-surface-800">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {ws._count?.members || 1}</span>
                  <span className="flex items-center gap-1"><FolderOpen className="w-3.5 h-3.5" /> {ws._count?.files || 0}</span>
                  <span className="flex items-center gap-1 ml-auto"><Clock className="w-3.5 h-3.5" /> {new Date(ws.updatedAt).toLocaleDateString()}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
