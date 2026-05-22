'use client';
import { X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace-store';

export function EditorTabs() {
  const { openTabs, activeFile, setActiveFile, closeTab } = useWorkspaceStore();

  if (openTabs.length === 0) return null;

  return (
    <div className="h-9 bg-surface-900 border-b border-surface-800 flex items-center overflow-x-auto shrink-0">
      {openTabs.map((tab) => (
        <div key={tab.id}
          className={`flex items-center gap-2 px-3 h-full border-r border-surface-800 cursor-pointer text-xs shrink-0 transition-colors ${
            activeFile?.id === tab.id
              ? 'bg-surface-950 text-white border-t-2 border-t-brand-500'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-800'
          }`}
          onClick={() => setActiveFile(tab)}>
          <span className="truncate max-w-[120px]">{tab.name}</span>
          <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
            className="p-0.5 hover:bg-surface-700 rounded opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
