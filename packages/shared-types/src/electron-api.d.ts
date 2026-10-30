/**
 * Contratos tipados globales para los puentes IPC (window.electronAPI y window.electron)
 * en Plataforma InfoUNSA (Asistencia e Inventario).
 */

export interface AuthTokenState {
  accessToken: string | null;
  refreshToken: string | null;
  apiUrl?: string;
}

export interface AuthTokenPayload {
  accessToken: string | null;
  refreshToken: string | null;
  apiUrl?: string;
}

export interface AttendanceDeviceConfig {
  terminal_id: string;
  sede_id: string;
  api_base_url: string;
  sync_interval_seconds: number;
  device_id?: string;
  device_name?: string;
}

export interface AttendanceMarkPayload {
  dni: string;
  name?: string;
  tipo?: string;
  type?: string;
  metodo?: string;
  timestamp?: string;
  origen?: string;
  id_terminal?: number | string;
  usuario_id?: string | number | null;
  es_menor_manual?: boolean;
  [key: string]: unknown;
}

export interface AttendanceMarkResult {
  success: boolean;
  message?: string;
  mark?: unknown;
  localId?: string;
  offline?: boolean;
}

export interface LocalAttendanceUser {
  dni: string;
  name?: string;
  nombres?: string;
  apellidos?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  codigo?: string | null;
  tipo_usuario?: string;
  role?: string;
  sede?: string;
  cargo?: string | null;
  condicion?: string | null;
  estado?: string | number;
  originalDni?: string;
}

export interface AttendanceMarkRecord {
  id?: number | string;
  dni: string;
  nombres?: string;
  apellidos?: string;
  timestamp: string;
  fecha_hora?: string;
  tipo: string;
  tipo_marca?: string;
  metodo: string;
  sincronizado?: number | boolean;
  observacion?: string | null;
  estado_auditoria?: string | null;
  [key: string]: unknown;
}

export interface AttendanceManualMarkPayload {
  dni: string;
  name?: string;
  fecha?: string;
  tipo?: string;
  type?: string;
  tipo_marca?: string;
  registered_at?: string;
  metodo?: string;
  observacion?: string;
  usuario_id?: string | null;
}

export interface AttendanceDesktopState {
  online?: boolean;
  syncQueueCount?: number;
  lastSyncAt?: string | null;
  deviceConfig?: AttendanceDeviceConfig | null;
  records?: any[] | null;
  syncQueue?: any[] | null;
  syncLogs?: any[] | null;
  users?: any[] | null;
}

export interface InventoryMovementPayload {
  item_id: number;
  type: string;
  quantity: number;
  reason?: string;
  destination?: string;
  receiver_name?: string;
  receiver_dni?: string;
  [key: string]: unknown;
}

export interface InventoryDesktopState {
  online?: boolean;
  syncQueueCount?: number;
  lastSyncAt?: string | null;
  items?: any[];
  movements?: any[];
  alerts?: any[];
  categories?: any[];
  syncQueue?: any[];
  [key: string]: unknown;
}

/**
 * Contrato de la API de Electron para el Kiosco y Admin de Asistencia.
 */
export interface AsistenciaElectronAPI {
  onSyncUpdate(callback: (data: unknown) => void): void;
  getState<T = AttendanceDesktopState>(): Promise<T>;
  getDeviceConfig<T = AttendanceDeviceConfig>(): Promise<T | null>;
  getAuthStateSync(): AuthTokenState;
  updateDeviceConfig<T = AttendanceDeviceConfig>(config: AttendanceDeviceConfig | unknown): Promise<T>;
  setAuthToken(tokens: AuthTokenPayload): Promise<void>;
  registerMark(payload: AttendanceMarkPayload): Promise<AttendanceMarkResult>;
  findLocalUserByDni(dni: string): Promise<LocalAttendanceUser | null>;
  saveLocalUser(usuario: LocalAttendanceUser | unknown): Promise<void>;
  deleteLocalUser(dni: string): Promise<void>;
  forceSync<T = AttendanceDesktopState>(): Promise<T>;
  resetLocalData(): Promise<void>;
  updateMark(localId: number | string, fields: Partial<AttendanceMarkRecord>): Promise<void>;
  deleteMark(localId: number | string): Promise<void>;
  createManualMark(payload: AttendanceManualMarkPayload): Promise<void>;
  findLastMarkForDni(dni: string): Promise<AttendanceMarkRecord | null>;
  saveOfflineCredentials(payload: { username: string; password?: string; passwordHash?: string; user?: unknown }): Promise<void>;
  verifyOfflineCredentials(payload: { username: string; password: string }): Promise<boolean>;

  // Cross-Window IPC communication
  sendUnknownDni(dni: string): void;
  sendVisitorRegisteredSuccess(data: { dni: string; name: string }): void;
  sendSimulateScan(dni: string): void;
  toggleAdminWindow(): void;
  notifyDatabaseChanged(): void;

  onRegisterVisitor(callback: (dni: string) => void): () => void;
  onVisitorRegisteredSuccess(callback: (data: { dni: string; name: string }) => void): () => void;
  onSimulateScan(callback: (dni: string) => void): () => void;
  onDatabaseChanged(callback: () => void): () => void;
}

/**
 * Contrato de la API de Electron para el Kiosco y Catálogo de Inventario.
 */
export interface InventarioElectronAPI {
  onSyncUpdate(callback: (data: unknown) => void): void;
  getAuthStateSync(): AuthTokenState;
  setAuthToken(tokens: AuthTokenPayload): Promise<void>;
  registerMovement<T = InventoryMovementPayload>(movement: T): Promise<InventoryDesktopState>;
  getState<T = InventoryDesktopState>(): Promise<T>;
  forceSync<T = InventoryDesktopState>(): Promise<T>;
}

declare global {
  interface Window {
    electronAPI?: AsistenciaElectronAPI;
    electron?: InventarioElectronAPI;
  }
}
