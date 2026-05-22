'use client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { Trash2, Terminal, Keyboard } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function ExecutionConsole() {
  const { consoleOutput, clearConsole, stdinInput, setStdinInput } = useWorkspaceStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [consoleOutput]);

  return (
    <div className="h-full flex flex-col bg-surface-950">
      <div className="h-8 px-3 flex items-center justify-between border-b border-surface-800 bg-surface-900 shrink-0">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
          <Terminal className="w-3.5 h-3.5" /> Console
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowInput(!showInput)}
            className={`p-1 rounded text-xs flex items-center gap-1 transition-colors ${showInput ? 'bg-brand-500/20 text-brand-400' : 'hover:bg-surface-700 text-zinc-500 hover:text-white'}`}
            title="Toggle Input (stdin)"
          >
            <Keyboard className="w-3 h-3" />
            <span className="text-[10px]">Input</span>
          </button>
          <button onClick={clearConsole} className="p-1 hover:bg-surface-700 rounded text-zinc-500 hover:text-white" title="Clear">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Stdin Input Area */}
      {showInput && (
        <div className="px-3 py-2 border-b border-surface-800 bg-surface-900/50">
          <label className="text-[10px] text-zinc-500 mb-1 block">📥 Program Input (stdin) — yahan input daalein jo code ko chahiye</label>
          <textarea
            value={stdinInput}
            onChange={(e) => setStdinInput(e.target.value)}
            placeholder="Example: 5&#10;(har line ek alag input hai)"
            className="w-full px-2 py-1.5 bg-surface-800 border border-surface-700 rounded text-xs font-mono text-emerald-300 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-brand-500/50 resize-none"
            rows={2}
          />
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        {consoleOutput.length === 0 ? (
          <span className="text-zinc-600">Output will appear here when you run code...
          {'\n\n'}💡 Tip: Agar code mein input chahiye (cin/scanf), toh upar "Input" button click karein</span>
        ) : (
          consoleOutput.map((line, i) => (
            <div key={i} className={`whitespace-pre-wrap ${line.startsWith('⚠') || line.startsWith('✗') ? 'text-red-400' : line.startsWith('✓') ? 'text-emerald-400' : line.startsWith('▶') ? 'text-brand-400' : line.startsWith('📥') ? 'text-yellow-400' : 'text-zinc-300'}`}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
