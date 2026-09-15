const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function getApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;
  return `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

export function getWsUrl(endpoint: string): string {
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (import.meta.env.VITE_API_URL) {
    const httpUrl = import.meta.env.VITE_API_URL.replace(/\/$/, '');
    const wsBase = httpUrl.replace(/^http/, 'ws');
    return `${wsBase}${cleanPath}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${protocol}//127.0.0.1:8000${cleanPath}`;
  }
  return `${protocol}//${window.location.host}${cleanPath}`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

export async function attemptTokenRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Expected-Role': 'teacher',
      };
      const csrf = getCookie('csrf_token') || localStorage.getItem('csrf_token');
      if (csrf) headers['X-CSRF-Token'] = csrf;

      const storedRefreshToken = localStorage.getItem('refresh_token');
      if (storedRefreshToken) {
        headers['X-Refresh-Token'] = storedRefreshToken;
      }

      const res = await fetch(getApiUrl('/api/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers,
        body: storedRefreshToken ? JSON.stringify({ refresh_token: storedRefreshToken, role: 'teacher' }) : undefined,
      });
      if (res.ok) {
        const text = await res.text();
        const data = text && text.trim() ? JSON.parse(text) : null;
        if (data && data.access_token) {
          localStorage.setItem('auth_token', data.access_token);
        }
        if (data && data.refresh_token) {
          localStorage.setItem('refresh_token', data.refresh_token);
        }
        if (data && data.user && data.user.role === 'teacher') {
          localStorage.setItem('cached_user', JSON.stringify(data.user));
        }
        if (data && data.csrf_token) {
          localStorage.setItem('csrf_token', data.csrf_token);
        }
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const headers = new Headers(options.headers || {});

  // Add expected role to ensure origin isolation across portals on localhost
  if (!headers.has('X-Expected-Role')) {
    headers.set('X-Expected-Role', 'teacher');
  }

  // Add Authorization Bearer header if auth_token exists
  const authToken = localStorage.getItem('auth_token');
  if (authToken && (!headers.has('Authorization') || isRetry)) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  // Add X-Refresh-Token header if exists (for auto-renewal isolation)
  const storedRefreshToken = localStorage.getItem('refresh_token');
  if (storedRefreshToken && (!headers.has('X-Refresh-Token') || isRetry)) {
    headers.set('X-Refresh-Token', storedRefreshToken);
  }

  // Add CSRF token for state-changing HTTP methods
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    let csrfToken = getCookie('csrf_token') || localStorage.getItem('csrf_token');
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  // Ensure Content-Type is json if sending body and not FormData
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(getApiUrl(url), {
    ...options,
    headers,
    credentials: 'include', // Ensures httpOnly cookies are included
  });

  // Check for auto-renewed access and refresh tokens in response headers
  const renewedToken = response.headers.get('X-Access-Token');
  if (renewedToken) {
    localStorage.setItem('auth_token', renewedToken);
  }
  const renewedRefreshToken = response.headers.get('X-Refresh-Token');
  if (renewedRefreshToken) {
    localStorage.setItem('refresh_token', renewedRefreshToken);
  }

  // Handle 401 Unauthorized or 403 Forbidden (cross-portal cookie recovery) with automatic token refresh
  if (
    (response.status === 401 || response.status === 403) &&
    !isRetry &&
    !url.includes('/api/auth/login') &&
    !url.includes('/api/auth/refresh')
  ) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      return apiFetch<T>(url, options, true);
    }
  }

  const rawText = await response.text();
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const isHtml = contentType.includes('text/html') || (rawText && rawText.trim().startsWith('<'));

  if (isHtml) {
    throw new Error(`API endpoint ${url} returned an HTML document instead of JSON. Ensure the backend server is running on port 8000.`);
  }

  let parsedData: any = null;
  if (rawText && rawText.trim()) {
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      parsedData = rawText;
    }
  }

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    if (parsedData && typeof parsedData === 'object') {
      if (typeof parsedData.detail === 'string') {
        errorDetail = parsedData.detail;
      } else if (Array.isArray(parsedData.detail)) {
        errorDetail = parsedData.detail
          .map((item: any) => (typeof item === 'string' ? item : item.msg || item.message || JSON.stringify(item)))
          .join('; ');
      } else if (typeof parsedData.detail === 'object' && parsedData.detail.message) {
        errorDetail = parsedData.detail.message;
      } else if (parsedData.message) {
        errorDetail = parsedData.message;
      } else if (parsedData.error) {
        errorDetail = typeof parsedData.error === 'string' ? parsedData.error : JSON.stringify(parsedData.error);
      }
    } else if (typeof parsedData === 'string' && parsedData.trim()) {
      errorDetail = parsedData;
    }
    throw new Error(errorDetail);
  }

  // If response is 204 No Content or body is empty
  if (response.status === 204 || parsedData === null) {
    return {} as T;
  }

  return parsedData as T;
}
