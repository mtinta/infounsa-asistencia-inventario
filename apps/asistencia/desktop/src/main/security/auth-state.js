/**
 * Estado de autenticación que se conserva entre sesiones del cliente.
 *
 * @typedef {Object} AuthState
 * @property {string|null} accessToken Token JWT de acceso de corta duración.
 * @property {string|null} refreshToken Token usado para renovar el acceso.
 */

/**
 * Crea el almacén de tokens del proceso principal de Electron.
 *
 * `safeStorage` es obligatorio para persistir tokens. Un JSON plano legado se
 * migra una vez cuando el almacenamiento seguro esta disponible; si no lo esta,
 * la sesion se descarta y no se escribe ningun token en texto plano.
 *
 * @param {Object} options Dependencias explícitas para poder probar el módulo.
 * @param {string} options.filePath Ruta del archivo de estado en `userData`.
 * @param {Object} options.fs API de filesystem compatible con Node.
 * @param {Object} options.safeStorage API `safeStorage` de Electron.
 * @returns {{load: Function, save: Function}}
 *   Operaciones de lectura y escritura normalizadas.
 * @see apps/asistencia/desktop/main.js#loadAuthState Consumidor de lectura.
 * @see apps/asistencia/desktop/main.js#saveAuthState Consumidor de escritura.
 * @see apps/asistencia/api/src/modules/auth/auth.controller.ts#refresh Endpoint `/auth/refresh`.
 * @see https://www.electronjs.org/docs/latest/tutorial/security Reglas de seguridad.
 */
function createAuthStateStore({ filePath, fs, safeStorage }) {
  const emptyState = () => ({ accessToken: null, refreshToken: null });
  const normalize = (state) => ({
    accessToken: state?.accessToken || null,
    refreshToken: state?.refreshToken || null,
  });

  function isSafeStorageAvailable() {
    try {
      return typeof safeStorage?.isEncryptionAvailable === 'function'
        && safeStorage.isEncryptionAvailable()
        && typeof safeStorage.encryptString === 'function'
        && typeof safeStorage.decryptString === 'function';
    } catch {
      return false;
    }
  }

  function persistEncrypted(state) {
    fs.writeFileSync(filePath, safeStorage.encryptString(JSON.stringify(state)));
  }

  /**
   * Lee y normaliza el estado persistido; cualquier archivo corrupto se trata
   * como una sesión vacía para evitar bloquear el arranque del cliente.
   *
   * @returns {AuthState}
   */
  function load() {
    try {
      if (!fs.existsSync(filePath)) {
        return emptyState();
      }

      if (!isSafeStorageAvailable()) {
        console.error('No se cargan tokens locales: safeStorage no esta disponible.');
        return emptyState();
      }

      const fileData = fs.readFileSync(filePath);
      if (safeStorage.isEncryptionAvailable()) {
        try {
          return normalize(JSON.parse(safeStorage.decryptString(fileData)));
        } catch {
          // Migra una instalacion anterior solo si puede reescribirla cifrada.
          const legacyState = normalize(JSON.parse(fileData.toString('utf8')));
          persistEncrypted(legacyState);
          return legacyState;
        }
      }
    } catch {
      return emptyState();
    }
  }

  /**
   * Normaliza tokens ausentes y persiste el estado con `safeStorage` cuando es
   * posible, conservando compatibilidad con el formato legado plano.
   *
   * @param {Partial<AuthState>|null|undefined} nextState Estado recibido del API.
   * @returns {AuthState} Estado normalizado en memoria.
   */
  function save(nextState) {
    const normalized = normalize(nextState);

    if (!isSafeStorageAvailable()) {
      console.error('No se guardan tokens locales: safeStorage no esta disponible.');
      return normalized;
    }

    try {
      persistEncrypted(normalized);
    } catch (error) {
      console.error('No se pudo guardar el estado de autenticacion cifrado:', error);
    }

    return normalized;
  }

  return { load, save };
}

module.exports = { createAuthStateStore };
