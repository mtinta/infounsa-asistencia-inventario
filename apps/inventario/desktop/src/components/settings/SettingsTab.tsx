import { useState } from 'react';
import { 
  User as UserIcon, 
  FileText as ReportIcon, 
  Package as BoxIcon,
  Globe as GlobeIcon
} from 'lucide-react';
import { ToastType } from '@infounsa/shared-types';
import { getStoredTokens, updateApiBase } from '../../utils/api';
import desktopConfig from '../../../desktop-config.json';
import Tooltip from '../ui/Tooltip';

const defaultHost = (desktopConfig as { api_host?: string })?.api_host || 'localhost';

interface SettingsTabProps {
  userRole?: string | null;
  profileName: string;
  setProfileName: (v: string) => void;
  profileLastName: string;
  setProfileLastName: (v: string) => void;
  profileEmail: string;
  setProfileEmail: (v: string) => void;
  notifyStockAlerts: boolean;
  setNotifyStockAlerts: (v: boolean) => void;
  notifyMovements: boolean;
  setNotifyMovements: (v: boolean) => void;
  notifyMonthlyReports: boolean;
  setNotifyMonthlyReports: (v: boolean) => void;
  dbPath: string;
  setDbPath: (v: string) => void;
  handleLogout: () => void;
  showToast: (msg: string, type: ToastType) => void;
}

export default function SettingsTab({
  profileName,
  setProfileName,
  profileLastName,
  setProfileLastName,
  profileEmail,
  setProfileEmail,
  notifyStockAlerts,
  setNotifyStockAlerts,
  notifyMovements,
  setNotifyMovements,
  notifyMonthlyReports,
  setNotifyMonthlyReports,
  dbPath,
  setDbPath,
  handleLogout,
  showToast,
}: SettingsTabProps) {
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('inv_api_url') || `http://${defaultHost}:43001`);
  const [syncInterval, setSyncInterval] = useState(() => localStorage.getItem('inv_sync_interval') || '30');
  const [pendingSyncCount] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('inv_outbox') || '[]').length;
    } catch {
      return 0;
    }
  });

  const handleSaveAll = () => {
    updateApiBase(apiUrl);
    localStorage.setItem('inv_sync_interval', syncInterval);
    const electron = window.electron;
    if (electron?.setAuthToken) {
      const { accessToken, refreshToken } = getStoredTokens();
      electron.setAuthToken({ accessToken, refreshToken, apiUrl });
    }
    showToast('Configuraciones e Interoperabilidad guardadas con éxito', 'success');
  };

  return (
    <div className="settings-tab-container">
      <div className="panel-header">
        <h3>Configuración del Sistema</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Tooltip content="Guardar la configuración de interoperabilidad y preferencias del sistema." position="bottom">
            <button className="sync-action-btn" onClick={handleSaveAll}>Guardar Cambios</button>
          </Tooltip>
          <button
            className="sync-action-btn"
            style={{ background: 'var(--error, #dc3545)', borderColor: 'var(--error, #dc3545)' }}
            onClick={handleLogout}
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      <div className="settings-bento-grid">
        {/* Perfil */}
        <div className="settings-card profile-card">
          <div className="card-header-with-icon">
            <UserIcon size={20} className="header-icon" />
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
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Correo Institucional</label>
                <input type="email" className="form-input" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Notificaciones */}
        <div className="settings-card notifications-card">
          <div className="card-header-with-icon">
            <ReportIcon size={20} className="header-icon" style={{ color: 'var(--accent)' }} />
            <h4>Preferencias de Notificación</h4>
          </div>
          <div className="toggles-list">
            <div className="toggle-item">
              <div className="toggle-info">
                <span className="toggle-title">Alertas de Stock</span>
                <span className="toggle-desc">Notificar niveles por debajo del mínimo.</span>
              </div>
              <input type="checkbox" className="toggle-switch" checked={notifyStockAlerts} onChange={(e) => setNotifyStockAlerts(e.target.checked)} />
            </div>
            <div className="toggle-item">
              <div className="toggle-info">
                <span className="toggle-title">Alertas de Movimientos</span>
                <span className="toggle-desc">Notificar ingresos y salidas.</span>
              </div>
              <input type="checkbox" className="toggle-switch" checked={notifyMovements} onChange={(e) => setNotifyMovements(e.target.checked)} />
            </div>
            <div className="toggle-item">
              <div className="toggle-info">
                <span className="toggle-title">Reportes Mensuales</span>
                <span className="toggle-desc">Resumen enviado por correo.</span>
              </div>
              <input type="checkbox" className="toggle-switch" checked={notifyMonthlyReports} onChange={(e) => setNotifyMonthlyReports(e.target.checked)} />
            </div>
          </div>
        </div>

        {/* Base de Datos Encriptada (SQLCipher) */}
        <div className="settings-card db-card">
          <div className="card-header-with-icon">
            <BoxIcon size={20} className="header-icon" />
            <h4>Base de Datos Local (SQLCipher Cifrado)</h4>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div className="form-group">
              <label>Ruta SQLite Local</label>
              <input type="text" className="form-input" value={dbPath} onChange={(e) => setDbPath(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Clave de Cifrado (safeStorage)</label>
              <Tooltip content="Clave de hardware gestionada por el proceso principal de Electron mediante el anillo seguro del SO." position="top" style={{ width: '100%' }}>
                <input type="text" className="form-input" value="Gestionada por el proceso principal" disabled style={{ width: '100%' }} />
              </Tooltip>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>La clave nunca se expone al renderer ni se guarda en texto plano.</span>
            </div>
          </div>
        </div>

        {/* Interoperabilidad y Sincronización */}
        <div className="settings-card sync-card">
          <div className="card-header-with-icon">
            <GlobeIcon size={20} className="header-icon" style={{ color: 'var(--accent, #3b82f6)' }} />
            <h4>Interoperabilidad y Sincronización</h4>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div className="form-group">
              <label>Ruta API Principal (Servidor)</label>
              <input 
                type="text" 
                className="form-input" 
                value={apiUrl} 
                onChange={(e) => setApiUrl(e.target.value)} 
                placeholder={`http://${defaultHost}:43001`}
              />
            </div>
            <div className="form-group">
              <label>Intervalo de Sincronización (segundos)</label>
              <Tooltip content="Tiempo en segundos entre cada sondeo automático con el servidor central (Recomendado: 30s)." position="top" style={{ width: '100%' }}>
                <input 
                  type="number" 
                  className="form-input" 
                  value={syncInterval} 
                  onChange={(e) => setSyncInterval(e.target.value)} 
                  min="5"
                  max="3600"
                  style={{ width: '100%' }}
                />
              </Tooltip>
            </div>
            <div className="form-group">
              <label>Estado de Outbox (Movimientos Pendientes)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                <span className={`badge ${pendingSyncCount > 0 ? 'badge-pending' : 'badge-success'}`}>
                  {pendingSyncCount} pendientes
                </span>
                {pendingSyncCount > 0 && (
                  <Tooltip content="Envía de inmediato las operaciones de almacén encoladas hacia la API central." position="left">
                    <button 
                      type="button" 
                      className="text-link-btn" 
                      onClick={() => {
                        showToast('Iniciando sincronización forzada...', 'info');
                        window.dispatchEvent(new Event('force-sync-outbox'));
                      }}
                      style={{ fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent, #3b82f6)' }}
                    >
                      Sincronizar ahora
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
