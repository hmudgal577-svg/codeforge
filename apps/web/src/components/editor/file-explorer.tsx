'use client';
import { FileText, FolderOpen, Plus, Trash2, ChevronRight, ChevronDown, Pencil, Check, X, FilePlus } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { api } from '@/lib/api';
import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';

const FILE_ICONS: Record<string, string> = {
  // Languages
  js: '🟨', jsx: '🟨', mjs: '🟨', ts: '🔷', tsx: '🔷',
  py: '🐍', java: '☕', cpp: '⚙️', cc: '⚙️', c: '🔧', h: '🔧',
  go: '🔵', rs: '🦀', rb: '💎', php: '🐘', pl: '🐪',
  r: '📊', dart: '🎯', kt: '🟣', scala: '🔴', swift: '🍎',
  cs: '🟢', lua: '🌙', ps1: '💠', sh: '🖥️',
  // Web & Config
  html: '🌐', css: '🎨', scss: '🎨', json: '📋', yaml: '📋', yml: '📋',
  md: '📝', sql: '🗃️', xml: '📄', svg: '🖼️', toml: '⚙️',
  // Other
  dockerfile: '🐳', env: '🔐', gitignore: '🙈',
};

export function FileExplorer() {
  const { files, activeFile, openFile, workspace, addFile, removeFile } = useWorkspaceStore();
  const [expanded, setExpanded] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ fileId: string; x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (isCreating && inputRef.current) inputRef.current.focus(); }, [isCreating]);
  useEffect(() => { if (renamingId && renameRef.current) renameRef.current.focus(); }, [renamingId]);

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  const getIcon = (name: string) => {
    const ext = name.split('.').pop() || '';
    return FILE_ICONS[ext] || '📄';
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim() || !workspace) return;
    try {
      const res = await api.post(`/workspaces/${workspace.id}/files`, {
        name: newFileName.trim(),
        path: `/${newFileName.trim()}`,
      });
      addFile(res.data.data);
      openFile(res.data.data);
      toast.success('File created');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create file');
    }
    setNewFileName('');
    setIsCreating(false);
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!workspace) return;
    try {
      await api.delete(`/workspaces/${workspace.id}/files/${fileId}`);
      removeFile(fileId);
      toast.success('File deleted');
    } catch {
      toast.error('Failed to delete file');
    }
    setContextMenu(null);
  };

  const handleRenameFile = async (fileId: string) => {
    if (!renameValue.trim() || !workspace) return;
    try {
      const res = await api.put(`/workspaces/${workspace.id}/files/${fileId}/rename`, {
        name: renameValue.trim(),
      });
      // Update file in store
      const { files: storeFiles } = useWorkspaceStore.getState();
      const updated = res.data.data;
      useWorkspaceStore.setState({
        files: storeFiles.map((f) => f.id === fileId ? { ...f, name: updated.name, path: updated.path, language: updated.language } : f),
      });
      toast.success('File renamed');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to rename');
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    setContextMenu({ fileId, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-surface-800">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Explorer</span>
        <button onClick={() => setIsCreating(true)}
          className="p-1 hover:bg-surface-700 rounded text-zinc-500 hover:text-white transition-colors" title="New File">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {/* Root folder */}
        <button onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white hover:bg-surface-800 transition-colors">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <FolderOpen className="w-3.5 h-3.5 text-brand-400" />
          <span className="truncate">{workspace?.name || 'Project'}</span>
        </button>

        {expanded && (
          <>
            {/* New file input */}
            {isCreating && (
              <div className="flex items-center gap-1 pl-8 pr-2 py-1">
                <FilePlus className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                <input ref={inputRef} type="text" value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFile(); if (e.key === 'Escape') { setIsCreating(false); setNewFileName(''); } }}
                  placeholder="filename.js"
                  className="flex-1 bg-surface-800 border border-brand-500/50 rounded px-2 py-0.5 text-xs text-white placeholder-zinc-600 focus:outline-none" />
                <button onClick={handleCreateFile} className="p-0.5 text-emerald-400 hover:text-emerald-300"><Check className="w-3 h-3" /></button>
                <button onClick={() => { setIsCreating(false); setNewFileName(''); }} className="p-0.5 text-zinc-500 hover:text-white"><X className="w-3 h-3" /></button>
              </div>
            )}

            {/* File list */}
            {files.map((file) => (
              <div key={file.id} onContextMenu={(e) => handleContextMenu(e, file.id)}>
                {renamingId === file.id ? (
                  <div className="flex items-center gap-1 pl-8 pr-2 py-1">
                    <input ref={renameRef} type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameFile(file.id); if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); } }}
                      className="flex-1 bg-surface-800 border border-brand-500/50 rounded px-2 py-0.5 text-xs text-white focus:outline-none" />
                    <button onClick={() => handleRenameFile(file.id)} className="p-0.5 text-emerald-400"><Check className="w-3 h-3" /></button>
                    <button onClick={() => { setRenamingId(null); setRenameValue(''); }} className="p-0.5 text-zinc-500"><X className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <div onClick={() => openFile(file)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openFile(file); }}
                    className={`w-full flex items-center gap-2 pl-8 pr-3 py-1.5 text-sm transition-colors group cursor-pointer ${
                      activeFile?.id === file.id
                        ? 'bg-brand-500/10 text-brand-400 border-r-2 border-brand-500'
                        : 'text-zinc-400 hover:text-white hover:bg-surface-800'
                    }`}>
                    <span className="text-xs">{getIcon(file.name)}</span>
                    <span className="truncate flex-1 text-left">{file.name}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setRenamingId(file.id); setRenameValue(file.name); }}
                        className="p-0.5 hover:text-brand-400" title="Rename">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }}
                        className="p-0.5 hover:text-red-400" title="Delete">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {files.length === 0 && !isCreating && (
              <p className="text-xs text-zinc-600 px-4 py-6 text-center">No files yet</p>
            )}
          </>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed z-50 bg-surface-800 border border-surface-700 rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={() => { setRenamingId(contextMenu.fileId); const f = files.find(f => f.id === contextMenu.fileId); setRenameValue(f?.name || ''); setContextMenu(null); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-surface-700 transition-colors">
            <Pencil className="w-3.5 h-3.5" /> Rename
          </button>
          <button onClick={() => handleDeleteFile(contextMenu.fileId)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-surface-700 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
