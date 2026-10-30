/**
 * Cliente remoto de Asistencia para el proceso principal de Electron.
 *
 * Esta frontera concentra HTTP/HTTPS, autenticación, reintentos de red y la
 * normalización de respuestas. `main.js` conserva la orquestación de ventanas,
 * IPC y cola local, pero delega aquí las llamadas al servidor central.
 *
 * Contratos consumidos del API:
 * - `POST /auth/refresh`: `apps/asistencia/api/src/modules/auth/auth.controller.ts`.
 * - `GET /users/attendance-users`: `apps/asistencia/api/src/modules/users/users.controller.ts`.
 * - `GET /attendance/synced-marks` y `POST /attendance/sync`:
 *   `apps/asistencia/api/src/modules/attendance/attendance.controller.ts`.
 *
 * @see apps/asistencia/desktop/main.js#pullUsersFromServer Delegación de usuarios.
 * @see apps/asistencia/desktop/main.js#pullAttendanceFromServer Delegación de marcas.
 * @see apps/asistencia/desktop/main.js#sendSyncRequest Delegación de sincronización.
 * @see docs/02_arquitectura/attendance_sync-contract.md Contrato histórico de sincronización.
 */
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 2000;

/**
 * Construye el cliente remoto con transportes inyectables para aislar la red
 * de las pruebas unitarias y del resto del proceso principal.
 *
 * @param {Object} dependencies Dependencias de transporte y estado.
 * @param {Object} dependencies.http Transporte Node para URLs `http:`.
 * @param {Object} dependencies.https Transporte Node para URLs `https:`.
 * @param {Function} dependencies.getAuthState Lector del estado JWT actual.
 * @param {Function} dependencies.saveAuthState Persistidor del token renovado.
 * @returns {{pullUsersFromServer: Function, pullAttendanceFromServer: Function,
 *   refreshAccessToken: Function, sendSyncRequest: Function,
 *   isTransientNetworkError: Function}}
 */
function createRemoteClient({ http, https, getAuthState, saveAuthState }) {
  /**
   * Selecciona el transporte nativo según el protocolo de la URL.
   *
   * @param {URL} target URL ya resuelta del servidor central.
   * @returns {Object} Transporte `http` o `https` inyectado.
   */
  function getTransport(target) {
    return target.protocol === 'https:' ? https : http;
  }

  /**
   * Ejecuta una petición JSON y convierte los estados HTTP no exitosos en
   * errores con contexto para la cola offline.
   *
   * @param {string} apiBaseUrl URL base configurada para Asistencia.
   * @param {string} route Ruta relativa del contrato HTTP.
   * @param {Object} [options] Método, cuerpo y autenticación.
   * @returns {Promise<Object|Array>}
   */
  function requestJson(apiBaseUrl, route, options = {}) {
    return new Promise((resolve, reject) => {
      const target = new URL(route, apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`);
      const transport = getTransport(target);
      const method = options.method || 'GET';
      const requestBody = options.body === undefined ? null : JSON.stringify(options.body);
      const headers = {
        ...(options.authenticated ? { Authorization: `Bearer ${getAuthState().accessToken}` } : {}),
        ...(requestBody
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(requestBody),
            }
          : {}),
      };

      const req = transport.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || (target.protocol === 'https:' ? 443 : 80),
          path: `${target.pathname}${target.search}`,
          method,
          timeout: DEFAULT_TIMEOUT_MS,
          headers,
        },
        (res) => {
          let responseBody = '';
          res.on('data', (chunk) => { responseBody += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(responseBody ? JSON.parse(responseBody) : {});
              } catch {
                resolve({});
              }
              return;
            }

            const detail = responseBody ? ` - ${responseBody}` : '';
            reject(new Error(`${options.errorPrefix || 'Solicitud remota fallida'}: HTTP ${res.statusCode}${detail}`));
          });
        },
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(options.timeoutMessage || 'Tiempo de espera agotado al conectar al servidor central'));
      });

      req.on('error', (error) => {
        reject(options.networkErrorPrefix
          ? new Error(`${options.networkErrorPrefix}: ${error.message}`)
          : error);
      });

      if (requestBody) {
        req.write(requestBody);
      }
      req.end();
    });
  }

  /**
   * Clasifica solo errores de conectividad que pueden recuperarse reintentando;
   * errores HTTP de validación o autorización no se silencian.
   *
   * @param {Error} error Error producido por el transporte.
   * @returns {boolean} `true` si el error es transitorio.
   */
  function isTransientNetworkError(error) {
    const message = String(error?.message || '').toLowerCase();
    return (
      message.includes('socket hang up') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('error de red al conectar') ||
      message.includes('timeout')
    );
  }

  /**
   * Repite una operación con backoff fijo únicamente para fallos transitorios.
   *
   * @param {Function} operation Operación que devuelve una promesa.
   * @param {number} retries Número de reintentos restantes.
   * @param {number} delayMs Espera entre intentos.
   * @param {string} logMessage Mensaje opcional de diagnóstico.
   * @returns {Promise<unknown>}
   */
  function withRetry(operation, retries, delayMs, logMessage) {
    return new Promise((resolve, reject) => {
      function attempt(remaining) {
        operation()
          .then(resolve)
          .catch((error) => {
            if (remaining > 0 && isTransientNetworkError(error)) {
              if (logMessage) {
                console.warn(`${logMessage} (${error.message}). Reintentando en ${delayMs}ms... (Intentos restantes: ${remaining})`);
              }
              setTimeout(() => attempt(remaining - 1), delayMs);
              return;
            }
            reject(error);
          });
      }
      attempt(retries);
    });
  }

  /**
   * Renueva el JWT una vez y conserva el refresh token existente.
   *
   * @param {string} apiBaseUrl URL base del API.
   * @returns {Promise<string>} Nuevo access token.
   * @throws {Error} Si no existe refresh token o la respuesta es inválida.
   */
  async function refreshAccessTokenOnce(apiBaseUrl) {
    const refreshToken = getAuthState().refreshToken;
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const data = await requestJson(apiBaseUrl, '/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
      errorPrefix: 'Failed to refresh token',
      timeoutMessage: 'Tiempo de espera agotado al refrescar token',
    });

    if (!data?.access_token) {
      throw new Error('Failed to refresh token: respuesta sin access_token');
    }

    saveAuthState({ accessToken: data.access_token, refreshToken });
    return data.access_token;
  }

  /**
   * Renueva el token con los mismos reintentos de red que la sincronización.
   *
   * @param {string} apiBaseUrl URL base del API.
   * @returns {Promise<string>}
   */
  function refreshAccessToken(apiBaseUrl) {
    return withRetry(
      () => refreshAccessTokenOnce(apiBaseUrl),
      DEFAULT_RETRIES,
      DEFAULT_RETRY_DELAY_MS,
      'Error al refrescar token transitorio',
    );
  }

  /**
   * Descarga usuarios en la forma consumida por la caché local.
   *
   * @param {string} apiBaseUrl URL base del API.
   * @returns {Promise<Object[]>}
   */
  async function pullUsersFromServerOnce(apiBaseUrl) {
    return requestJson(apiBaseUrl, '/users/attendance-users', {
      authenticated: true,
      errorPrefix: 'Fallo al descargar usuarios',
    }).then((data) => (Array.isArray(data) ? data : []));
  }

  /**
   * Descarga usuarios y, ante 401, intenta renovar el access token una vez.
   *
   * @param {string} apiBaseUrl URL base del API.
   * @returns {Promise<Object[]>}
   */
  async function pullUsersFromServer(apiBaseUrl) {
    try {
      return await pullUsersFromServerOnce(apiBaseUrl);
    } catch (error) {
      if (error.message.includes('401') && getAuthState().refreshToken) {
        try {
          await refreshAccessToken(apiBaseUrl);
          return await pullUsersFromServerOnce(apiBaseUrl);
        } catch {
          throw error;
        }
      }
      throw error;
    }
  }

  /**
   * Descarga marcaciones centralizadas y normaliza una respuesta no-array.
   *
   * @param {string} apiBaseUrl URL base del API.
   * @returns {Promise<Object[]>}
   */
  async function pullAttendanceFromServerOnce(apiBaseUrl) {
    return requestJson(apiBaseUrl, '/attendance/synced-marks', {
      authenticated: true,
      errorPrefix: 'Fallo al descargar marcaciones',
    }).then((data) => (Array.isArray(data) ? data : []));
  }

  /**
   * Descarga marcaciones y reintenta con token renovado ante 401.
   *
   * @param {string} apiBaseUrl URL base del API.
   * @returns {Promise<Object[]>}
   */
  async function pullAttendanceFromServer(apiBaseUrl) {
    try {
      return await pullAttendanceFromServerOnce(apiBaseUrl);
    } catch (error) {
      if (error.message.includes('401') && getAuthState().refreshToken) {
        try {
          await refreshAccessToken(apiBaseUrl);
          return await pullAttendanceFromServerOnce(apiBaseUrl);
        } catch {
          throw error;
        }
      }
      throw error;
    }
  }

  /**
   * Envía el lote offline al contrato `/attendance/sync`.
   * Los errores transitorios se reintentan; los errores de negocio se entregan
   * a `main.js` para que actualice `sync_queue` y `sync_logs`.
   *
   * @param {string} apiBaseUrl URL base del API.
   * @param {Object} payload Lote serializado por la cola local.
   * @returns {Promise<Object|Array>}
   */
  function sendSyncRequest(apiBaseUrl, payload) {
    return withRetry(
      () => requestJson(apiBaseUrl, '/attendance/sync', {
        method: 'POST',
        body: payload,
        authenticated: true,
        errorPrefix: 'Fallo en sincronizacion',
        networkErrorPrefix: 'Error de red al conectar al servidor central',
      }),
      DEFAULT_RETRIES,
      DEFAULT_RETRY_DELAY_MS,
      'Error de red transitorio detectable',
    );
  }

  return {
    pullUsersFromServer,
    pullAttendanceFromServer,
    refreshAccessToken,
    sendSyncRequest,
    isTransientNetworkError,
  };
}

module.exports = { createRemoteClient };
