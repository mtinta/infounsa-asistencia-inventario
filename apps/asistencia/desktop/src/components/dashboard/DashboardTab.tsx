import { 
  ClipboardList as LogIcon, 
  RefreshCw as SyncIcon, 
  Monitor as KioskIcon, 
  Wifi,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2
} from 'lucide-react';
import { AttendanceRecord, UserRole } from '../../types';
import Tooltip from '../ui/Tooltip';
import { ActiveTab } from '../admin/AdminTabContent';

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

interface DashboardTabProps {
  userRole: UserRole | null;
  records: AttendanceRecord[];
  syncQueue: AttendanceRecord[];
  isOnline: boolean;
  setActiveTab: (tab: ActiveTab) => void;
}

export default function DashboardTab({
  userRole,
  records,
  syncQueue,
  isOnline,
  setActiveTab,
}: DashboardTabProps) {
  const entradasCount = records.filter((r) => r.type === 'entrada').length;
  const salidasCount = records.filter((r) => r.type === 'salida').length;
  const sincronizadosCount = records.filter((r) => r.sync_status === 'sincronizado').length;
  const syncRate = records.length > 0 ? Math.round((sincronizadosCount / records.length) * 100) : 100;

  return (
    <div className="dashboard-tab-container" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="panel-header" style={{ marginBottom: '10px' }}>
        <div>
          <h3>Panel de Control Operativo</h3>
          <p className="kiosk-hint">Subsistema de Control de Asistencia - Vista Resumen</p>
        </div>
        <div style={{ padding: '6px 12px', borderRadius: '20px', backgroundColor: 'var(--bg-accent, rgba(20,56,127,0.1))', color: 'var(--primary, #14387f)', fontSize: '13px', fontWeight: 'bold' }}>
          Rol: {userRole === 'administrador' ? 'Administrador' : 'Operador'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <Tooltip content="Total de eventos de entrada y salida procesados localmente en la jornada actual." position="top" style={{ display: 'block' }}>
          <div className="settings-card" style={{ padding: '15px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', textTransform: 'uppercase', opacity: 0.8 }}>Marcaciones Hoy</span>
              <LogIcon size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontSize: '32px', margin: '10px 0 5px 0', fontWeight: 'bold' }}>{records.length}</h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Registros en memoria local</p>
          </div>
        </Tooltip>

        <Tooltip content="Marcaciones almacenadas localmente en espera de ser transmitidas a la base central. Haga clic para ver la cola." position="top" style={{ display: 'block' }}>
          <div 
            className="settings-card" 
            onClick={() => setActiveTab('sync')} 
            style={{ padding: '15px', cursor: 'pointer', transition: 'transform 0.15s ease' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', textTransform: 'uppercase', opacity: 0.8 }}>Cola de Sync</span>
              <SyncIcon size={16} style={{ color: '#f59e0b' }} />
            </div>
            <h2 style={{ fontSize: '32px', margin: '10px 0 5px 0', fontWeight: 'bold', color: syncQueue.length > 0 ? '#f59e0b' : 'inherit' }}>{syncQueue.length}</h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{syncQueue.length > 0 ? 'Pendientes de envío (clic para ir a Sync)' : 'Todo sincronizado'}</p>
          </div>
        </Tooltip>

        <Tooltip content="Identificador del dispositivo en la red de control de asistencia." position="top" style={{ display: 'block' }}>
          <div className="settings-card" style={{ padding: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', textTransform: 'uppercase', opacity: 0.8 }}>Terminal Activo</span>
              <KioskIcon size={16} style={{ color: '#10b981' }} />
            </div>
            <h2 style={{ fontSize: '20px', margin: '20px 0 5px 0', fontWeight: 'bold' }}>TERM-001</h2>
            <p style={{ fontSize: '11px', color: '#10b981' }}>✓ Conexión establecida</p>
          </div>
        </Tooltip>

        <Tooltip content="Indica si el terminal tiene acceso a PostgreSQL central o si opera en SQLite local cifrado." position="top" style={{ display: 'block' }}>
          <div className="settings-card" style={{ padding: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', textTransform: 'uppercase', opacity: 0.8 }}>Modo del Sistema</span>
              <Wifi size={16} style={{ color: isOnline ? '#10b981' : '#ef4444' }} />
            </div>
            <h2 style={{ fontSize: '20px', margin: '20px 0 5px 0', fontWeight: 'bold' }}>{isOnline ? 'Online' : 'Offline'}</h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{isOnline ? 'Conexión con Postgres' : 'Modo Contingencia local'}</p>
          </div>
        </Tooltip>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginTop: '10px' }}>
        <div className="settings-card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '15px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Últimas Marcaciones del Día</h4>
          {records.length === 0 ? (
            <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
              No hay marcas registradas en el turno actual.
            </div>
          ) : (
            <div className="table-scroll">
              <table className="crud-table mini-table">
                <thead>
                  <tr>
                    <th>DNI</th>
                    <th>Colaborador</th>
                    <th>Tipo</th>
                    <th>Hora</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice().sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime()).slice(0, 5).map((r) => (
                    <tr key={r.id_local}>
                      {(() => {
                        const badge = getSyncBadge(r.sync_status);
                        return (
                          <>
                            <td><code>{r.dni}</code></td>
                            <td><strong>{r.name}</strong></td>
                            <td>
                              <span className={`badge ${r.type === 'entrada' ? 'badge-success' : 'badge-pending'}`} style={{ textTransform: 'uppercase' }}>
                                {r.type}
                              </span>
                            </td>
                            <td>{new Date(r.registered_at).toLocaleTimeString('es-PE')}</td>
                            <td>
                              <span className={`badge ${badge.className}`}>
                                {badge.label}
                              </span>
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Resumen de Turno consolidado (reemplaza los botones duplicados de navegación) */}
        <div className="settings-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h4 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Resumen de Turno</h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--bg-card-soft, rgba(0,0,0,0.03))', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowDownLeft size={18} color="#16a34a" />
                <span style={{ fontSize: '13px', fontWeight: '500' }}>Entradas</span>
              </div>
              <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#16a34a' }}>{entradasCount}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--bg-card-soft, rgba(0,0,0,0.03))', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowUpRight size={18} color="#dc2626" />
                <span style={{ fontSize: '13px', fontWeight: '500' }}>Salidas</span>
              </div>
              <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#dc2626' }}>{salidasCount}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--bg-card-soft, rgba(0,0,0,0.03))', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="#3b82f6" />
                <span style={{ fontSize: '13px', fontWeight: '500' }}>Tasa Sincronizada</span>
              </div>
              <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#3b82f6' }}>{syncRate}%</span>
            </div>
          </div>

          <Tooltip content="Acceder directamente a la interfaz del kiosco para registro rápido de colaboradores." position="top" style={{ width: '100%', marginTop: 'auto' }}>
            <button className="sync-action-btn" onClick={() => setActiveTab('kiosk')} style={{ width: '100%', justifyContent: 'center' }}>
              Abrir Kiosco Lector
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
