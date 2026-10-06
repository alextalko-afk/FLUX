import { unregisterPush } from '../lib/push';
import { create } from 'zustand';
import { api } from '../lib/api';
import { realtime } from '../lib/realtime';

interface AuthUser {
  id: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  avatarUrl: string | null;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    username?: string;
  }) => Promise<any>;
  logout: () => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const result = await api.post<any>('/auth/login', { email, password });
      if (result.requiresTwoFactor) {
        throw new Error('Two-factor authentication required');
      }
      await (api as any).setToken(result.accessToken);
      set({
        user: result.user,
        isAuthenticated: true,
        isLoading: false,
      });
      realtime.connect();
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  register: async (data) => {
    set({ isLoading: true });
    try {
      const result = await api.post<any>('/auth/register', data);
      set({ isLoading: false });
      return result;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    await unregisterPush();
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    await (api as any).clearToken();
    realtime.disconnect();
    set({ user: null, isAuthenticated: false });
  },

  hydrate: async () => {
    const token = await (api as any).getToken();
    if (!token) return;
    try {
      const user = await api.get<AuthUser>('/auth/me');
      set({ user, isAuthenticated: true });
      realtime.connect();
    } catch {
      await (api as any).clearToken();
      set({ user: null, isAuthenticated: false });
    }
  },
}));
