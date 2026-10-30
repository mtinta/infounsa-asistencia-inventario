import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../utils/api';
import { AttendanceRecord, DeviceConfig, SyncLogEntry, Terminal, User } from '../types';
import desktopConfig from '../../desktop-config.json';
import {
  AsistenciaElectronAPI,
  ToastType,
  AttendanceMarkRecord,
  AttendanceManualMarkPayload,
} from '@infounsa/shared-types';

const defaultHost = desktopConfig?.api_host || 'localhost';

export const DEFAULT_DEVICE_CONFIG: DeviceConfig = {
  terminal_id: 'TERM-001',
  sede_id: '84c8a8ca-8ea4-41e9-add6-2b077bcd701a',
  api_base_url: `http://${defaultHost}:43000`,
  sync_interval_seconds: 30,
};

const DEFAULT_USERS: User[] = [
  { dni: '70293841', name: 'Emerson Castro', role: 'usuario', sede: 'Sede Universitaria' },
  { dni: '46182930', name: 'Elvis Perez', role: 'usuario', sede: 'Sede Universitaria' },
  { dni: '19283746', name: 'Luis F Flores', role: 'usuario', sede: 'Sede Universitaria' },
  { dni: '48201928', name: 'Marco Quispe', role: 'usuario', sede: 'Sede Universitaria' },
  { dni: '73829102', name: 'Maria Alvarez', role: 'usuario', sede: 'Sede Universitaria' },
  { dni: '45291029', name: 'Mario Mendoza', role: 'usuario', sede: 'Sede Universitaria' },
  { dni: '18293847', name: 'Melvin Rojas', role: 'usuario', sede: 'Sede Universitaria' },
  { dni: '47291028', name: 'Miguel Tinta', role: 'usuario', sede: 'Sede Universitaria' },
  { dni: '70291834', name: 'Yoset Cozco Mauri', role: 'administrador', sede: 'Sede Universitaria' },
  { dni: '46293817', name: 'Luis Quispe', role: 'operador', sede: 'Sede Universitaria' },
  { dni: '19284736', name: 'Melvin Castro', role: 'operador', sede: 'Sede Universitaria' },
];

const DEFAULT_TERMINALS: Terminal[] = [
  { id: 1, name: 'Kiosco Principal - Pabellon A', ip: '192.168.1.101', status: 'ACTIVE' },
  { id: 2, name: 'Kiosco Secundario - Biblioteca', ip: '192.168.1.105', status: 'PENDING' },
];

interface UseAttendanceDataParams {
  electronAPI?: AsistenciaElectronAPI;
  showToast: (msg: string, type: ToastType) => void;
}

export function useAttendanceData({
  electronAPI,
  showToast,
}: UseAttendanceDataParams) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [syncQueue, setSyncQueue] = useState<AttendanceRecord[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [deviceConfig, setDeviceConfig] = useState<DeviceConfig>(DEFAULT_DEVICE_CONFIG);
  const [terminals, setTerminals] = useState<Terminal[]>(DEFAULT_TERMINALS);
  const [users, setUsers] = useState<User[]>(DEFAULT_USERS);
  const [isLoading, setIsLoading] = useState(false);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [reportStart, setReportStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [reportEnd, setReportEnd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [reportFormat, setReportFormat] = useState<'semanal' | 'detallado' | 'resumido'>('semanal');
  const fetchTerminals = useCallback(async () => {
    try {
      const res = await apiFetch('/terminals');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setTerminals(data);
          return;
        }
      }
    } catch {
      // Use local state if API is offline
    }
  }, []);

  const refreshDesktopState = useCallback(async () => {
    fetchTerminals();
    if (!electronAPI?.getState) return;
    try {
      const state = await electronAPI.getState<{
        records?: AttendanceRecord[];
        syncQueue?: AttendanceRecord[];
        syncLogs?: SyncLogEntry[];
        deviceConfig?: DeviceConfig;
        users?: User[];
      }>();
      setRecords(state.records || []);
      setSyncQueue(state.syncQueue || []);
      setSyncLogs(state.syncLogs || []);
      setDeviceConfig(state.deviceConfig || DEFAULT_DEVICE_CONFIG);
      setUsers(state.users?.length ? state.users : DEFAULT_USERS);
    } catch (err) {
      console.warn('No se pudo refrescar el estado local de asistencia:', err);
    }
  }, [electronAPI, fetchTerminals]);

  const refreshData = useCallback(async () => {
    if (electronAPI?.getState) {
      await refreshDesktopState();
      return;
    }

    try {
      const savedRecords = localStorage.getItem('ast_local_records');
      if (savedRecords) setRecords(JSON.parse(savedRecords));

      const savedQueue = localStorage.getItem('ast_local_sync_queue');
      if (savedQueue) setSyncQueue(JSON.parse(savedQueue));

      const savedLogs = localStorage.getItem('ast_local_sync_logs');
      if (savedLogs) setSyncLogs(JSON.parse(savedLogs));

      const savedUsers = localStorage.getItem('ast_local_users');
      if (savedUsers) setUsers(JSON.parse(savedUsers));
    } catch (e) {
      console.error('Error loading data from localStorage:', e);
    }
  }, [electronAPI, refreshDesktopState]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (electronAPI?.onDatabaseChanged) {
      const cleanup = electronAPI.onDatabaseChanged(() => {
        refreshData();
        refreshDesktopState();
      });
      return cleanup;
    }
  }, [electronAPI, refreshData, refreshDesktopState]);

  useEffect(() => {
    if (!electronAPI) return;
    refreshDesktopState();
    electronAPI.onSyncUpdate?.((data: unknown) => {
      const syncData = data as { message?: string; status?: string };
      showToast(syncData?.message || 'Actualización de sincronización', syncData?.status === 'error' ? 'error' : syncData?.status === 'success' ? 'success' : 'info');
      refreshDesktopState();
    });
  }, [electronAPI, refreshDesktopState, showToast]);

  const handleSyncNow = useCallback(async (isOnline: boolean, options: { silent?: boolean } = {}) => {
    if (!isOnline) {
      if (!options.silent) showToast('Sin conexion. Conecte la red para sincronizar.', 'error');
      return;
    }
    if (!syncQueue.length) {
      if (!options.silent) showToast('No hay registros pendientes.', 'info');
      return;
    }
    try {
      setIsLoading(true);
      if (electronAPI?.forceSync) {
        const state = await electronAPI.forceSync<{
          records?: AttendanceRecord[];
          syncQueue?: AttendanceRecord[];
          syncLogs?: SyncLogEntry[];
          deviceConfig?: DeviceConfig;
        }>();
        setRecords(state.records || []);
        setSyncQueue(state.syncQueue || []);
        setSyncLogs(state.syncLogs || []);
        setDeviceConfig(state.deviceConfig || DEFAULT_DEVICE_CONFIG);
      } else {
        const payload = {
          terminal_id: deviceConfig.terminal_id || DEFAULT_DEVICE_CONFIG.terminal_id,
          sede_id: deviceConfig.sede_id || DEFAULT_DEVICE_CONFIG.sede_id,
          registros: syncQueue.map((r) => ({
            id_operacion_local: r.id_local,
            usuario_id: r.usuario_id || null,
            fecha_hora_marca: r.registered_at,
            tipo: r.type,
            es_menor_manual: !!r.es_menor_manual,
            datos_menor: r.datos_menor ? {
              nombre_completo: r.datos_menor.nombre_completo,
              dni_contingencia: r.datos_menor.dni_contingencia || '00000000',
            } : undefined,
            observacion: r.observacion || undefined,
            visitante_nombre: r.visitante_nombre || undefined,
            visitante_motivo: r.visitante_motivo || undefined,
            visitante_observacion: r.visitante_observacion || undefined,
          })),
        };

        const res = await apiFetch('/attendance/sync', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = Array.isArray(errData.message) ? errData.message.join('. ') : errData.message;
          throw new Error(errMsg || 'Error del servidor al sincronizar.');
        }

        const syncedIds = syncQueue.map((r) => r.id_local);
        setRecords((prev) => {
          const nextRecords = prev.map((r) =>
            syncedIds.includes(r.id_local) ? { ...r, sync_status: 'sincronizado' as const } : r,
          );
          localStorage.setItem('ast_local_records', JSON.stringify(nextRecords));
          return nextRecords;
        });

        setSyncQueue([]);
        localStorage.removeItem('ast_local_sync_queue');

        const newLogEntry: SyncLogEntry = {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          type: 'success',
          count: syncedIds.length,
          message: `Sincronizacion web exitosa: ${syncedIds.length} marcas.`,
        };
        setSyncLogs((prev) => {
          const nextLogs = [newLogEntry, ...prev];
          localStorage.setItem('ast_local_sync_logs', JSON.stringify(nextLogs));
          return nextLogs;
        });

        if (!options.silent) showToast('Sincronizacion completada exitosamente', 'success');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!options.silent) showToast(`Fallo en sincronizacion: ${errMsg}`, 'error');
      const newLogEntry: SyncLogEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        type: 'error',
        count: 0,
        message: `Error de sincronizacion web: ${errMsg}`,
      };
      setSyncLogs((prev) => {
        const nextLogs = [newLogEntry, ...prev];
        localStorage.setItem('ast_local_sync_logs', JSON.stringify(nextLogs));
        return nextLogs;
      });
    } finally {
      setIsLoading(false);
    }
  }, [deviceConfig, electronAPI, showToast, syncQueue]);

  // Sincronización automática en modo navegador.
  // En Electron el motor periódico vive en el proceso principal (main.js), pero
  // sin él la cola offline quedaría pendiente de forma indefinida.
  useEffect(() => {
    if (electronAPI) return;
    if (!syncQueue.length) return;

    let cancelled = false;
    const pushQueue = async () => {
      if (cancelled) return;
      // Sin red no tiene sentido intentar: se evita llenar el log de errores.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      await handleSyncNow(true, { silent: true });
    };

    pushQueue();
    const interval = setInterval(pushQueue, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [electronAPI, syncQueue.length, handleSyncNow]);

  const handleResetLocalData = useCallback(() => {
    if (electronAPI?.resetLocalData) {
      electronAPI.resetLocalData()
        .then((state: unknown) => {
          const s = (state || {}) as Record<string, unknown>;
          setRecords((s.records as AttendanceRecord[]) || []);
          setSyncQueue((s.syncQueue as AttendanceRecord[]) || []);
          setSyncLogs((s.syncLogs as SyncLogEntry[]) || []);
          setUsers((s.users as User[])?.length ? (s.users as User[]) : DEFAULT_USERS);
          setDeviceConfig((s.deviceConfig as DeviceConfig) || DEFAULT_DEVICE_CONFIG);
          showToast('Base de datos local y cola offline restablecidas', 'info');
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'No se pudo restablecer el estado local.';
          showToast(msg, 'error');
        });
      return;
    }

    localStorage.removeItem('ast_local_records');
    localStorage.removeItem('ast_local_sync_queue');
    localStorage.removeItem('ast_local_sync_logs');
    localStorage.removeItem('ast_local_users');
    setRecords([]);
    setSyncQueue([]);
    setSyncLogs([]);
    setUsers(DEFAULT_USERS);
    showToast('Base de datos local y cola offline restablecidas', 'info');
  }, [electronAPI, showToast]);

  const handleSaveDeviceConfig = useCallback(async (nextConfig: DeviceConfig) => {
    if (electronAPI?.updateDeviceConfig) {
      const saved = await electronAPI.updateDeviceConfig(nextConfig);
      setDeviceConfig(saved as unknown as DeviceConfig);
      await refreshDesktopState();
      return;
    }

    setDeviceConfig(nextConfig);
    localStorage.setItem('ast_api_url', nextConfig.api_base_url);
    localStorage.setItem('ast_sync_interval', String(nextConfig.sync_interval_seconds));
  }, [electronAPI, refreshDesktopState]);


  const handleUpdateMark = useCallback(async (localId: string, fields: Partial<AttendanceMarkRecord>) => {
    if (!electronAPI?.updateMark) return;
    try {
      setIsLoading(true);
      await electronAPI.updateMark(localId, fields);
      await refreshDesktopState();
      showToast('Registro de asistencia actualizado localmente', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar el registro';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [electronAPI, refreshDesktopState, showToast]);

  const handleDeleteMark = useCallback(async (localId: string) => {
    if (!electronAPI?.deleteMark) return;
    try {
      setIsLoading(true);
      await electronAPI.deleteMark(localId);
      await refreshDesktopState();
      showToast('Registro marcado como borrado localmente', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al borrar el registro';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [electronAPI, refreshDesktopState, showToast]);

  const handleCreateManualMark = useCallback(async (payload: AttendanceManualMarkPayload) => {
    if (!electronAPI?.createManualMark) return;
    try {
      setIsLoading(true);
      await electronAPI.createManualMark(payload);
      await refreshDesktopState();
      showToast('Registro manual creado localmente', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear el registro manual';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [electronAPI, refreshDesktopState, showToast]);

  return {
    records,
    setRecords,
    syncQueue,
    setSyncQueue,
    syncLogs,
    setSyncLogs,
    deviceConfig,
    setDeviceConfig,
    terminals,
    users,
    setUsers,
    isLoading,
    setIsLoading,
    reportUrl,
    setReportUrl,
    reportStart,
    setReportStart,
    reportEnd,
    setReportEnd,
    reportFormat,
    setReportFormat,
    refreshDesktopState,
    handleSyncNow,
    handleResetLocalData,
    handleSaveDeviceConfig,
    handleUpdateMark,
    handleDeleteMark,
    handleCreateManualMark,
  };
}
