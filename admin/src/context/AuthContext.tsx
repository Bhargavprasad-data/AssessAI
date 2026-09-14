import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { apiFetch, attemptTokenRefresh } from '../api/client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string, role: 'teacher' | 'student' | 'admin') => Promise<User>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem('cached_user');
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      return parsed && parsed.role === 'admin' ? parsed : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('cached_user');
      if (!cached) return true;
      const parsed = JSON.parse(cached);
      return !(parsed && parsed.role === 'admin');
    } catch {
      return true;
    }
  });

  // Verify and sync current session on mount
  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      const MAX_RETRIES = 2;
      const BACKOFF_MS = [800, 1600];

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const userData = await apiFetch<User | null>('/api/auth/me');
          if (!isMounted) return;

          if (userData && userData.id && userData.role === 'admin') {
            setUser(userData);
            localStorage.setItem('cached_user', JSON.stringify(userData));
            if (isMounted) setLoading(false);
            return;
          }

          // If null or mismatched role returned, try explicit isolated refresh
          const refreshed = await attemptTokenRefresh();
          if (refreshed) {
            const retryUser = await apiFetch<User>('/api/auth/me');
            if (isMounted && retryUser && retryUser.id && retryUser.role === 'admin') {
              setUser(retryUser);
              localStorage.setItem('cached_user', JSON.stringify(retryUser));
              setLoading(false);
              return;
            }
          }

          // Not a valid admin session on server
          if (isMounted) {
            setUser(null);
            localStorage.removeItem('cached_user');
            localStorage.removeItem('auth_token');
            localStorage.removeItem('refresh_token');
            setLoading(false);
          }
          return;

        } catch (err: any) {
          const isTransientError =
            err?.message?.includes('502') ||
            err?.message?.includes('503') ||
            err?.message?.includes('504') ||
            err?.message?.includes('Bad Gateway') ||
            err?.message?.includes('fetch') ||
            err?.message?.includes('Network');

          if (isTransientError && attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
            continue;
          }

          const isAuthError =
            err?.message?.includes('401') ||
            err?.message?.includes('403') ||
            err?.message?.includes('Forbidden') ||
            err?.message?.includes('Session expired') ||
            err?.message?.includes('Authentication required') ||
            err?.message?.includes('Missing or expired') ||
            err?.message?.includes('role mismatch');

          if (isAuthError) {
            try {
              const refreshed = await attemptTokenRefresh();
              if (refreshed) {
                const retryUser = await apiFetch<User>('/api/auth/me');
                if (isMounted && retryUser && retryUser.id && retryUser.role === 'admin') {
                  setUser(retryUser);
                  localStorage.setItem('cached_user', JSON.stringify(retryUser));
                  if (isMounted) setLoading(false);
                  return;
                }
              }
            } catch {}

            if (isMounted) {
              setUser(null);
              localStorage.removeItem('cached_user');
              localStorage.removeItem('auth_token');
              localStorage.removeItem('refresh_token');
              setLoading(false);
            }
            return;
          }

          // Transient network error: keep existing session if cached
          if (isMounted) {
            setLoading(false);
          }
          return;
        }
      }

      if (isMounted) setLoading(false);
    }

    checkAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await apiFetch<{ user: User; csrf_token: string; access_token?: string; refresh_token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.csrf_token) localStorage.setItem('csrf_token', res.csrf_token);
    if (res.access_token) localStorage.setItem('auth_token', res.access_token);
    if (res.refresh_token) localStorage.setItem('refresh_token', res.refresh_token);
    if (res.user) localStorage.setItem('cached_user', JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  };

  const register = async (name: string, email: string, password: string, role: 'teacher' | 'student' | 'admin'): Promise<User> => {
    const res = await apiFetch<{ user: User; csrf_token: string; access_token?: string; refresh_token?: string }>(`/api/auth/register?role=${role}`, {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    if (res.csrf_token) localStorage.setItem('csrf_token', res.csrf_token);
    if (res.access_token) localStorage.setItem('auth_token', res.access_token);
    if (res.refresh_token) localStorage.setItem('refresh_token', res.refresh_token);
    if (res.user) localStorage.setItem('cached_user', JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  };

  const logout = async (): Promise<void> => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors during logout
    } finally {
      localStorage.removeItem('csrf_token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('cached_user');
      setUser(null);
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAdmin: user?.role === 'admin',
        isTeacher: user?.role === 'teacher',
        isStudent: user?.role === 'student',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
