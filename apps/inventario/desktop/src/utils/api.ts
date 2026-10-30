/**
 * api.ts — Capa de acceso a la API de Inventario
 * Consume el cliente unificado de `@infounsa/shared-ui`.
 */

import { createApiClient } from '@infounsa/shared-ui';
import desktopConfig from '../../desktop-config.json';

const defaultHost = (desktopConfig as { api_host?: string })?.api_host || 'localhost';

const client = createApiClient({
  defaultPort: 43001,
  defaultHost,
  storagePrefix: 'inv_',
  serviceName: 'inventario-api',
  serviceDisplayName: 'Inventario',
  getElectronBridge: () => window.electron,
  includeApiUrlInSetAuth: true,
});

export let API_BASE = client.API_BASE;

export function updateApiBase(url: string) {
  client.updateApiBase(url);
  API_BASE = client.API_BASE;
}

export const {
  getApiBase,
  getStoredTokens,
  storeSession,
  clearSession,
  getStoredUser,
  refreshAccessToken,
  apiFetch,
  apiLogin,
  apiRegister,
  apiGetCurrentUser,
} = client;
