// ============================================
// API Client — Axios instance with interceptors
// ============================================
// Handles auth token injection, refresh on 401,
// and base URL configuration.

import Cookies from 'js-cookie';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface RequestConfig extends RequestInit {
  params?: Record<string, string>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Get token from localStorage (set by auth store)
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('codeforge_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    return url.toString();
  }

  async request<T = any>(method: string, path: string, body?: any, config?: RequestConfig): Promise<{ data: T }> {
    const url = this.buildUrl(path, config?.params);

    const res = await fetch(url, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
      ...config,
    });

    // Handle 401 — try refresh
    if (res.status === 401) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        // Retry the original request
        const retryRes = await fetch(url, {
          method,
          headers: this.getHeaders(),
          body: body ? JSON.stringify(body) : undefined,
          credentials: 'include',
        });
        const retryData = await retryRes.json();
        if (!retryRes.ok) throw { response: { data: retryData, status: retryRes.status } };
        return { data: retryData };
      }
      // Refresh failed — redirect to login
      if (typeof window !== 'undefined') {
        localStorage.removeItem('codeforge_token');
        window.location.href = '/login';
      }
    }

    const data = await res.json();
    if (!res.ok) {
      throw { response: { data, status: res.status } };
    }

    return { data };
  }

  private async tryRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (data.data?.accessToken) {
        localStorage.setItem('codeforge_token', data.data.accessToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  get<T = any>(path: string, config?: RequestConfig) {
    return this.request<T>('GET', path, undefined, config);
  }

  post<T = any>(path: string, body?: any, config?: RequestConfig) {
    return this.request<T>('POST', path, body, config);
  }

  put<T = any>(path: string, body?: any, config?: RequestConfig) {
    return this.request<T>('PUT', path, body, config);
  }

  patch<T = any>(path: string, body?: any, config?: RequestConfig) {
    return this.request<T>('PATCH', path, body, config);
  }

  delete<T = any>(path: string, config?: RequestConfig) {
    return this.request<T>('DELETE', path, undefined, config);
  }
}

export const api = new ApiClient(API_BASE);
