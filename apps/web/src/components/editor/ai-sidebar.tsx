'use client';
import { useState } from 'react';
import { Brain, Send, Loader2, Bug, Zap, Shield, BarChart3, RefreshCw, FileText, BookOpen, Network, MemoryStick, Lock } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { api } from '@/lib/api';
import ReactMarkdown from 'react-markdown';

const ANALYSIS_TYPES = [
  { id: 'EXPLAIN', label: 'Explain', icon: FileText, color: 'text-blue-400' },
  { id: 'DEBUG', label: 'Debug', icon: Bug, color: 'text-red-400' },
  { id: 'OPTIMIZE', label: 'Optimize', icon: Zap, color: 'text-yellow-400' },
  { id: 'VULNERABILITY', label: 'Security', icon: Shield, color: 'text-orange-400' },
  { id: 'COMPLEXITY', label: 'Complexity', icon: BarChart3, color: 'text-purple-400' },
  { id: 'REFACTOR', label: 'Refactor', icon: RefreshCw, color: 'text-emerald-400' },
  { id: 'SUMMARIZE', label: 'Summary', icon: BookOpen, color: 'text-cyan-400' },
  { id: 'ARCHITECTURE', label: 'Architecture', icon: Network, color: 'text-pink-400' },
  { id: 'MEMORY', label: 'Memory', icon: MemoryStick, color: 'text-teal-400' },
  { id: 'DEADLOCK', label: 'Deadlock', icon: Lock, color: 'text-amber-400' },
];

export function AiSidebar() {
  const { activeFile, workspace } = useWorkspaceStore();
  const [selectedType, setSelectedType] = useState('EXPLAIN');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!activeFile?.content || !workspace) return;
    setLoading(true); setResult(null);
    try {
      const res = await api.post('/ai/analyze', {
        workspaceId: workspace.id,
        type: selectedType,
        code: activeFile.content,
        language: workspace.language,
      });
      const reqId = res.data.data.requestId;
      // Poll for result
      const poll = setInterval(async () => {
        const r = await api.get(`/ai/result/${reqId}`);
        if (['COMPLETED','FAILED'].includes(r.data.data.status)) {
          clearInterval(poll);
          setResult(r.data.data.result || 'No result');
          setLoading(false);
        }
      }, 1500);
    } catch { setResult('Error running analysis'); setLoading(false); }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-surface-800 flex items-center gap-2">
        <Brain className="w-4 h-4 text-brand-400" />
        <span className="text-sm font-semibold">AI Assistant</span>
      </div>

      <div className="p-3 border-b border-surface-800">
        <div className="grid grid-cols-5 gap-1.5">
          {ANALYSIS_TYPES.map(t => (
            <button key={t.id} onClick={() => setSelectedType(t.id)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-all ${selectedType === t.id ? 'bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30' : 'text-zinc-500 hover:bg-surface-800 hover:text-zinc-300'}`}>
              <t.icon className={`w-4 h-4 ${selectedType === t.id ? t.color : ''}`} />
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={analyze} disabled={loading || !activeFile}
          className="btn-primary w-full mt-3 flex items-center justify-center gap-2 text-sm py-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : <><Send className="w-4 h-4" /> Analyze Code</>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!result && !loading && (
          <div className="text-center text-zinc-600 text-sm py-8">
            <Brain className="w-10 h-10 mx-auto mb-3 text-zinc-800" />
            <p>Select an analysis type and click Analyze</p>
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        )}
        {result && (
          <div className="prose prose-invert prose-sm max-w-none text-zinc-300 [&_h2]:text-white [&_h2]:text-base [&_h3]:text-white [&_h3]:text-sm [&_code]:bg-surface-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-surface-800 [&_pre]:rounded-lg [&_table]:text-xs">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
