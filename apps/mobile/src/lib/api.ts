import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Configurable at build time: EXPO_PUBLIC_API_URL=https://api.example.com/api/v1
// Defaults to the host machine, which is what the Android emulator (10.0.2.2)
// and the iOS simulator / desktop web both need during local development.
const DEFAULT_API_BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3000/api/v1'
    : 'http://localhost:3000/api/v1';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;

const TOKEN_KEY = 'flux_access_token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private async getToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }

  async clearToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // ignore
    }
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      await this.clearToken();
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
      );
    }

    if (response.status === 204) {
      return undefined as T;
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

  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'DELETE',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
}

export const api = new ApiClient();
