'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield, Users, Activity, Cpu, Database, AlertTriangle, BarChart3, Clock, Code2, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const router = useRouter();
  const { user, hydrate, logout } = useAuthStore();
  const [metrics, setMetrics] = useState<any>(null);
  const [execStats, setExecStats] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { hydrate(); }, []);

  useEffect(() => {
    if (user?.role !== 'ADMIN') { router.push('/dashboard'); return; }
    loadData();
    const interval = setInterval(loadData, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [user]);

  const loadData = async () => {
    try {
      const [m, e, a] = await Promise.all([
        api.get('/admin/metrics'),
        api.get('/admin/execution-stats'),
        api.get('/admin/audit-logs'),
      ]);
      setMetrics(m.data.data);
      setExecStats(e.data.data);
      setAuditLogs(a.data.data || []);
    } catch { toast.error('Failed to load admin data'); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="h-screen bg-surface-950 flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );

  const statCards = [
    { label: 'Total Users', value: metrics?.totalUsers || 0, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Workspaces', value: metrics?.totalWorkspaces || 0, icon: Database, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Executions (24h)', value: metrics?.recentExecutions || 0, icon: Activity, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Pending Jobs', value: metrics?.pendingJobs || 0, icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { label: 'Failed (24h)', value: metrics?.failedJobs || 0, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: 'AI Requests (24h)', value: metrics?.aiRequests || 0, icon: BarChart3, color: 'text-brand-400', bg: 'bg-brand-500/10' },
  ];

  return (
    <div className="min-h-screen bg-surface-950">
      <header className="border-b border-surface-800 bg-surface-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-700 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold">Admin Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/dashboard')} className="btn-secondary text-sm py-1.5 px-4">← Back to IDE</button>
            <button onClick={() => { logout(); router.push('/'); }} className="text-zinc-500 hover:text-red-400"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {statCards.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-surface-900 border border-surface-700 rounded-xl p-4">
              <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
                <s.icon className={`w-4.5 h-4.5 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
            </motion.div>
          ))}
        </div>

        {/* System Info */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-surface-900 border border-surface-700 rounded-xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Cpu className="w-4 h-4 text-brand-400" /> System</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Uptime</span><span>{Math.floor((metrics?.uptime || 0) / 3600)}h {Math.floor(((metrics?.uptime || 0) % 3600) / 60)}m</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Heap Used</span><span>{Math.round((metrics?.memoryUsage?.heapUsed || 0) / 1024 / 1024)}MB</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Heap Total</span><span>{Math.round((metrics?.memoryUsage?.heapTotal || 0) / 1024 / 1024)}MB</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">RSS</span><span>{Math.round((metrics?.memoryUsage?.rss || 0) / 1024 / 1024)}MB</span></div>
            </div>
          </div>

          <div className="bg-surface-900 border border-surface-700 rounded-xl p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> Execution Stats</h3>
            <div className="space-y-3 text-sm">
              {execStats?.byStatus?.map((s: any) => (
                <div key={s.status} className="flex justify-between">
                  <span className="text-zinc-500">{s.status}</span>
                  <span className={s.status === 'FAILED' ? 'text-red-400' : s.status === 'COMPLETED' ? 'text-emerald-400' : 'text-zinc-300'}>{s._count}</span>
                </div>
              ))}
              {execStats?.byLanguage?.map((l: any) => (
                <div key={l.language} className="flex justify-between">
                  <span className="text-zinc-500">{l.language}</span><span>{l._count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Audit Logs */}
        <div className="bg-surface-900 border border-surface-700 rounded-xl p-6">
          <h3 className="font-semibold mb-4">Recent Audit Logs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-zinc-500 border-b border-surface-800">
                <th className="pb-3 pr-4">Time</th><th className="pb-3 pr-4">User</th><th className="pb-3 pr-4">Action</th><th className="pb-3">Resource</th>
              </tr></thead>
              <tbody>
                {auditLogs.slice(0, 20).map((log) => (
                  <tr key={log.id} className="border-b border-surface-800/50">
                    <td className="py-2.5 pr-4 text-zinc-500">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="py-2.5 pr-4">{log.user?.username || 'system'}</td>
                    <td className="py-2.5 pr-4"><span className="px-2 py-0.5 bg-surface-800 rounded text-xs">{log.action}</span></td>
                    <td className="py-2.5 text-zinc-400">{log.resource}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-zinc-600">No audit logs yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
