import { AttendanceRecord, SyncLogEntry } from '../../types';
import SkeletonRow from '../ui/SkeletonRow';
import Tooltip from '../ui/Tooltip';

function getSyncBadge(status: AttendanceRecord['sync_status']) {
  switch (status) {
    case 'sincronizado':
      return { className: 'badge-success', label: 'SINCRONIZADO' };
    case 'enviando':
      return { className: 'badge-in', label: 'ENVIANDO' };
    case 'error':
      return { className: 'badge-out', label: 'ERROR' };
    case 'conflicto':
      return { className: 'badge-out', label: 'CONFLICTO' };
    default:
      return { className: 'badge-pending', label: 'PENDIENTE' };
  }
}

interface SyncTabProps {
  syncQueue: AttendanceRecord[];
  handleSyncNow: () => void;
  isLoading: boolean;
  syncLogs: SyncLogEntry[];
}

export default function SyncTab({
  syncQueue,
  handleSyncNow,
  isLoading,
  syncLogs,
}: SyncTabProps) {
  return (
    <div className="sync-tab">
      <div className="panel-header">
        <h3>Outbox - Cola Offline <span className="count-chip">{syncQueue.length}</span></h3>
        <Tooltip content="Fuerza la transmisión inmediata de todos los registros pendientes hacia el servidor central." position="left">
          <button className="sync-action-btn" onClick={handleSyncNow} disabled={!syncQueue.length || isLoading}>
            {isLoading ? 'Sincronizando...' : 'Subir Cola'}
          </button>
        </Tooltip>
      </div>

      {isLoading ? <SkeletonRow /> : syncQueue.length === 0 ? (
        <div className="info-banner success-banner">
          <span aria-hidden="true">OK</span> Cola limpia. Todos los registros sincronizados.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="crud-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>DNI</th>
                <th>Persona</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>
                  <Tooltip content="Número de intentos fallidos y hora programada para el siguiente reintento automático con retroceso exponencial." position="top">
                    <span style={{ cursor: 'help', borderBottom: '1px dotted currentColor' }}>Reintento</span>
                  </Tooltip>
                </th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {syncQueue.map((q) => (
                <tr key={q.id_local}>
                  {(() => {
                    const badge = getSyncBadge(q.sync_status);
                    return (
                      <>
                  <td className="cell-time">{new Date(q.registered_at).toLocaleTimeString('es-PE')}</td>
                  <td className="cell-code"><code>{q.dni}</code></td>
                  <td className="cell-wrap">{q.name}</td>
                  <td><span className={`badge ${q.type === 'entrada' ? 'badge-in' : 'badge-out'}`}>{q.type.toUpperCase()}</span></td>
                  <td><span className={`badge ${badge.className}`}>{badge.label}</span></td>
                  <td className="cell-wrap">
                    {q.intentos || 0}
                    {q.next_retry_at ? ` / ${new Date(q.next_retry_at).toLocaleTimeString('es-PE')}` : ''}
                  </td>
                  <td className="cell-wrap" title={q.mensaje_error || undefined}>{q.mensaje_error || '-'}</td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel-header" style={{ marginTop: '32px' }}>
        <h3>Logs de Sincronizacion <span className="count-chip">{syncLogs.length}</span></h3>
      </div>
      {syncLogs.length === 0 ? (
        <div className="info-banner">No hay registros de intentos de sincronizacion todavia.</div>
      ) : (
        <div className="table-scroll">
          <table className="crud-table">
            <thead>
              <tr><th>Fecha/Hora</th><th>Estado</th><th>Cantidad</th><th>Detalle</th></tr>
            </thead>
            <tbody>
              {syncLogs.map((log) => (
                <tr key={log.id}>
                  <td className="cell-wrap">{new Date(log.timestamp).toLocaleString('es-PE')}</td>
                  <td>
                    <span className={`badge ${log.type === 'success' ? 'badge-success' : log.type === 'error' ? 'badge-out' : 'badge-pending'}`}>
                      {log.type.toUpperCase()}
                    </span>
                  </td>
                  <td>{log.count}</td>
                  <td className="cell-wrap">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
