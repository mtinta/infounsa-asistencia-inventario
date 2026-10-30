export type UserRole = 'administrador' | 'operador' | 'usuario';

export type SyncStatus =
  | 'pendiente'
  | 'enviando'
  | 'sincronizado'
  | 'error'
  | 'conflicto';

export interface User {
  dni: string;
  name: string;
  nombres?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  apellidos?: string;
  condicion?: string;
  cargo?: string;
  role: UserRole;
  sede: string;
}

export interface AttendanceRecord {
  id_local: string;
  usuario_id?: string | null;
  dni: string;
  name: string;
  nombres?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  type: 'entrada' | 'salida';
  registered_at: string;
  observacion?: string | null;
  es_menor_manual?: boolean;
  datos_menor?: {
    nombre_completo: string;
    dni_contingencia?: string;
  };
  visitante_nombre?: string | null;
  visitante_motivo?: string | null;
  visitante_observacion?: string | null;
  sync_status: SyncStatus;
  estado_auditoria?: string;
  intentos?: number;
  next_retry_at?: string | null;
  mensaje_error?: string | null;
}

export interface Terminal {
  id: number | string;
  name: string;
  ip: string;
  status: string;
}

export interface SyncLogEntry {
  id: number;
  timestamp: string;
  type: 'success' | 'error' | 'info';
  count: number;
  message: string;
}

export interface DeviceConfig {
  terminal_id: string;
  sede_id: string;
  api_base_url: string;
  sync_interval_seconds: number;
}
