// ============================================
// Auth Store — Zustand State Management
// ============================================
// Manages user session, JWT token, and auth state.
// Persists token to localStorage for page reloads.

import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuth: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (user, token) => {
    localStorage.setItem('codeforge_token', token);
    localStorage.setItem('codeforge_user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem('codeforge_token');
    localStorage.removeItem('codeforge_user');
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  // Rehydrate from localStorage on app load
  hydrate: () => {
    try {
      const token = localStorage.getItem('codeforge_token');
      const userStr = localStorage.getItem('codeforge_user');
      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({ user, token, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
