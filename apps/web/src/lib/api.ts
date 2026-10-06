import { useAuthStore } from '../stores/auth.store';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

/**
 * Reads the double-submit CSRF token issued alongside the refresh cookie.
 *
 * The cookie is intentionally not `httpOnly`; the server compares it against
 * the `X-CSRF-Token` header we send from here. Returns `null` before the first
 * login, which the server treats as "no token issued yet".
 */
function readCsrfToken(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`),
  );
  if (!match || !match[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Endpoints whose 401 is an answer to the request itself, never a reason to refresh. */
const NO_REFRESH_PATHS = [
  '/auth/refresh',
  '/auth/login',
  '/auth/logout',
  '/auth/register',
  '/auth/email',
  '/auth/password',
];

class ApiClient {
  private baseUrl = '/api/v1';

  private async request<T>(
    path: string,
    options: RequestInit = {},
    parseAs: 'json' | 'blob' = 'json',
    retried = false,
  ): Promise<T> {
    const token = useAuthStore.getState().accessToken;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const method = (options.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      const csrfToken = readCsrfToken();
      if (csrfToken) {
        headers[CSRF_HEADER_NAME] = csrfToken;
      }
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    // An expired access token is renewed once and the request repeated. Sign-in
    // and refresh endpoints are excluded: a 401 from them is their answer (wrong
    // password, invalid refresh token), not an expired session, and renewing
    // from inside a failing renewal would loop.
    if (response.status === 401 && !retried && !NO_REFRESH_PATHS.some((p) => path.startsWith(p))) {
      const refreshed = await useAuthStore.getState().tryRefresh();
      if (!refreshed) {
        useAuthStore.getState().logout();
        throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
      }
      return this.request<T>(path, options, parseAs, true);
    }

    if (response.status === 401 && retried) {
      // Renewed, and still refused: the session is really gone.
      useAuthStore.getState().logout();
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
    }

    if (!response.ok) {
      let errorData: any = { message: response.statusText, code: 'UNKNOWN' };
      try {
        errorData = await response.json();
      } catch {
        // ignore
      }
      throw new ApiError(
        response.status,
        errorData.code || 'UNKNOWN',
        errorData.message || response.statusText,
        typeof errorData.retryAfterSeconds === 'number' ? errorData.retryAfterSeconds : undefined,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    if (parseAs === 'blob') {
      return (await response.blob()) as T;
    }

    return response.json();
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /** Downloads a binary/file response (authenticated, with the same 401 refresh). */
  getBlob(path: string): Promise<Blob> {
    return this.request<Blob>(path, { method: 'GET' }, 'blob');
  }
}

export const api = new ApiClient();
