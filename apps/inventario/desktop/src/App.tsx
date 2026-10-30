import { useState, useEffect } from 'react';
import { useToast } from './components/ui/ToastProvider';
import './App.css';

import { 
  Package as BoxIcon, 
  AlertTriangle as AlertIcon, 
  RefreshCw as SyncIcon, 
  Keyboard as KeyboardIcon, 
  Sun, 
  Moon, 
  Wifi, 
  WifiOff,
  Settings as SettingsIcon,
  FileText as ReportIcon,
  LayoutDashboard as DashboardIcon,
  LogOut as LogOutIcon,
  Users as UsersIcon,
  Upload as UploadIcon
} from 'lucide-react';

import Tooltip from './components/ui/Tooltip';

// Componentes de Pestañas
import DashboardTab from './components/dashboard/DashboardTab';
import CatalogTab from './components/catalog/CatalogTab';
import AlertsTab from './components/alerts/AlertsTab';
import MovementsTab from './components/movements/MovementsTab';
import ExcelUploadTab from './components/catalog/ExcelUploadTab';
import ReportsTab from './components/reports/ReportsTab';
import SettingsTab from './components/settings/SettingsTab';
import OperatorsTab from './components/operators/OperatorsTab';

// Custom Hooks Modulares
import { useInventoryAuth } from './hooks/useInventoryAuth';
import { useSyncQueue } from './hooks/useSyncQueue';
import { useInventoryData } from './hooks/useInventoryData';

export default function App() {
  const { showToast } = useToast();
  const electron = window.electron;

  // Estado de Navegación y Tema
  const [isDark, setIsDark] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'catalog' | 'alerts' | 'movements' | 'excel-upload' | 'reports' | 'settings' | 'operators'
  >('dashboard');

  // 1. Hook de Autenticación y Sesión
  const auth = useInventoryAuth({
    electron,
    showToast,
  });

  // 2. Hook de Cola de Sincronización y Red
  const syncQueue = useSyncQueue({
    electron,
    isAuthenticated: auth.isAuthenticated,
    currentApiUrl: auth.currentApiUrl,
    showToast,
    handleLogout: auth.handleLogout,
    onMovementsUpdated: (mvs) => inventoryData.setMovements(mvs),
    onSyncSuccess: () => {
      inventoryData.fetchData();
    },
  });

  // 3. Hook de Datos de Catálogo, Movimientos y Reportes
  const inventoryData = useInventoryData({
    electron,
    isAuthenticated: auth.isAuthenticated,
    isOnline: syncQueue.isOnline,
    handleLogout: auth.handleLogout,
    showToast,
    syncOutbox: syncQueue.syncOutbox,
  });

  // Restricción de pestañas según rol de usuario
  useEffect(() => {
    if (auth.userRole === 'operador' && (activeTab === 'reports' || activeTab === 'settings' || activeTab === 'operators')) {
      setActiveTab('dashboard');
    }
  }, [auth.userRole, activeTab]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  if (!auth.isAuthenticated) {
    if (auth.isRegistering) {
      return (
        <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div className="kiosk-card" style={{ width: '450px', padding: '30px', textAlign: 'left' }}>
            <h3 style={{ textAlign: 'center', marginBottom: '10px' }}>Registro de Operador</h3>
            <p className="kiosk-hint" style={{ textAlign: 'center', marginBottom: '20px' }}>Complete los datos para solicitar una cuenta.</p>
            <form onSubmit={auth.handleRegister} className="kiosk-form" style={{ alignItems: 'stretch' }}>
              <div className="form-group">
                <label>Nombre Completo</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. Juan Pérez García"
                  value={auth.regFullName}
                  onChange={(e) => auth.setRegFullName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Correo Institucional</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="usuario@unsa.edu.pe"
                  value={auth.regEmail}
                  onChange={(e) => auth.setRegEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Usuario</label>
                <input
                  type="text"
                  className="form-input username-reg-input"
                  placeholder="jpd2024"
                  value={auth.regUsername}
                  onChange={(e) => auth.setRegUsername(e.target.value)}
                  required
                  style={{ backgroundColor: '#E5F1F3', fontFamily: 'monospace' }}
                />
              </div>
              <div className="form-group">
                <label>Contraseña</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={auth.regPassword}
                  onChange={(e) => auth.setRegPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Confirmar Contraseña</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={auth.regConfirmPassword}
                  onChange={(e) => auth.setRegConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ flexDirection: 'row', gap: '10px', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  id="terms"
                  checked={auth.regTerms}
                  onChange={(e) => auth.setRegTerms(e.target.checked)}
                />
                <label htmlFor="terms" style={{ margin: 0, fontSize: '12px' }}>Acepto las políticas de uso del sistema académico</label>
              </div>
              <button type="submit" className="kiosk-submit-btn" disabled={auth.isLoggingIn}>
                {auth.isLoggingIn ? 'Registrando...' : 'Registrar'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px' }}>
              ¿Ya tiene una cuenta? <a href="#" onClick={(e) => { e.preventDefault(); auth.setIsRegistering(false); }} style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Iniciar Sesión</a>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="kiosk-card" style={{ width: '400px', padding: '30px', position: 'relative' }}>
          <button 
            type="button" 
            onClick={() => auth.setShowQuickSettings(!auth.showQuickSettings)} 
            style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #94a3b8)' }}
            title="Configuración de API"
          >
            <SettingsIcon size={18} />
          </button>
          <h3 style={{ textAlign: 'center', marginBottom: '10px' }}>Iniciar Sesión</h3>
          <p className="kiosk-hint" style={{ textAlign: 'center', marginBottom: '20px' }}>Gestión de Inventario InfoUNSA</p>
          <Tooltip
            content={
              syncQueue.isOnline
                ? 'Conexión activa con el servidor central. Las operaciones se transmiten en tiempo real.'
                : 'Modo Contingencia: Las operaciones se guardan cifradas localmente en SQLCipher.'
            }
            position="bottom"
            style={{ margin: '0 auto 18px', display: 'flex', justifyContent: 'center' }}
          >
            <div className={`network-badge ${syncQueue.isOnline ? 'online' : 'offline'}`} role="status" aria-label={syncQueue.isOnline ? 'Servidor disponible' : 'Servidor no disponible'} style={{ justifyContent: 'center', width: 'fit-content' }}>
              {syncQueue.isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{syncQueue.isOnline ? 'SERVIDOR ONLINE' : 'SERVIDOR OFFLINE'}</span>
            </div>
          </Tooltip>

          {auth.showQuickSettings && (
            <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card-soft, rgba(0,0,0,0.05))', textAlign: 'left' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Configuración del Servidor</h4>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px' }}>Ruta API Principal</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={auth.quickApiUrl} 
                  onChange={(e) => auth.setQuickApiUrl(e.target.value)} 
                  placeholder="http://localhost:3001" 
                  style={{ fontSize: '13px', padding: '8px', marginTop: '4px' }}
                />
              </div>
              <button 
                type="button" 
                className="kiosk-submit-btn" 
                onClick={auth.handleSaveQuickApiUrl} 
                style={{ fontSize: '13px', padding: '6px 12px', marginTop: '10px', width: '100%', height: 'auto' }}
              >
                Guardar y Continuar
              </button>
            </div>
          )}

          <form onSubmit={auth.handleLogin} className="kiosk-form">
            <input
              type="text"
              className="kiosk-input"
              placeholder="Usuario"
              value={auth.username}
              onChange={(e) => auth.setUsername(e.target.value)}
              style={{ marginBottom: '15px', fontSize: '16px', textAlign: 'left', padding: '10px' }}
              autoFocus
            />
            <input
              type="password"
              className="kiosk-input"
              placeholder="Contraseña"
              value={auth.password}
              onChange={(e) => auth.setPassword(e.target.value)}
              style={{ marginBottom: '20px', fontSize: '16px', textAlign: 'left', padding: '10px' }}
            />
            <button type="submit" className="kiosk-submit-btn" disabled={auth.isLoggingIn || !auth.username || !auth.password}>
              {auth.isLoggingIn ? 'Autenticando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-mark" aria-hidden="true" style={{ display: 'flex', alignItems: 'center' }}>
            <BoxIcon size={24} style={{ color: '#60a5fa' }} />
          </div>
          <div>
            <h2>InfoUNSA</h2>
            <p>Administración de Inventario</p>
          </div>
        </div>
        
        <div className="header-status">
          <Tooltip content={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} position="bottom">
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Cambiar tema" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </Tooltip>
          <Tooltip
            content={
              syncQueue.isOnline
                ? 'Conexión activa con el servidor central. Las operaciones se transmiten en tiempo real.'
                : 'Modo Contingencia: Las operaciones se guardan cifradas localmente en SQLCipher.'
            }
            position="bottom"
          >
            <div className={`network-badge ${syncQueue.isOnline ? 'online' : 'offline'}`}>
              {syncQueue.isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{syncQueue.isOnline ? 'SERVIDOR ONLINE' : 'SERVIDOR OFFLINE'}</span>
            </div>
          </Tooltip>
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar">
          <button className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <DashboardIcon size={18} /> Resumen General
          </button>
          <button className={`nav-btn ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')}>
            <BoxIcon size={18} /> Catálogo de Bienes
          </button>
          <button className={`nav-btn ${activeTab === 'alerts' ? 'active' : ''}`} onClick={() => setActiveTab('alerts')}>
            <AlertIcon size={18} /> Alertas de Stock
          </button>
          <button className={`nav-btn ${activeTab === 'movements' ? 'active' : ''}`} onClick={() => setActiveTab('movements')}>
            <SyncIcon size={18} /> Movimientos
          </button>
          <button className={`nav-btn ${activeTab === 'excel-upload' ? 'active' : ''}`} onClick={() => setActiveTab('excel-upload')}>
            <UploadIcon size={18} /> Subir Excel
          </button>
          {auth.userRole === 'administrador' && (
            <>
              <button className={`nav-btn ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
                <ReportIcon size={18} /> Reportes y Análisis
              </button>
              <button className={`nav-btn ${activeTab === 'operators' ? 'active' : ''}`} onClick={() => setActiveTab('operators')}>
                <UsersIcon size={18} /> Gestión de Operadores
              </button>
              <button className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
                <SettingsIcon size={18} /> Configuración
              </button>
            </>
          )}
          <button className="nav-btn" style={{ marginTop: 'auto', backgroundColor: '#334155' }} onClick={() => inventoryData.setShowContingencyModal(true)}>
            <KeyboardIcon size={18} /> Ingreso Táctil (Sin Código)
          </button>
          <button className="nav-btn" style={{ backgroundColor: '#ef4444', color: 'white', marginTop: '10px' }} onClick={auth.handleLogout}>
            <LogOutIcon size={18} /> Cerrar Sesión
          </button>
        </aside>

        <main className="content-panel">
          {activeTab === 'dashboard' && (
            <DashboardTab
              userRole={auth.userRole}
              items={inventoryData.items}
              movements={inventoryData.movements}
              isOnline={syncQueue.isOnline}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogTab
              searchCode={inventoryData.searchCode}
              setSearchCode={inventoryData.setSearchCode}
              handleManualSearch={inventoryData.handleManualSearch}
              isLoading={inventoryData.isLoading}
              getFilteredItems={inventoryData.getFilteredItems}
              categories={inventoryData.categories}
              onAddItem={inventoryData.handleAddItem}
              onEditItem={inventoryData.handleEditItem}
              onDeleteItem={inventoryData.handleDeleteItem}
              isOnline={syncQueue.isOnline}
              userRole={auth.userRole}
              movements={inventoryData.movements}
              onRefreshCategories={inventoryData.fetchCategories}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertsTab
              items={inventoryData.items}
            />
          )}

          {activeTab === 'movements' && (
            <MovementsTab
              movements={inventoryData.movements}
              items={inventoryData.items}
              onAddMovement={inventoryData.handleAddMovement}
              onUpdateMovementDate={inventoryData.handleUpdateMovementDate}
              isLoading={inventoryData.isLoading}
              categories={inventoryData.categories}
              onAddItem={inventoryData.handleAddItem}
              isOnline={syncQueue.isOnline}
              userRole={auth.userRole || undefined}
              onVerifySync={syncQueue.syncOutbox}
              onRefreshCategories={inventoryData.fetchCategories}
            />
          )}

          {activeTab === 'excel-upload' && (
            <ExcelUploadTab
              items={inventoryData.items}
              categories={inventoryData.categories}
              onImportComplete={inventoryData.fetchData}
              isOnline={syncQueue.isOnline}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsTab
              reportType={inventoryData.reportType}
              setReportType={inventoryData.setReportType}
              reportStart={inventoryData.reportStart}
              setReportStart={inventoryData.setReportStart}
              reportEnd={inventoryData.reportEnd}
              setReportEnd={inventoryData.setReportEnd}
              reportFormat={inventoryData.reportFormat}
              setReportFormat={inventoryData.setReportFormat}
              reportDept={inventoryData.reportDept}
              setReportDept={inventoryData.setReportDept}
              reportCategory={inventoryData.reportCategory}
              setReportCategory={inventoryData.setReportCategory}
              handleGenerateReportLocal={inventoryData.handleGenerateReportLocal}
              handleExportExcel={inventoryData.handleExportExcel}
              handleViewReport={inventoryData.handleViewReport}
              handleDownloadReport={inventoryData.handleDownloadReport}
              reportHistory={inventoryData.reportHistory}
              showToast={showToast}
              movements={inventoryData.movements}
              items={inventoryData.items}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              userRole={auth.userRole}
              profileName={auth.profileName}
              setProfileName={auth.setProfileName}
              profileLastName={auth.profileLastName}
              setProfileLastName={auth.setProfileLastName}
              profileEmail={auth.profileEmail}
              setProfileEmail={auth.setProfileEmail}
              notifyStockAlerts={auth.notifyStockAlerts}
              setNotifyStockAlerts={auth.setNotifyStockAlerts}
              notifyMovements={auth.notifyMovements}
              setNotifyMovements={auth.setNotifyMovements}
              notifyMonthlyReports={auth.notifyMonthlyReports}
              setNotifyMonthlyReports={auth.setNotifyMonthlyReports}
              dbPath={auth.dbPath}
              setDbPath={auth.setDbPath}
              handleLogout={auth.handleLogout}
              showToast={showToast}
            />
          )}

          {activeTab === 'operators' && (
            <OperatorsTab
              showToast={showToast}
              userRole={auth.userRole}
            />
          )}
        </main>
      </div>

      {inventoryData.showContingencyModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <h4>Contingencia: Teclado Numérico Táctil</h4>
            <p className="modal-subtitle">Para bienes antiguos o sin etiqueta EAN</p>
            <form onSubmit={inventoryData.handleContingencySubmit}>
              <div className="form-group">
                <input 
                  type="text" 
                  value={inventoryData.touchCode} 
                  onChange={(e) => inventoryData.setTouchCode(e.target.value.replace(/\D/g, ''))}
                  className="form-input" 
                  placeholder="Ingrese código interno..." 
                  style={{ fontSize: '24px', letterSpacing: '2px', textAlign: 'center' }}
                  autoFocus
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
                {[1,2,3,4,5,6,7,8,9].map(num => (
                  <button type="button" key={num} className="scan-btn" onClick={() => inventoryData.setTouchCode(prev => prev + num)}>{num}</button>
                ))}
                <button type="button" className="scan-btn" style={{ gridColumn: 'span 2' }} onClick={() => inventoryData.setTouchCode(prev => prev + '0')}>0</button>
                <button type="button" className="scan-btn" onClick={() => inventoryData.setTouchCode(prev => prev.slice(0, -1))}>⌫</button>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => inventoryData.setShowContingencyModal(false)}>Cerrar</button>
                <button type="submit" className="btn-submit">Buscar / Ingresar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
