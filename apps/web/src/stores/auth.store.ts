import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api, ApiError } from '../lib/api';
import { realtime } from '../lib/realtime';

interface AuthUser {
  id: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  avatarUrl: string | null;
  role: string;
  emails: { email: string; isPrimary: boolean; isVerified: boolean }[];
  twoFactorEnabled: boolean;
  twoFactorBackupCodesRemaining?: number;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, totp?: string) => Promise<void>;
  requestLoginCode: (email: string) => Promise<{ devCode?: string }>;
  loginWithCode: (email: string, code: string, totp?: string) => Promise<void>;
  requestPhoneCode: (phone: string) => Promise<{ devCode?: string }>;
  loginWithPhone: (phone: string, code: string, totp?: string) => Promise<void>;
  loginWithQr: (token: string, totp?: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    username?: string;
  }) => Promise<{ userId: string; devCode?: string }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  logout: () => void;
  hydrate: () => Promise<void>;
  tryRefresh: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

let refreshInFlight: Promise<boolean> | null = null;

/** The access token as persisted by this browser (shared by all of its tabs). */
function readStoredAccessToken(): string | null {
  try {
    const raw = window.localStorage.getItem('flux-auth');
    return raw ? (JSON.parse(raw)?.state?.accessToken ?? null) : null;
  } catch {
    return null;
  }
}

async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? await locks.request('flux-token-refresh', task) : task();
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password, totp) => {
        set({ isLoading: true });
        try {
          const result = await api.post<any>('/auth/login', { email, password, totp });
          if (result.requiresTwoFactor) {
            throw new ApiError(400, '2FA_REQUIRED', 'Two-factor code required');
          }
          set({
            user: result.user,
            accessToken: result.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
          realtime.connect();
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      requestLoginCode: async (email) => {
        return api.post<{ sent: boolean; devCode?: string }>('/auth/login/code/request', { email });
      },

      loginWithCode: async (email, code, totp) => {
        set({ isLoading: true });
        try {
          const result = await api.post<any>('/auth/login/code', { email, code, totp });
          if (result.requiresTwoFactor) {
            throw new ApiError(400, '2FA_REQUIRED', 'Two-factor code required');
          }
          set({
            user: result.user,
            accessToken: result.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
          realtime.connect();
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      requestPhoneCode: async (phone) => {
        return api.post<{ sent: boolean; devCode?: string }>('/auth/phone/login/request', { phone });
      },

      loginWithPhone: async (phone, code, totp) => {
        set({ isLoading: true });
        try {
          const result = await api.post<any>('/auth/phone/login', { phone, code, totp });
          if (result.requiresTwoFactor) {
            throw new ApiError(400, '2FA_REQUIRED', 'Two-factor code required');
          }
          set({ user: result.user, accessToken: result.accessToken, isAuthenticated: true, isLoading: false });
          realtime.connect();
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      loginWithQr: async (token, totp) => {
        const result = await api.post<any>('/auth/qr/complete', { token, totp });
        if (result.requiresTwoFactor) {
          throw new ApiError(400, '2FA_REQUIRED', 'Two-factor code required');
        }
        set({ user: result.user, accessToken: result.accessToken, isAuthenticated: true, isLoading: false });
        realtime.connect();
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

      verifyEmail: async (email, code) => {
        await api.post('/auth/email/verify', { email, code });
      },

      logout: () => {
        api.post('/auth/logout').catch(() => {});
        realtime.disconnect();
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
        });
      },

      hydrate: async () => {
        const token = get().accessToken;
        if (!token) return;
        try {
          // `api` renews an expired token by itself and repeats the request.
          const user = await api.get<AuthUser>('/auth/me');
          set({ user, isAuthenticated: true });
          realtime.connect();
        } catch {
          set({ user: null, accessToken: null, isAuthenticated: false });
        }
      },

      /**
       * Renews the access token. Refresh tokens are single-use (each refresh
       * rotates them), so two renewals at once would revoke each other and sign
       * the user out. Calls in this tab share one request, and a Web Lock
       * serialises tabs; a tab that waited for the lock adopts the token its
       * neighbour just stored instead of renewing a second time.
       */
      tryRefresh: () => {
        if (!refreshInFlight) {
          refreshInFlight = withRefreshLock(async () => {
            const current = get().accessToken;
            const stored = readStoredAccessToken();
            if (stored && stored !== current) {
              set({ accessToken: stored });
              realtime.connect();
              return true;
            }

            try {
              const result = await api.post<{ accessToken: string }>('/auth/refresh');
              set({ accessToken: result.accessToken });
              realtime.connect();
              return true;
            } catch {
              return false;
            }
          }).finally(() => {
            refreshInFlight = null;
          });
        }
        return refreshInFlight;
      },

      refreshUser: async () => {
        try {
          const user = await api.get<AuthUser>('/auth/me');
          set({ user });
        } catch {
          // ignore
        }
      },
    }),
    {
      name: 'flux-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
      }),
    },
  ),
);
