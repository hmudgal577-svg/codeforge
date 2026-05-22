'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSocket } from '@/hooks/use-socket';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { api } from '@/lib/api';
import { FileExplorer } from '@/components/editor/file-explorer';
import { EditorTabs } from '@/components/editor/editor-tabs';
import { CodeEditor } from '@/components/editor/code-editor';
import { ExecutionConsole } from '@/components/editor/execution-console';
import { AiSidebar } from '@/components/editor/ai-sidebar';
import { PresenceBar } from '@/components/editor/presence-bar';
import { ChatPanel } from '@/components/editor/chat-panel';
import { InviteModal } from '@/components/editor/invite-modal';
import { PanelLeftClose, PanelLeftOpen, Brain, Terminal, Play, Square, Users, Save } from 'lucide-react';
import toast from 'react-hot-toast';

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { hydrate } = useAuthStore();
  const {
    workspace, setWorkspace, files, setFiles, activeFile, openFile,
    isSidebarOpen, toggleSidebar, isAiPanelOpen, toggleAiPanel,
    isConsoleOpen, toggleConsole, addConsoleOutput, clearConsole,
  } = useWorkspaceStore();
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const { socket, emit } = useSocket(id || null);

  useEffect(() => { hydrate(); }, []);

  useEffect(() => {
    if (id) loadWorkspace(id);
  }, [id]);

  const loadWorkspace = async (wsId: string) => {
    try {
      const res = await api.get(`/workspaces/${wsId}`);
      const ws = res.data.data;
      setWorkspace(ws);
      setFiles(ws.files || []);
      if (ws.files?.length > 0) openFile(ws.files[0]);
    } catch { toast.error('Failed to load workspace'); }
    finally { setLoading(false); }
  };

  const saveFile = useCallback(async () => {
    if (!activeFile || !workspace) return;
    setSaving(true);
    try {
      await api.put(`/workspaces/${workspace.id}/files/${activeFile.id}`, {
        content: activeFile.content || '',
      });
      toast.success('File saved', { duration: 1500 });
      // Notify collaborators
      emit('file:change', {
        workspaceId: workspace.id,
        action: 'update',
        file: { id: activeFile.id, name: activeFile.name },
      });
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  }, [activeFile, workspace]);

  const runCode = useCallback(async () => {
    if (!activeFile || !workspace) return;
    const { stdinInput } = useWorkspaceStore.getState();
    setExecuting(true);
    clearConsole();
    if (!isConsoleOpen) toggleConsole();
    addConsoleOutput(`▶ Running ${activeFile.name}...`);
    if (stdinInput.trim()) {
      addConsoleOutput(`📥 Input: ${stdinInput.trim()}`);
    }

    // Detect language from file extension
    const ext = activeFile.name?.split('.').pop()?.toLowerCase() || '';
    const extLangMap: Record<string, string> = {
      // Python
      py: 'python', pyw: 'python',
      // JavaScript
      js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
      // TypeScript
      ts: 'typescript', tsx: 'typescript',
      // C/C++
      cpp: 'cpp', cc: 'cpp', cxx: 'cpp', 'c++': 'cpp', hpp: 'cpp',
      c: 'c', h: 'c',
      // Java
      java: 'java',
      // Go
      go: 'go',
      // Rust
      rs: 'rust',
      // Ruby
      rb: 'ruby',
      // PHP
      php: 'php',
      // Perl
      pl: 'perl', pm: 'perl',
      // R
      r: 'r',
      // Dart
      dart: 'dart',
      // Kotlin
      kt: 'kotlin', kts: 'kotlin',
      // Scala
      scala: 'scala', sc: 'scala',
      // Swift
      swift: 'swift',
      // C#
      cs: 'csharp',
      // Lua
      lua: 'lua',
      // Shell / Scripting
      ps1: 'powershell', psm1: 'powershell',
      sh: 'bash', bash: 'bash',
    };
    const language = extLangMap[ext] || workspace.language || 'python';

    try {
      const res = await api.post('/execution', {
        workspaceId: workspace.id,
        language,
        code: activeFile.content || '',
        stdin: stdinInput.trim() || undefined,
      });
      const jobId = res.data.data.jobId;
      // Poll for results
      const poll = setInterval(async () => {
        try {
          const r = await api.get(`/execution/${jobId}`);
          const job = r.data.data;
          if (['COMPLETED','FAILED','TIMEOUT'].includes(job.status)) {
            clearInterval(poll);
            if (job.output) addConsoleOutput(job.output);
            if (job.error) addConsoleOutput(`⚠ ${job.error}`);
            addConsoleOutput(`\n✓ ${job.status} (${job.executionMs || 0}ms)`);
            setExecuting(false);
          }
        } catch { clearInterval(poll); setExecuting(false); }
      }, 1000);
    } catch (err: any) {
      addConsoleOutput(`✗ Error: ${err.response?.data?.message || 'Execution failed'}`);
      setExecuting(false);
    }
  }, [activeFile, workspace, isConsoleOpen]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSave: saveFile,
    onRun: runCode,
    onToggleSidebar: toggleSidebar,
    onToggleConsole: toggleConsole,
    onToggleAiPanel: toggleAiPanel,
  });

  if (loading) return (
    <div className="h-screen bg-surface-950 flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="h-screen bg-surface-950 flex flex-col overflow-hidden">
      {/* Top toolbar */}
      <header className="h-12 border-b border-surface-800 bg-surface-900 flex items-center px-3 gap-2 shrink-0">
        <button onClick={toggleSidebar} className="p-1.5 hover:bg-surface-700 rounded-md text-zinc-400 hover:text-white transition-colors" title="Toggle Sidebar (Ctrl+B)">
          {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>
        <div className="h-5 w-px bg-surface-700" />
        <span className="text-sm font-medium text-zinc-300 truncate">{workspace?.name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <PresenceBar />
          <div className="h-5 w-px bg-surface-700 mx-1" />
          <button onClick={() => setShowInvite(true)}
            className="p-1.5 hover:bg-surface-700 rounded-md text-zinc-500 hover:text-white transition-colors" title="Team Members">
            <Users className="w-4 h-4" />
          </button>
          <button onClick={saveFile} disabled={saving || !activeFile}
            className={`p-1.5 rounded-md transition-colors ${saving ? 'text-brand-400' : 'text-zinc-500 hover:text-white'}`} title="Save (Ctrl+S)">
            <Save className="w-4 h-4" />
          </button>
          <button onClick={runCode} disabled={executing || !activeFile}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${executing ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}
            title="Run (Ctrl+Enter)">
            {executing ? <><Square className="w-3 h-3" /> Running</> : <><Play className="w-3 h-3" /> Run</>}
          </button>
          <button onClick={toggleConsole} className={`p-1.5 rounded-md transition-colors ${isConsoleOpen ? 'bg-surface-700 text-white' : 'text-zinc-500 hover:text-white'}`} title="Console (Ctrl+J)">
            <Terminal className="w-4 h-4" />
          </button>
          <button onClick={toggleAiPanel} className={`p-1.5 rounded-md transition-colors ${isAiPanelOpen ? 'bg-brand-500/20 text-brand-400' : 'text-zinc-500 hover:text-white'}`} title="AI Assistant (Ctrl+/)">
            <Brain className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main editor area */}
      <div className="flex-1 flex overflow-hidden">
        {/* File explorer sidebar */}
        {isSidebarOpen && (
          <div className="w-60 border-r border-surface-800 bg-surface-900 shrink-0 overflow-y-auto">
            <FileExplorer />
          </div>
        )}

        {/* Editor + console */}
        <div className="flex-1 flex flex-col min-w-0">
          <EditorTabs />
          <div className="flex-1 min-h-0">
            <CodeEditor />
          </div>
          {isConsoleOpen && (
            <div className="h-48 border-t border-surface-800 shrink-0">
              <ExecutionConsole />
            </div>
          )}
        </div>

        {/* AI sidebar */}
        {isAiPanelOpen && (
          <div className="w-80 border-l border-surface-800 bg-surface-900 shrink-0 overflow-hidden">
            <AiSidebar />
          </div>
        )}
      </div>

      {/* Chat panel (floating) */}
      {socket && workspace && (
        <ChatPanel socket={socket} workspaceId={workspace.id} />
      )}

      {/* Invite modal */}
      {workspace && (
        <InviteModal
          isOpen={showInvite}
          onClose={() => setShowInvite(false)}
          workspaceId={workspace.id}
        />
      )}
    </div>
  );
}
