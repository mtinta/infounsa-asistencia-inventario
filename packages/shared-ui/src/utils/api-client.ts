/**
 * api-client.ts — Factoría y cliente HTTP transversal para Kioscos InfoUNSA
 * Gestiona tokens JWT con auto-refresh, soporte de Electron (safeStorage/bridge)
 * y modo navegador en localStorage.
 */

import { AuthTokenPayload, DomainError, DomainErrorCode } from '@infounsa/shared-types';

export interface ApiClientConfig {
  defaultPort: number;
  defaultHost?: string;
  storagePrefix: string; // 'ast_' or 'inv_'
  serviceName: string;   // 'asistencia-api' or 'inventario-api'
  serviceDisplayName: string; // 'Asistencia' or 'Inventario'
  getElectronBridge?: () => { setAuthToken?: (tokens: AuthTokenPayload) => Promise<void>; getAuthStateSync?: () => AuthTokenPayload } | undefined;
  includeApiUrlInSetAuth?: boolean;
}

export interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

export interface AuthUserSession {
  id?: number | string;
  username?: string;
  full_name?: string;
  email?: string;
  role?: string;
  status?: string;
  [key: string]: unknown;
}

export function createApiClient(config: ApiClientConfig) {
  const defaultHost = config.defaultHost || 'localhost';
  const DEFAULT_API_BASE = `http://${defaultHost}:${config.defaultPort}`;
  const legacyPort = config.defaultPort === 43000 ? '3000' : '3001';

  const STORAGE_KEYS = {
    ACCESS_TOKEN: `${config.storagePrefix}access_token`,
    REFRESH_TOKEN: `${config.storagePrefix}refresh_token`,
    USER: `${config.storagePrefix}user`,
    API_URL: `${config.storagePrefix}api_url`,
  };

  function getBridge() {
    if (config.getElectronBridge) {
      return config.getElectronBridge();
    }
    return (window as any).electronAPI || (window as any).electron;
  }

  function migrateLegacyApiBase(value: string | null): string {
    if (!value) return DEFAULT_API_BASE;
    try {
      const url = new URL(value);
      const isPreviousRemote = url.hostname === '217.216.90.70' && url.port === String(config.defaultPort);
      const isLegacyLocalPort = (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === legacyPort;
      if (isPreviousRemote || isLegacyLocalPort) {
        localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
        return DEFAULT_API_BASE;
      }
    } catch {
      return DEFAULT_API_BASE;
    }
    return value;
  }

  let apiBase = migrateLegacyApiBase(localStorage.getItem(STORAGE_KEYS.API_URL));
  if (apiBase !== localStorage.getItem(STORAGE_KEYS.API_URL)) {
    localStorage.setItem(STORAGE_KEYS.API_URL, apiBase);
  }

  function clearPlaintextTokenCache() {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  }

  if (getBridge()?.getAuthStateSync) {
    clearPlaintextTokenCache();
  }

  function getApiBase(): string {
    return apiBase;
  }

  function updateApiBase(url: string) {
    apiBase = url;
    localStorage.setItem(STORAGE_KEYS.API_URL, url);
  }

  function getStoredTokens(): StoredTokens {
    const bridge = getBridge();
    if (bridge?.getAuthStateSync) {
      clearPlaintextTokenCache();
      const tokenState = bridge.getAuthStateSync();
      return {
        accessToken: tokenState?.accessToken ?? null,
        refreshToken: tokenState?.refreshToken ?? null,
      };
    }

    return {
      accessToken: localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN),
      refreshToken: localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
    };
  }

  function storeSession(accessToken: string, refreshToken: string, user: object) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    const bridge = getBridge();
    if (bridge?.setAuthToken) {
      clearPlaintextTokenCache();
      const payload: AuthTokenPayload = { accessToken, refreshToken };
      if (config.includeApiUrlInSetAuth) {
        payload.apiUrl = apiBase;
      }
      bridge.setAuthToken(payload);
    } else {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    }
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    const bridge = getBridge();
    if (bridge?.setAuthToken) {
      const payload: AuthTokenPayload = { accessToken: null, refreshToken: null };
      if (config.includeApiUrlInSetAuth) {
        payload.apiUrl = apiBase;
      }
      bridge.setAuthToken(payload);
    }
  }

  function getStoredUser(): AuthUserSession | null {
    try {
      const u = localStorage.getItem(STORAGE_KEYS.USER);
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  }

  let isRefreshing = false;
  let refreshQueue: Array<(token: string | null) => void> = [];

  async function refreshAccessToken(): Promise<string | null> {
    const { refreshToken } = getStoredTokens();
    if (!refreshToken) {
      clearSession();
      return null;
    }

    if (isRefreshing) {
      return new Promise(resolve => refreshQueue.push(resolve));
    }

    isRefreshing = true;

    try {
      const res = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        clearSession();
        return null;
      }
      const data = await res.json();
      const bridge = getBridge();
      if (bridge?.setAuthToken) {
        clearPlaintextTokenCache();
        const payload: any = { accessToken: data.access_token, refreshToken };
        if (config.includeApiUrlInSetAuth) {
          payload.apiUrl = apiBase;
        }
        bridge.setAuthToken(payload);
      } else {
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
      }
      refreshQueue.forEach(cb => cb(data.access_token));
      return data.access_token;
    } catch {
      clearSession();
      return null;
    } finally {
      isRefreshing = false;
      refreshQueue = [];
    }
  }

  async function apiFetch(
    path: string,
    options: RequestInit = {},
    onUnauthorized?: () => void,
  ): Promise<Response> {
    const { accessToken } = getStoredTokens();
    const headers = new Headers(options.headers ?? {});

    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    if (accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const url = path.startsWith('http') ? path : `${apiBase}${path}`;
    let res = await fetch(url, { ...options, headers });

    if (res.status === 401 && !url.includes('/auth/refresh') && !url.includes('/auth/login')) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        headers.set('Authorization', `Bearer ${newToken}`);
        res = await fetch(url, { ...options, headers });
      } else {
        onUnauthorized?.();
      }
    }

    return res;
  }

  async function apiLogin(username: string, password: string) {
    try {
      const healthRes = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(3000) });
      if (healthRes.ok) {
        const health = await healthRes.json().catch(() => null);
        if (health && health.service !== config.serviceName) {
          throw new DomainError(
            DomainErrorCode.ERR_TERMINAL_MISMATCH,
            `El servidor configurado no corresponde a la API de ${config.serviceDisplayName}.`
          );
        }
      }
    } catch (err: unknown) {
      if (DomainError.isDomainError(err) && err.code === DomainErrorCode.ERR_TERMINAL_MISMATCH) {
        throw err;
      }
    }

    const res = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.message || 'Credenciales incorrectas';
      if (res.status === 401) {
        throw new DomainError(DomainErrorCode.ERR_INVALID_CREDENTIALS, msg);
      }
      throw new DomainError(DomainErrorCode.ERR_UNAUTHORIZED, msg);
    }
    return res.json();
  }

  async function apiRegister(data: Record<string, unknown>) {
    const res = await fetch(`${apiBase}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = Array.isArray(err.message) ? err.message.join('. ') : (err.message || 'Error al registrar');
      if (res.status === 409 || msg.toLowerCase().includes('uso') || msg.toLowerCase().includes('registrado')) {
        throw new DomainError(DomainErrorCode.ERR_USER_ALREADY_EXISTS, msg);
      }
      throw new DomainError(DomainErrorCode.ERR_INVALID_INPUT, msg);
    }
    return res.json();
  }

  async function apiGetCurrentUser(userId: number | string, onUnauthorized?: () => void): Promise<AuthUserSession> {
    const res = await apiFetch(`/users/${userId}`, {}, onUnauthorized);
    if (!res.ok) throw new Error('No se pudo obtener el perfil del usuario');
    return res.json();
  }

  return {
    get API_BASE() {
      return apiBase;
    },
    getApiBase,
    updateApiBase,
    getStoredTokens,
    storeSession,
    clearSession,
    getStoredUser,
    refreshAccessToken,
    apiFetch,
    apiLogin,
    apiRegister,
    apiGetCurrentUser,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
