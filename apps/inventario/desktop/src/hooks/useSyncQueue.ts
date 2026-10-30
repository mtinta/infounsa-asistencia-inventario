import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, API_BASE } from '../utils/api';
import { InventoryMovement } from '../types';
import desktopConfig from '../../desktop-config.json';
import { InventarioElectronAPI, ToastType } from '@infounsa/shared-types';

const defaultHost = (desktopConfig as { api_host?: string })?.api_host || 'localhost';

export interface UseSyncQueueParams {
  electron?: InventarioElectronAPI;
  isAuthenticated: boolean;
  currentApiUrl?: string;
  showToast: (msg: string, type: ToastType) => void;
  handleLogout: () => void;
  onMovementsUpdated?: (movements: InventoryMovement[]) => void;
  onSyncSuccess?: () => void;
}

export function useSyncQueue({
  electron,
  isAuthenticated,
  currentApiUrl,
  showToast,
  handleLogout,
  onMovementsUpdated,
  onSyncSuccess,
}: UseSyncQueueParams) {
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const onMovementsUpdatedRef = useRef(onMovementsUpdated);
  onMovementsUpdatedRef.current = onMovementsUpdated;

  const onSyncSuccessRef = useRef(onSyncSuccess);
  onSyncSuccessRef.current = onSyncSuccess;

  // 1. Detección de conectividad del servidor
  useEffect(() => {
    const checkServerConnection = async () => {
      try {
        const targetUrl = API_BASE || currentApiUrl || localStorage.getItem('inv_api_url') || `http://${defaultHost}:43001`;
        const res = await fetch(`${targetUrl}/health`, {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(3000),
        });
        const health = await res.json().catch(() => null);
        setIsOnline(
          res.ok &&
            health?.status === 'ok' &&
            health?.database === 'connected' &&
            health?.service === 'inventario-api',
        );
      } catch {
        setIsOnline(false);
      }
    };

    checkServerConnection();
    const interval = setInterval(checkServerConnection, 5000);

    const handleOffline = () => setIsOnline(false);
    const handleOnline = () => checkServerConnection();

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [currentApiUrl]);

  // 2. Refrescar estado desde Electron o outbox local
  const refreshDesktopState = useCallback(async () => {
    if (electron?.getState) {
      try {
        const state = await electron.getState<{ movements?: InventoryMovement[]; syncQueue?: unknown[] }>();
        if (state.movements) {
          onMovementsUpdatedRef.current?.(state.movements);
        }
        const pending = Array.isArray(state.syncQueue) ? state.syncQueue.length : 0;
        setPendingCount(pending);
      } catch (err) {
        console.warn('Error al obtener estado local de Electron:', err);
      }
      return;
    }

    try {
      const outbox = JSON.parse(localStorage.getItem('inv_outbox') || '[]');
      setPendingCount(Array.isArray(outbox) ? outbox.length : 0);
    } catch {
      setPendingCount(0);
    }
  }, [electron]);

  // 3. Sincronización del outbox hacia el servidor central
  const syncOutbox = useCallback(async () => {
    setIsSyncing(true);
    try {
      if (electron?.forceSync) {
        try {
          const state = await electron.forceSync<{ movements?: InventoryMovement[]; syncQueue?: unknown[] }>();
          if (state.movements) {
            onMovementsUpdatedRef.current?.(state.movements);
            localStorage.setItem('inv_cached_movements', JSON.stringify(state.movements));
          }
          const pending = Array.isArray(state.syncQueue) ? state.syncQueue.length : 0;
          setPendingCount(pending);
          showToast(
            pending === 0
              ? 'Verificacion completada: no hay operaciones locales pendientes.'
              : `Quedan ${pending} operaciones pendientes de subir.`,
            pending === 0 ? 'success' : 'info',
          );
          onSyncSuccessRef.current?.();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error al sincronizar';
          showToast(`Error de sincronización: ${msg}`, 'error');
        }
        return;
      }

      const outbox = JSON.parse(localStorage.getItem('inv_outbox') || '[]');
      if (outbox.length === 0) {
        setPendingCount(0);
        return;
      }

      try {
        // El endpoint /inventory-movements/sync valida con `forbidNonWhitelisted`,
        // por lo que solo se envian los campos del CreateMovementDto. Los campos
        // de presentacion (item_name, item_barcode, item_stock, ...) viven solo
        // en el cache local y provocaban un HTTP 400 que rompia la sincronizacion.
        const batch = (outbox as InventoryMovement[]).map((movement) => ({
          item_id: Number(movement.item_id),
          type: movement.type,
          quantity: Number(movement.quantity),
          ...(movement.user_id != null ? { user_id: Number(movement.user_id) } : {}),
          registered_at: movement.registered_at,
          ...(movement.id_operacion_local ? { id_operacion_local: movement.id_operacion_local } : {}),
          ...(movement.observations ? { observations: movement.observations } : {}),
          ...(movement.destinatario_name ? { destinatario_name: movement.destinatario_name } : {}),
          ...(movement.area_id != null ? { area_id: Number(movement.area_id) } : {}),
        }));

        const res = await apiFetch(
          '/inventory-movements/sync',
          {
            method: 'POST',
            body: JSON.stringify({ batch }),
          },
          handleLogout,
        );

        if (res.ok) {
          const result = await res.json();
          localStorage.setItem('inv_outbox', '[]');
          setPendingCount(0);
          showToast(`Sincronizados ${result.synced_count ?? batch.length} movimientos pendientes`, 'success');
          onSyncSuccessRef.current?.();
        } else {
          const errorData = await res.json().catch(() => null);
          const message = Array.isArray(errorData?.message)
            ? errorData.message.join('. ')
            : errorData?.message || `Error ${res.status} al sincronizar`;
          console.warn('Sincronizacion rechazada por el servidor:', message);
          showToast(`No se pudo sincronizar: ${message}`, 'error');
        }
      } catch (err) {
        console.warn('Error al sincronizar outbox:', err);
        showToast('No se pudo sincronizar: fallo de red con el servidor.', 'error');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [electron, handleLogout, showToast]);

  // 4. Observar eventos de sync en Electron
  useEffect(() => {
    if (!electron) return;
    refreshDesktopState();
    electron.onSyncUpdate?.((data: unknown) => {
      const syncData = data as { message?: string; status?: string };
      showToast(
        syncData?.message || 'Actualización de sincronización',
        syncData?.status === 'error' ? 'error' : syncData?.status === 'success' ? 'success' : 'info',
      );
      refreshDesktopState();
    });
  }, [electron, refreshDesktopState, showToast]);

  // 5. Cargar estado inicial al autenticar
  useEffect(() => {
    if (isAuthenticated) {
      refreshDesktopState().catch(() => {});
    }
  }, [isAuthenticated, refreshDesktopState]);

  // 6. Sincronización automática cuando el servidor está en línea
  useEffect(() => {
    if (isOnline && isAuthenticated) {
      syncOutbox();
    }
  }, [isOnline, isAuthenticated, syncOutbox]);

  // 6b. Reintento periódico del outbox (browser y escritorio).
  // Cubre el caso en que la primera subida falle (red inestable o servidor caído)
  // y deja pendientes que de otro modo nunca se reintentarían.
  useEffect(() => {
    if (!isOnline || !isAuthenticated) return;
    const interval = setInterval(() => {
      if (isSyncing) return;
      const outbox = JSON.parse(localStorage.getItem('inv_outbox') || '[]');
      if (Array.isArray(outbox) && outbox.length > 0) {
        syncOutbox();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isOnline, isAuthenticated, isSyncing, syncOutbox]);

  // 7. Escucha de evento global manual force-sync-outbox
  useEffect(() => {
    const handleForceSync = () => {
      syncOutbox();
    };
    window.addEventListener('force-sync-outbox', handleForceSync);
    return () => {
      window.removeEventListener('force-sync-outbox', handleForceSync);
    };
  }, [syncOutbox]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    syncOutbox,
    refreshDesktopState,
  };
}
