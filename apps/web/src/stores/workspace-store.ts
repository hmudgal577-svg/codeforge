// ============================================
// Workspace Store — Editor & Workspace State
// ============================================

import { create } from 'zustand';

interface FileItem {
  id: string;
  name: string;
  path: string;
  content?: string;
  language?: string;
}

interface WorkspaceUser {
  userId: string;
  username: string;
  avatarUrl?: string;
  color: string;
  cursor?: { lineNumber: number; column: number; fileName?: string };
}

interface WorkspaceState {
  // Workspace data
  workspace: any | null;
  files: FileItem[];
  activeFile: FileItem | null;
  openTabs: FileItem[];

  // Collaboration
  onlineUsers: WorkspaceUser[];
  cursors: Map<string, WorkspaceUser['cursor'] & { color: string; username: string }>;

  // UI state
  isSidebarOpen: boolean;
  isAiPanelOpen: boolean;
  isConsoleOpen: boolean;
  consoleOutput: string[];
  stdinInput: string;

  // Actions
  setWorkspace: (workspace: any) => void;
  setFiles: (files: FileItem[]) => void;
  setActiveFile: (file: FileItem | null) => void;
  openFile: (file: FileItem) => void;
  closeTab: (fileId: string) => void;
  updateFileContent: (fileId: string, content: string) => void;
  addFile: (file: FileItem) => void;
  removeFile: (fileId: string) => void;

  // Collaboration actions
  setOnlineUsers: (users: WorkspaceUser[]) => void;
  addOnlineUser: (user: WorkspaceUser) => void;
  removeOnlineUser: (userId: string) => void;
  updateCursor: (userId: string, cursor: any) => void;

  // UI actions
  toggleSidebar: () => void;
  toggleAiPanel: () => void;
  toggleConsole: () => void;
  addConsoleOutput: (line: string) => void;
  clearConsole: () => void;
  setStdinInput: (input: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: null,
  files: [],
  activeFile: null,
  openTabs: [],
  onlineUsers: [],
  cursors: new Map(),
  isSidebarOpen: true,
  isAiPanelOpen: false,
  isConsoleOpen: true,
  consoleOutput: [],
  stdinInput: '',

  setWorkspace: (workspace) => set({ workspace }),
  setFiles: (files) => set({ files }),

  setActiveFile: (file) => set({ activeFile: file }),

  openFile: (file) => {
    const { openTabs } = get();
    const alreadyOpen = openTabs.find((t) => t.id === file.id);
    if (!alreadyOpen) {
      set({ openTabs: [...openTabs, file], activeFile: file });
    } else {
      set({ activeFile: file });
    }
  },

  closeTab: (fileId) => {
    const { openTabs, activeFile } = get();
    const newTabs = openTabs.filter((t) => t.id !== fileId);
    const newActive = activeFile?.id === fileId
      ? newTabs[newTabs.length - 1] || null
      : activeFile;
    set({ openTabs: newTabs, activeFile: newActive });
  },

  updateFileContent: (fileId, content) => {
    const { files, activeFile, openTabs } = get();
    set({
      files: files.map((f) => f.id === fileId ? { ...f, content } : f),
      activeFile: activeFile?.id === fileId ? { ...activeFile, content } : activeFile,
      openTabs: openTabs.map((f) => f.id === fileId ? { ...f, content } : f),
    });
  },

  addFile: (file) => set((s) => ({ files: [...s.files, file] })),
  removeFile: (fileId) => set((s) => ({
    files: s.files.filter((f) => f.id !== fileId),
    openTabs: s.openTabs.filter((f) => f.id !== fileId),
    activeFile: s.activeFile?.id === fileId ? null : s.activeFile,
  })),

  setOnlineUsers: (users) => set({ onlineUsers: users }),
  addOnlineUser: (user) => set((s) => ({
    onlineUsers: [...s.onlineUsers.filter((u) => u.userId !== user.userId), user],
  })),
  removeOnlineUser: (userId) => set((s) => ({
    onlineUsers: s.onlineUsers.filter((u) => u.userId !== userId),
  })),
  updateCursor: (userId, cursor) => {
    const { cursors } = get();
    const newCursors = new Map(cursors);
    newCursors.set(userId, cursor);
    set({ cursors: newCursors });
  },

  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  toggleAiPanel: () => set((s) => ({ isAiPanelOpen: !s.isAiPanelOpen })),
  toggleConsole: () => set((s) => ({ isConsoleOpen: !s.isConsoleOpen })),
  addConsoleOutput: (line) => set((s) => ({ consoleOutput: [...s.consoleOutput, line] })),
  clearConsole: () => set({ consoleOutput: [] }),
  setStdinInput: (input) => set({ stdinInput: input }),
}));
