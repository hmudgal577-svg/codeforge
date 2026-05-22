'use client';
import dynamic from 'next/dynamic';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { Code2 } from 'lucide-react';

// Dynamic import — Monaco must only load client-side
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-surface-950">
      <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
    </div>
  ),
});

// Monaco language IDs for all supported languages + common file types
const LANG_MAP: Record<string, string> = {
  // Primary execution languages
  javascript: 'javascript', typescript: 'typescript',
  python: 'python', java: 'java',
  cpp: 'cpp', c: 'c', csharp: 'csharp',
  go: 'go', rust: 'rust', ruby: 'ruby',
  php: 'php', perl: 'perl', r: 'r',
  dart: 'dart', kotlin: 'kotlin', scala: 'scala',
  swift: 'swift', lua: 'lua',
  powershell: 'powershell', bash: 'shell',
  // File extensions → Monaco language
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', pyw: 'python',
  cc: 'cpp', cxx: 'cpp', 'c++': 'cpp', hpp: 'cpp',
  h: 'c',
  cs: 'csharp',
  rs: 'rust', rb: 'ruby',
  pl: 'perl', pm: 'perl',
  kt: 'kotlin', kts: 'kotlin',
  sc: 'scala',
  ps1: 'powershell', psm1: 'powershell',
  sh: 'shell',
  // Markup & config
  html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  json: 'json', xml: 'xml', svg: 'xml',
  yaml: 'yaml', yml: 'yaml', toml: 'ini',
  markdown: 'markdown', md: 'markdown',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  dockerfile: 'dockerfile',
};

// Detect language from file extension
function detectLanguage(file: any, fallback: string): string {
  if (file?.name) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (LANG_MAP[ext]) return LANG_MAP[ext];
  }
  if (file?.language && LANG_MAP[file.language]) return LANG_MAP[file.language];
  return LANG_MAP[fallback] || 'plaintext';
}

export function CodeEditor() {
  const { activeFile, updateFileContent, workspace } = useWorkspaceStore();

  if (!activeFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-surface-950 text-zinc-600">
        <Code2 className="w-16 h-16 mb-4 text-zinc-800" />
        <p className="text-lg font-medium">No file open</p>
        <p className="text-sm mt-1">Select a file from the explorer to start editing</p>
      </div>
    );
  }

  const lang = detectLanguage(activeFile, workspace?.language || 'javascript');

  return (
    <MonacoEditor
      height="100%"
      language={lang}
      value={activeFile.content || ''}
      onChange={(value) => updateFileContent(activeFile.id, value || '')}
      theme="vs-dark"
      options={{
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontLigatures: true,
        minimap: { enabled: true, maxColumn: 80 },
        scrollBeyondLastLine: false,
        padding: { top: 16 },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        automaticLayout: true,
        wordWrap: 'on',
        tabSize: 2,
        lineNumbers: 'on',
        glyphMargin: false,
        folding: true,
        suggest: { showMethods: true, showFunctions: true },
      }}
    />
  );
}
