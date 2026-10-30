import { useState } from 'react';
import {
  FileText as ReportIcon,
  Globe as GlobeIcon,
  Monitor as KioskIcon,
  User as UserIcon,
} from 'lucide-react';
import Tooltip from '../ui/Tooltip';
import { DeviceConfig, Terminal, User, UserRole } from '../../types';
import { updateApiBase } from '../../utils/api';
import desktopConfig from '../../../desktop-config.json';
import { ToastType } from '@infounsa/shared-types';

const defaultHost = desktopConfig?.api_host || 'localhost';

interface SettingsTabProps {
  userRole: UserRole | null;
  profileName: string;
  setProfileName: (v: string) => void;
  profileLastName: string;
  setProfileLastName: (v: string) => void;
  profileEmail: string;
  setProfileEmail: (v: string) => void;
  notifyAttendance: boolean;
  setNotifyAttendance: (v: boolean) => void;
  notifyTerminal: boolean;
  setNotifyTerminal: (v: boolean) => void;
  notifyReports: boolean;
  setNotifyReports: (v: boolean) => void;
  terminals: Terminal[];
  handleAddTerminal?: () => void;
  users: User[];
  handleLogout: () => void;
  showToast: (msg: string, type: ToastType) => void;
  deviceConfig: DeviceConfig;
  pendingSyncCount: number;
  onSaveDeviceConfig: (config: DeviceConfig) => Promise<void>;
  onResetLocalData?: () => void;
}

export default function SettingsTab({
  userRole,
  profileName,
  setProfileName,
  profileLastName,
  setProfileLastName,
  profileEmail,
  setProfileEmail,
  notifyAttendance,
  setNotifyAttendance,
  notifyTerminal,
  setNotifyTerminal,
  notifyReports,
  setNotifyReports,
  terminals,
  users,
  handleLogout,
  showToast,
  deviceConfig,
  pendingSyncCount,
  onSaveDeviceConfig,
  onResetLocalData,
}: SettingsTabProps) {
  const [apiUrl, setApiUrl] = useState(deviceConfig.api_base_url);
  const [syncInterval, setSyncInterval] = useState(String(deviceConfig.sync_interval_seconds));
  const [terminalId, setTerminalId] = useState(deviceConfig.terminal_id);
  const [sedeId, setSedeId] = useState(deviceConfig.sede_id);

  const handleSaveAll = async () => {
    updateApiBase(apiUrl);
    localStorage.setItem('ast_api_url', apiUrl);
    localStorage.setItem('ast_sync_interval', syncInterval);
    await onSaveDeviceConfig({
      terminal_id: terminalId,
      sede_id: sedeId,
      api_base_url: apiUrl,
      sync_interval_seconds: Math.max(5, Number(syncInterval) || 30),
    });
    showToast('Configuraciones e interoperabilidad guardadas con exito', 'success');
  };

  return (
    <div className="settings-tab-container">
      <div className="panel-header">
        <h3>Configuracion del Sistema</h3>
        <div className="settings-header-actions">
          <Tooltip content="Guardar cambios de perfil, notificaciones y conexión" position="bottom">
            <button className="sync-action-btn settings-primary-action" onClick={handleSaveAll}>
              Guardar Cambios
            </button>
          </Tooltip>
          <Tooltip content="Cerrar la sesión de administración actual" position="bottom">
            <button
              className="sync-action-btn settings-danger-action"
              onClick={handleLogout}
            >
              Cerrar Sesion
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="settings-bento-grid">
        <div className="settings-card profile-card">
          <div className="card-header-with-icon">
            <UserIcon size={20} className="header-icon text-primary" />
            <h4>Ajustes de Perfil</h4>
          </div>
          <div className="profile-fields-layout">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar-placeholder">
                {`${profileName.charAt(0)}${profileLastName.charAt(0)}`.toUpperCase() || 'OP'}
              </div>
            </div>
            <div className="profile-inputs-grid">
              <div className="form-group">
                <label>Nombres</label>
                <input type="text" className="form-input" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Apellidos</label>
                <input type="text" className="form-input" value={profileLastName} onChange={(e) => setProfileLastName(e.target.value)} />
              </div>
              <div className="form-group profile-input-wide">
                <label>Correo Institucional</label>
                <input type="email" className="form-input" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="settings-card notifications-card">
          <div className="card-header-with-icon">
            <ReportIcon size={20} className="header-icon text-secondary" style={{ color: 'var(--accent)' }} />
            <h4>Preferencias de Notificacion</h4>
          </div>
          <div className="toggles-list">
            <div className="toggle-item">
              <div className="toggle-info">
                <span className="toggle-title">Alertas de Asistencia</span>
                <span className="toggle-desc">Notificar marcaciones fuera de horario.</span>
              </div>
              <input type="checkbox" className="toggle-switch" checked={notifyAttendance} onChange={(e) => setNotifyAttendance(e.target.checked)} />
            </div>
            <div className="toggle-item">
              <div className="toggle-info">
                <span className="toggle-title">Estado de Terminales</span>
                <span className="toggle-desc">Avisos de desconexion de kioscos.</span>
              </div>
              <input type="checkbox" className="toggle-switch" checked={notifyTerminal} onChange={(e) => setNotifyTerminal(e.target.checked)} />
            </div>
            <div className="toggle-item">
              <div className="toggle-info">
                <span className="toggle-title">Reportes Semanales</span>
                <span className="toggle-desc">Resumen enviado por correo.</span>
              </div>
              <input type="checkbox" className="toggle-switch" checked={notifyReports} onChange={(e) => setNotifyReports(e.target.checked)} />
            </div>
          </div>
        </div>

        <div className="settings-card">
          <div className="card-header-with-icon">
            <GlobeIcon size={20} className="header-icon" style={{ color: 'var(--accent, #3b82f6)' }} />
            <h4>Interoperabilidad y Sincronizacion</h4>
          </div>
          <div className="settings-stack">
            <div className="form-group">
              <label>Ruta API Principal (Servidor)</label>
              <input type="text" className="form-input" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder={`http://${defaultHost}:43000`} />
            </div>
            <div className="form-group">
              <label>Terminal ID</label>
              <input type="text" className="form-input" value={terminalId} onChange={(e) => setTerminalId(e.target.value)} placeholder="TERM-001" />
            </div>
            <div className="form-group">
              <label>Sede ID</label>
              <input type="text" className="form-input" value={sedeId} onChange={(e) => setSedeId(e.target.value)} placeholder="UUID de sede" />
            </div>
            <div className="form-group">
              <label>
                Intervalo de Sincronizacion (segundos)
                <Tooltip content="Tiempo en segundos entre cada sondeo automático con el servidor central (Recomendado: 30s)." position="top">
                  <span style={{ marginLeft: '6px', fontSize: '11px', color: '#94a3b8', cursor: 'help' }}>ⓘ</span>
                </Tooltip>
              </label>
              <input type="number" className="form-input" value={syncInterval} onChange={(e) => setSyncInterval(e.target.value)} min="5" max="3600" />
            </div>
            <div className="form-group">
              <label>Estado de Outbox</label>
              <div className="outbox-status-row">
                <span className={`badge ${pendingSyncCount > 0 ? 'badge-pending' : 'badge-success'}`}>
                  {pendingSyncCount} pendientes
                </span>
                {pendingSyncCount > 0 && (
                  <Tooltip content="Envía de inmediato las marcas encoladas hacia la API central." position="left">
                    <button
                      type="button"
                      className="text-link-btn"
                      onClick={() => window.dispatchEvent(new Event('force-sync-outbox'))}
                    >
                      Sincronizar ahora
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
            {onResetLocalData && (
              <div className="form-group reset-local-group">
                <Tooltip content="¡Precaución! Borra la base de datos local y la cola no enviada. Use solo para mantenimiento técnico." position="top" style={{ width: '100%' }}>
                  <button
                    type="button"
                    onClick={onResetLocalData}
                    className="danger-soft-btn"
                    style={{ width: '100%' }}
                  >
                    Restablecer Datos Locales / Limpiar Cola
                  </button>
                </Tooltip>
              </div>
            )}
          </div>
        </div>

        {userRole === 'administrador' && (
          <div className="settings-card terminals-card">
            <div className="card-header-with-icon card-header-split">
              <div className="card-header-title-group">
                <KioskIcon size={20} className="header-icon text-primary" />
                <h4>Terminales Conectados (Kioscos)</h4>
              </div>
            </div>
            <div className="terminals-list">
              {terminals.map((term) => (
                <div key={term.id} className="terminal-item-card">
                  <div className="term-info">
                    <span className="term-name">{term.name}</span>
                    <span className="term-ip" title={term.ip}>ID / IP: {term.ip}</span>
                  </div>
                  <span className={`badge ${term.status === 'ACTIVE' ? 'badge-success' : 'badge-pending'}`}>
                    {term.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {userRole === 'administrador' && (
          <div className="settings-card users-card">
            <div className="card-header-with-icon">
              <UserIcon size={20} className="header-icon text-primary" />
              <h4>Usuarios del Sistema</h4>
            </div>
            <div className="table-scroll">
              <table className="crud-table mini-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>DNI</th>
                    <th>Rol</th>
                    <th style={{ textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.dni}>
                      <td className="cell-wrap"><strong>{u.name}</strong></td>
                      <td><code>{u.dni}</code></td>
                      <td><span className="badge badge-neutral">{u.role}</span></td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-success">Activo</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '10px 0 0 0', textAlign: 'right' }}>
              Gestión avanzada y altas en pestaña <strong>Operadores</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
