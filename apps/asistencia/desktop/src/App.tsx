import React, { Suspense, lazy, useCallback, useEffect, useState, useRef } from 'react';
import { API_BASE, getStoredTokens, updateApiBase } from './utils/api';
import { isMinorContingencyDni, isValidDniFormat } from './utils/validators';
import { useToast } from './components/ui/ToastProvider';
import './App.css';

import {
  ClipboardList as LogIcon,
  FileText as ReportIcon,
  LayoutDashboard as DashboardIcon,
  Monitor as KioskIcon,
  Moon,
  RefreshCw as SyncIcon,
  Settings as SettingsIcon,
  Sun,
  Wifi,
  WifiOff,
  LogOut as LogOutIcon,
  User as UserIcon,
  Upload as UploadIcon,
  Shield,
  Clock,
  UserCheck,
} from 'lucide-react';

import { AttendanceRecord, User, DeviceConfig } from './types';
import Modal from './components/ui/Modal';
import Tooltip from './components/ui/Tooltip';
import NumpadTactil from './components/ui/NumpadTactil';
import RegistroVisitanteModal from './components/ui/RegistroVisitanteModal';
import AdminTabContent, { ActiveTab } from './components/admin/AdminTabContent';
import { useAttendanceAuth } from './hooks/useAttendanceAuth';
import { useAttendanceData } from './hooks/useAttendanceData';

// Emerson's scan hooks and components
import { useBarcodeScanner } from './hooks/useBarcodeScanner';
import { AsistenciaElectronAPI, AttendanceMarkRecord } from '@infounsa/shared-types';
const WebcamScanner = lazy(() =>
  import('./components/WebcamScanner').then((module) => ({ default: module.WebcamScanner })),
);

declare global {
  interface Window {
    electronAPI?: AsistenciaElectronAPI;
  }
}

const NO_DOCUMENT_VISITOR_DNI = 'VISIT000';

export default function App() {
  const { showToast } = useToast();
  const electronAPI = window.electronAPI;
  const [notifyAttendance, setNotifyAttendance] = useState(true);
  const [notifyTerminal, setNotifyTerminal] = useState(true);
  const [notifyReports, setNotifyReports] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [quickApiUrl, setQuickApiUrl] = useState(() => localStorage.getItem('ast_api_url') || API_BASE);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [time, setTime] = useState(new Date().toLocaleTimeString('es-PE'));

  const [dniInput, setDniInput] = useState('');
  const scanTimeoutRef = useRef<any>(null);

  const handleDniInputChange = useCallback((val: string) => {
    setDniInput(val);
  }, []);

  const [filterDni, setFilterDni] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Multi-window & Scanner states
  const [currentRoute, setCurrentRoute] = useState<'kiosk' | 'admin'>(() => {
    const hash = window.location.hash;
    if (hash.includes('kiosk')) return 'kiosk';
    return 'admin';
  });
  const [scanMode, setScanMode] = useState<'teclado' | 'webcam'>('teclado');
  const [scannedUserCard, setScannedUserCard] = useState<AttendanceRecord | null>(null);

  const [showVisitorModal, setShowVisitorModal] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorNombres, setVisitorNombres] = useState('');
  const [visitorApellidoPaterno, setVisitorApellidoPaterno] = useState('');
  const [visitorApellidoMaterno, setVisitorApellidoMaterno] = useState('');
  const [visitorDni, setVisitorDni] = useState('');
  const [visitorAge, setVisitorAge] = useState('');
  const [visitorType, setVisitorType] = useState<'entrada' | 'salida'>('entrada');
  const [visitorReason, setVisitorReason] = useState('');
  const [visitorNotes, setVisitorNotes] = useState('');

  const [showMinorModal, setShowMinorModal] = useState(false);
  const [minorAge, setMinorAge] = useState('');
  const [minorName, setMinorName] = useState('');

  const {
    records,
    setRecords,
    syncQueue,
    setSyncQueue,
    syncLogs,
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
  } = useAttendanceData({
    electronAPI,
    showToast,
  });

  const {
    isAuthenticated,
    username,
    setUsername,
    password,
    setPassword,
    isLoggingIn,
    isRegistering,
    setIsRegistering,
    regFullName,
    setRegFullName,
    regEmail,
    setRegEmail,
    regUsername,
    setRegUsername,
    regPassword,
    setRegPassword,
    regConfirmPassword,
    setRegConfirmPassword,
    regTerms,
    setRegTerms,
    userRole,
    profileName,
    setProfileName,
    profileLastName,
    setProfileLastName,
    profileEmail,
    setProfileEmail,
    handleLogout,
    handleLogin,
    handleRegister,
  } = useAttendanceAuth({
    electronAPI,
    deviceConfig,
    setDeviceConfig,
    refreshDesktopState,
    showToast,
  });

  const activeApiBase = localStorage.getItem('ast_api_url') || API_BASE;

  const getAutomaticMarkTypeForDni = useCallback(async (dni: string): Promise<'entrada' | 'salida'> => {
    let lastRecord: AttendanceRecord | AttendanceMarkRecord | null = null;
    if (electronAPI?.findLastMarkForDni) {
      lastRecord = await electronAPI.findLastMarkForDni(dni).catch(() => null);
    }
    if (!lastRecord) {
      lastRecord = records.filter((r) => r.dni === dni)[0];
    }
    const todayDateStr = new Date().toISOString().split('T')[0];
    const lastRecordDate = lastRecord ? (lastRecord as { registered_at?: string; timestamp?: string; fecha_hora?: string }) : null;
    const rawDateStr = lastRecordDate?.registered_at || lastRecordDate?.timestamp || lastRecordDate?.fecha_hora;
    const lastRecordDateStr = rawDateStr ? new Date(rawDateStr).toISOString().split('T')[0] : null;
    const isSameDay = todayDateStr === lastRecordDateStr;
    const lastType = (lastRecord as { type?: string; tipo?: string; tipo_marca?: string })?.type || (lastRecord as { tipo?: string })?.tipo || (lastRecord as { tipo_marca?: string })?.tipo_marca;
    return (isSameDay && lastRecord && lastType === 'entrada') ? 'salida' : 'entrada';
  }, [electronAPI, records]);

  const resetVisitorForm = useCallback((nextDni = '', initialType: 'entrada' | 'salida' = 'entrada') => {
    setShowVisitorModal(false);
    setVisitorName('');
    setVisitorNombres('');
    setVisitorApellidoPaterno('');
    setVisitorApellidoMaterno('');
    setVisitorDni(nextDni);
    setVisitorAge('');
    setVisitorType(initialType);
    setVisitorReason('');
    setVisitorNotes('');
  }, []);

  const openVisitorModal = useCallback(async (nextDni: string) => {
    const autoType = await getAutomaticMarkTypeForDni(nextDni);
    resetVisitorForm(nextDni, autoType);
    setShowVisitorModal(true);
  }, [resetVisitorForm, getAutomaticMarkTypeForDni]);

  // Setup Barcode Keyboard Listener
  useBarcodeScanner({
    onScan: (code) => {
      console.log(`[Barcode Scanner] Scanned DNI code: ${code}`);
      processDni(code);
    },
    enabled: currentRoute === 'kiosk' && scanMode === 'teclado' && !showVisitorModal && !showMinorModal,
    timeThreshold: 50,
    minLength: 8,
  });

  // Cross-Window IPC Listeners
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    if (currentRoute === 'kiosk') {
      if (electronAPI?.onVisitorRegisteredSuccess) {
        const cleanup1 = electronAPI.onVisitorRegisteredSuccess(({ dni, name }) => {
          console.log(`[Kiosk React] Administrador registró al visitante: ${name} (${dni})`);
          // registerMark(dni, name); // Evitamos registro duplicado (el panel Admin ya registra la marca con todos los detalles de visita)
        });
        cleanups.push(cleanup1);
      }

      if (electronAPI?.onSimulateScan) {
        const cleanup2 = electronAPI.onSimulateScan((dni) => {
          console.log(`[Kiosk React] Recibido escaneo simulado para DNI: ${dni}`);
          processDni(dni);
        });
        cleanups.push(cleanup2);
      }
    }

    if (currentRoute === 'admin' && electronAPI?.onRegisterVisitor) {
      const cleanup3 = electronAPI.onRegisterVisitor((dni) => {
        console.log(`[Admin React] Recibido DNI no registrado de Kiosco: ${dni}. Abriendo registro.`);
        openVisitorModal(dni);
      });
      cleanups.push(cleanup3);
    }

    if (electronAPI?.onDatabaseChanged) {
      const cleanupDB = electronAPI.onDatabaseChanged(() => {
        console.log('[React App] Recibido evento database:changed. Refrescando estado local...');
        refreshDesktopState();
      });
      cleanups.push(cleanupDB);
    }

    return () => {
      cleanups.forEach(c => c());
    };
  }, [currentRoute, electronAPI, openVisitorModal, records, syncQueue, refreshDesktopState]);

  // Router change listener
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.includes('/admin')) {
        setCurrentRoute('admin');
      } else if (hash.includes('/kiosk')) {
        setCurrentRoute('kiosk');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Redirect operators if they try to access unauthorized tabs
  useEffect(() => {
    if (userRole === 'operador' && !['dashboard', 'kiosk', 'log'].includes(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [userRole, activeTab]);

  useEffect(() => {
    const tick = setInterval(() => setTime(new Date().toLocaleTimeString('es-PE')), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const checkServerConnection = async () => {
      try {
        const res = await fetch(`${activeApiBase}/health`, {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(3000),
        });
        const health = await res.json().catch(() => null);
        setIsOnline(res.ok && health?.status === 'ok' && health?.database === 'connected' && health?.service === 'asistencia-api');
      } catch {
        setIsOnline(false);
      }
    };

    checkServerConnection();
    const interval = setInterval(checkServerConnection, 5000);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('offline', handleOffline);
    return () => {
      clearInterval(interval);
      window.removeEventListener('offline', handleOffline);
    };
  }, [activeApiBase]);

  const playBeepSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (err) {
      console.warn('No se pudo reproducir el beep:', err);
    }
  };

  const registerMark = useCallback(async (
    dni: string,
    name: string,
    forcedType?: 'entrada' | 'salida',
    metadata?: {
      observacion?: string | null;
      datos_menor?: { nombre_completo: string; dni_contingencia?: string };
      visitante_nombre?: string | null;
      visitante_motivo?: string | null;
      visitante_observacion?: string | null;
    },
  ) => {
    let nextType = forcedType;
    if (!nextType) {
      nextType = await getAutomaticMarkTypeForDni(dni);
    }

    const isMinor = dni === '00000000';
    const observacion = metadata?.observacion ?? null;
    const isKioskView = currentRoute === 'kiosk' || activeTab === 'kiosk' || window.location.hash.includes('kiosk');

    if (isKioskView) {
      playBeepSound();
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      setScannedUserCard({
        id_local: window.crypto.randomUUID(),
        dni,
        name,
        type: nextType,
        registered_at: new Date().toISOString(),
        sync_status: 'pendiente',
      });
      scanTimeoutRef.current = setTimeout(() => {
        setScannedUserCard(null);
        scanTimeoutRef.current = null;
      }, 5000);
    }

    try {
      setIsLoading(true);
      if (electronAPI?.registerMark) {
        const res = await electronAPI.registerMark({
          dni,
          name,
          type: nextType,
          usuario_id: isMinor ? null : dni,
          es_menor_manual: isMinor,
          observacion,
          datos_menor: metadata?.datos_menor,
          visitante_nombre: metadata?.visitante_nombre ?? null,
          visitante_motivo: metadata?.visitante_motivo ?? null,
          visitante_observacion: metadata?.visitante_observacion ?? null,
          registered_at: new Date().toISOString(),
        });
        await refreshDesktopState();
        electronAPI?.notifyDatabaseChanged?.();
        if (isKioskView) {
          setScannedUserCard({
            id_local: res?.localId || window.crypto.randomUUID(),
            dni,
            name,
            type: nextType,
            registered_at: new Date().toISOString(),
            observacion,
            sync_status: 'pendiente',
          });
        }
      } else {
        const record: AttendanceRecord = {
          id_local: crypto.randomUUID(),
          usuario_id: isMinor ? null : dni,
          dni,
          name,
          type: nextType,
          registered_at: new Date().toISOString(),
          observacion,
          es_menor_manual: isMinor,
          datos_menor: metadata?.datos_menor,
          visitante_nombre: metadata?.visitante_nombre ?? null,
          visitante_motivo: metadata?.visitante_motivo ?? null,
          visitante_observacion: metadata?.visitante_observacion ?? null,
          sync_status: 'pendiente',
        };
        setRecords((prev) => {
          const nextRecords = [record, ...prev];
          localStorage.setItem('ast_local_records', JSON.stringify(nextRecords));
          return nextRecords;
        });
        setSyncQueue((prev) => {
          const nextQueue = [record, ...prev];
          localStorage.setItem('ast_local_sync_queue', JSON.stringify(nextQueue));
          return nextQueue;
        });
      }
      setDniInput('');
      showToast(`${isOnline ? 'Marcación registrada' : 'Marcación almacenada offline'}: ${name}`, isOnline ? 'success' : 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo registrar la marcacion local.';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [electronAPI, isOnline, records, refreshDesktopState, showToast, currentRoute, activeTab]);

  const processDni = async (dni: string) => {
    const cleanDni = dni.trim();

    if (!isValidDniFormat(cleanDni)) {
      showToast('El documento debe contener entre 8 y 12 caracteres alfanumericos.', 'error');
      setDniInput('');
      return;
    }

    if (isMinorContingencyDni(cleanDni)) {
      setShowMinorModal(true);
      return;
    }

    const startTime = performance.now();

    try {
      let foundUser = null;
      if (electronAPI?.findLocalUserByDni) {
        foundUser = await electronAPI.findLocalUserByDni(cleanDni);
      }

      if (!foundUser) {
        foundUser = users.find(u => u.dni === cleanDni) || null;
        if (foundUser && electronAPI?.saveLocalUser) {
          electronAPI.saveLocalUser(foundUser).catch(() => {});
        }
      }

      const endTime = performance.now();
      const latency = (endTime - startTime).toFixed(2);
      console.log(`SQLite query latency for DNI ${cleanDni}: ${latency}ms`);

      if (foundUser) {
        await registerMark(foundUser.dni, foundUser.name || foundUser.nombres || 'Usuario');
      } else {
        if (userRole === 'operador') {
          showToast(`DNI ${cleanDni} no registrado. Solicite registro al Administrador.`, 'error');
          setDniInput('');
        } else {
          if (currentRoute === 'kiosk') {
            if (electronAPI?.sendUnknownDni) {
              electronAPI.sendUnknownDni(cleanDni);
              showToast(`DNI ${cleanDni} no registrado. Solicitando registro al encargado...`, 'info');
            } else {
              openVisitorModal(cleanDni);
            }
          } else {
            openVisitorModal(cleanDni);
          }
        }
      }
    } catch (err) {
      console.error('Error querying SQLite database:', err);
      showToast('Error al consultar el DNI en la base de datos local.', 'error');
    }
  };

  const handleDniSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processDni(dniInput);
  };

  const handleRegisterVisitor = (e: React.FormEvent) => {
    e.preventDefault();
    if (visitorName.trim().length < 3) {
      showToast('Ingrese el nombre completo del visitante.', 'error');
      return;
    }
    if (visitorReason.trim().length < 3) {
      showToast('Ingrese el motivo de visita.', 'error');
      return;
    }
    if (visitorAge && (parseInt(visitorAge, 10) < 1 || parseInt(visitorAge, 10) > 99)) {
      showToast('Ingrese una edad referencial valida entre 1 y 99.', 'error');
      return;
    }
    const details = [
      `Visitante: ${visitorName.trim()}`,
      `Motivo: ${visitorReason.trim()}`,
      visitorAge ? `Edad referencial: ${visitorAge}` : null,
      visitorNotes.trim() ? `Obs: ${visitorNotes.trim()}` : null,
    ].filter(Boolean).join(' | ');

    const visitorObservation = [
      visitorAge ? `Edad referencial: ${visitorAge}` : null,
      visitorNotes.trim() || null,
    ].filter(Boolean).join(' | ') || null;
    const normalizedVisitorDni = visitorDni.trim() || NO_DOCUMENT_VISITOR_DNI;

    if (currentRoute === 'admin' && electronAPI?.sendVisitorRegisteredSuccess) {
      electronAPI.sendVisitorRegisteredSuccess({ dni: normalizedVisitorDni, name: visitorName.trim() });
    }

    if (electronAPI?.saveLocalUser) {
      electronAPI.saveLocalUser({
        dni: normalizedVisitorDni,
        name: visitorName.trim(),
        role: 'usuario',
        sede: 'Sede Universitaria',
      }).then(() => refreshDesktopState());
    } else if (!electronAPI) {
      const newUser: User = {
        dni: normalizedVisitorDni,
        name: visitorName.trim(),
        role: 'usuario',
        sede: 'Sede Universitaria'
      };
      setUsers((prev) => {
        if (prev.some((u) => u.dni === normalizedVisitorDni)) return prev;
        const nextUsers = [...prev, newUser];
        localStorage.setItem('ast_local_users', JSON.stringify(nextUsers));
        return nextUsers;
      });
    }

    registerMark(normalizedVisitorDni, visitorName.trim(), visitorType, {
      observacion: details,
      visitante_nombre: visitorName.trim(),
      visitante_motivo: visitorReason.trim(),
      visitante_observacion: visitorObservation,
    });
    resetVisitorForm();
  };

  const handleSkipVisitor = async () => {
    const normalizedVisitorDni = visitorDni.trim() || NO_DOCUMENT_VISITOR_DNI;
    const autoType = await getAutomaticMarkTypeForDni(normalizedVisitorDni);
    registerMark(normalizedVisitorDni, 'Visitante No Identificado', autoType, {
      observacion: 'Visitante: Visitante No Identificado | Motivo: Sin especificar',
      visitante_nombre: 'Visitante No Identificado',
      visitante_motivo: 'Sin especificar',
      visitante_observacion: null,
    });
    resetVisitorForm();
    setDniInput('');
  };

  const handleRegisterMinor = (e: React.FormEvent) => {
    e.preventDefault();
    const ageNum = parseInt(minorAge, 10);
    if (!minorAge || ageNum < 1 || ageNum > 17) {
      showToast('Ingrese una edad valida (1-17)', 'error');
      return;
    }
    if (minorName.trim().length < 3) {
      showToast('Ingrese el nombre completo del menor con al menos 3 caracteres.', 'error');
      return;
    }
    const label = `Menor: ${minorName.trim()} (${minorAge} anios)`;
    registerMark('00000000', label, undefined, {
      observacion: `Menor - Edad: ${minorAge} anios`,
      datos_menor: {
        nombre_completo: minorName.trim(),
        dni_contingencia: '00000000',
      },
    });
    setShowMinorModal(false);
    setMinorAge('');
    setMinorName('');
  };

  useEffect(() => {
    const handleForceSync = () => {
      handleSyncNow(isOnline);
    };
    window.addEventListener('force-sync-outbox', handleForceSync);
    return () => {
      window.removeEventListener('force-sync-outbox', handleForceSync);
    };
  }, [handleSyncNow, isOnline]);

  const handleGenerateReport = useCallback(async (filters?: { search: string; filterType: string; filterRole: string; applyDayFilter: boolean; startDayOfWeek: number; endDayOfWeek: number }) => {
    setIsLoading(true);
    try {
      const { accessToken } = getStoredTokens();
      const headers: Record<string, string> = { 
        Accept: 'application/pdf',
        'Content-Type': 'application/json'
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      
      let queryParams = `startDate=${reportStart}&endDate=${reportEnd}&type=${reportFormat}`;
      if (filters) {
        queryParams += `&search=${encodeURIComponent(filters.search)}`;
        queryParams += `&filterType=${filters.filterType}`;
        queryParams += `&filterRole=${filters.filterRole}`;
        queryParams += `&applyDayFilter=${filters.applyDayFilter}`;
        queryParams += `&startDayOfWeek=${filters.startDayOfWeek}`;
        queryParams += `&endDayOfWeek=${filters.endDayOfWeek}`;
      }

      // Filtrar marcaciones locales activas para garantizar paridad 100% con la pantalla
      const filteredLocalRecords = records.filter((r) => {
        if (!r.registered_at) return false;
        if (r.estado_auditoria === 'borrado') return false;
        const dateStr = r.registered_at.split('T')[0];
        if (dateStr < reportStart || dateStr > reportEnd) return false;
        if (filters?.search?.trim()) {
          const q = filters.search.toLowerCase().trim();
          if (!r.dni.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false;
        }
        if (filters?.filterType && filters.filterType !== 'todos' && r.type !== filters.filterType) return false;
        if (filters?.filterRole && filters.filterRole !== 'todos') {
          let role = 'usuario';
          if (r.dni === '00000000') role = 'menor';
          else if (r.dni.startsWith('VISIT') || r.dni === 'VISIT000') role = 'visitante';
          if (role !== filters.filterRole) return false;
        }
        if (filters?.applyDayFilter) {
          let day = new Date(r.registered_at).getDay();
          if (day === 0) day = 7;
          const s = Number(filters.startDayOfWeek || 1);
          const e = Number(filters.endDayOfWeek || 5);
          if (s <= e ? (day < s || day > e) : (day < s && day > e)) return false;
        }
        return true;
      });

      const res = await fetch(`${activeApiBase}/attendance/report/pdf?${queryParams}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ records: filteredLocalRecords }),
      });

      if (!res.ok) throw new Error('Error al generar PDF');
      const blob = await res.blob();
      if (reportUrl) {
        URL.revokeObjectURL(reportUrl);
      }
      setReportUrl(URL.createObjectURL(blob));
      showToast('Reporte PDF generado exitosamente', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar el reporte. Verifique la conexion.';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [activeApiBase, reportEnd, reportStart, reportFormat, reportUrl, records, setIsLoading, setReportUrl, showToast]);

  const [isExcelLoading, setIsExcelLoading] = useState(false);

  const handleGenerateExcel = useCallback(async (filters?: { search: string; filterType: string; filterRole: string; applyDayFilter: boolean; startDayOfWeek: number; endDayOfWeek: number }) => {
    setIsExcelLoading(true);
    try {
      const { accessToken } = getStoredTokens();
      const headers: Record<string, string> = { 
        Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Type': 'application/json'
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      let queryParams = `startDate=${reportStart}&endDate=${reportEnd}`;
      if (filters) {
        queryParams += `&search=${encodeURIComponent(filters.search)}`;
        queryParams += `&filterType=${filters.filterType}`;
        queryParams += `&filterRole=${filters.filterRole}`;
        queryParams += `&applyDayFilter=${filters.applyDayFilter}`;
        queryParams += `&startDayOfWeek=${filters.startDayOfWeek}`;
        queryParams += `&endDayOfWeek=${filters.endDayOfWeek}`;
      }

      const filteredLocalRecords = records.filter((r) => {
        if (!r.registered_at) return false;
        if (r.estado_auditoria === 'borrado') return false;
        const dateStr = r.registered_at.split('T')[0];
        if (dateStr < reportStart || dateStr > reportEnd) return false;
        if (filters?.search?.trim()) {
          const q = filters.search.toLowerCase().trim();
          if (!r.dni.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false;
        }
        if (filters?.filterType && filters.filterType !== 'todos' && r.type !== filters.filterType) return false;
        if (filters?.filterRole && filters.filterRole !== 'todos') {
          let role = 'usuario';
          if (r.dni === '00000000') role = 'menor';
          else if (r.dni.startsWith('VISIT') || r.dni === 'VISIT000') role = 'visitante';
          if (role !== filters.filterRole) return false;
        }
        if (filters?.applyDayFilter) {
          let day = new Date(r.registered_at).getDay();
          if (day === 0) day = 7;
          const s = Number(filters.startDayOfWeek || 1);
          const e = Number(filters.endDayOfWeek || 5);
          if (s <= e ? (day < s || day > e) : (day < s && day > e)) return false;
        }
        return true;
      });

      const res = await fetch(`${activeApiBase}/attendance/report/excel?${queryParams}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ records: filteredLocalRecords }),
      });

      if (!res.ok) throw new Error('Error al generar reporte Excel');
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `reporte-asistencia-${reportStart}-a-${reportEnd}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      showToast('Reporte Excel descargado exitosamente', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo descargar el reporte Excel. Verifique la conexion.';
      showToast(msg, 'error');
    } finally {
      setIsExcelLoading(false);
    }
  }, [activeApiBase, reportEnd, reportStart, records, showToast]);

  const [isAuditLoading, setIsAuditLoading] = useState(false);

  const handleGenerateAuditReport = useCallback(async (filters?: { search: string; filterType: string; filterRole: string; applyDayFilter: boolean; startDayOfWeek: number; endDayOfWeek: number }) => {
    setIsAuditLoading(true);
    try {
      const { accessToken } = getStoredTokens();
      const headers: Record<string, string> = { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      
      let queryParams = `startDate=${reportStart}&endDate=${reportEnd}`;
      if (filters) {
        queryParams += `&search=${encodeURIComponent(filters.search)}`;
        queryParams += `&filterType=${filters.filterType}`;
        queryParams += `&filterRole=${filters.filterRole}`;
        queryParams += `&applyDayFilter=${filters.applyDayFilter}`;
        queryParams += `&startDayOfWeek=${filters.startDayOfWeek}`;
        queryParams += `&endDayOfWeek=${filters.endDayOfWeek}`;
      }

      const res = await fetch(`${activeApiBase}/attendance/report/audit?${queryParams}`, {
        method: 'GET',
        headers,
      });
      if (!res.ok) throw new Error('Error al generar reporte de auditoria');
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `reporte-auditoria-asistencia-${reportStart}-a-${reportEnd}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      showToast('Reporte de Auditoria Excel descargado exitosamente', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo descargar el reporte de auditoria. Verifique la conexion.';
      showToast(msg, 'error');
    } finally {
      setIsAuditLoading(false);
    }
  }, [activeApiBase, reportEnd, reportStart, showToast]);

  const filteredRecords = records
    .filter((r) => {
      const matchDni = !filterDni || r.dni.includes(filterDni) || r.name.toLowerCase().includes(filterDni.toLowerCase());
      const matchDate = !filterDate || r.registered_at.startsWith(filterDate);
      return matchDni && matchDate;
    })
    .sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime());

  const handleSyncNowAction = useCallback(() => {
    handleSyncNow(isOnline);
  }, [handleSyncNow, isOnline]);

  const sidebarItems: { key: ActiveTab; icon: React.ReactNode; label: string; count?: number }[] = [
    { key: 'dashboard', icon: <DashboardIcon size={18} />, label: 'Dashboard' },
    { key: 'kiosk', icon: <KioskIcon size={18} />, label: 'Terminal Kiosco' },
    { key: 'log', icon: <LogIcon size={18} />, label: 'Registro del Dia', count: records.length },
    { key: 'sync', icon: <SyncIcon size={18} />, label: 'Cola de Sync', count: syncQueue.length },
    { key: 'reports', icon: <ReportIcon size={18} />, label: 'Reportes PDF' },
    { key: 'upload', icon: <UploadIcon size={18} />, label: 'Carga Masiva (Lotes)' },
    { key: 'operators', icon: <UserIcon size={18} />, label: 'Gestión de Operadores' },
    { key: 'settings', icon: <SettingsIcon size={18} />, label: 'Configuracion' },
  ];

  // --- RENDERING ROUTE: kioskWindow ---
  if (currentRoute === 'kiosk') {
    const activeCard = scannedUserCard;

    return (
      <div className="app-container kiosk-window-theme" data-theme={isDark ? 'dark' : 'light'}>
        <header className="app-header">
          <div className="logo-section">
            <div className="logo-mark" aria-hidden="true">
              <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="36" height="36">
                <rect width="36" height="36" rx="6" fill="#14387F" />
                <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="white" fontFamily="sans-serif" fontSize="20" fontWeight="800">i</text>
              </svg>
            </div>
            <div>
              <h2>InfoUNSA</h2>
              <p>Terminal de Control de Asistencia Kiosco</p>
            </div>
          </div>
          
          <div className="header-status" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Tooltip content="Acceso exclusivo para supervisores y operadores de asistencia (Atajo: Ctrl + Alt + A)" position="bottom">
              <button
                type="button"
                onClick={() => electronAPI?.toggleAdminWindow?.()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                  transition: 'background-color 0.2s'
                }}
                title="Abrir o alternar Panel de Administración (Ctrl + Alt + A)"
              >
                <Shield size={16} />
                <span>Panel Administrador</span>
              </button>
            </Tooltip>

            <Tooltip content="Cambiar entre modo claro y oscuro" position="bottom">
              <button className="theme-toggle" onClick={() => setIsDark(!isDark)} aria-label="Cambiar tema">
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </Tooltip>
            <Tooltip content={isOnline ? 'Conexión activa con el servidor central. Las marcas se transmiten en tiempo real.' : 'Modo Contingencia: Las marcas se guardan cifradas localmente y se sincronizarán automáticamente al volver la red.'} position="bottom">
              <div className={`network-badge ${isOnline ? 'online' : 'offline'}`}>
                <span className="status-dot"></span>
                <span>{isOnline ? 'SERVIDOR ONLINE' : 'SERVIDOR OFFLINE'}</span>
              </div>
            </Tooltip>
          </div>
        </header>

        <main className="content-panel kiosk-only-panel" style={{ padding: '25px', background: 'var(--bg-main)' }}>
          {/* Reloj Superior Grande */}
          <div className="kiosk-big-clock-container" style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <Clock size={36} color="#38bdf8" strokeWidth={2} style={{ filter: 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.4))' }} />
              <h1 style={{
                fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                fontWeight: '800',
                letterSpacing: '3px',
                fontFamily: 'monospace, sans-serif',
                color: 'var(--text-main, #f8fafc)',
                margin: 0,
                lineHeight: 1,
              }}>
                {time}
              </h1>
            </div>
            <p style={{
              fontSize: 'clamp(0.95rem, 1.4vw, 1.15rem)',
              color: 'var(--text-muted, #94a3b8)',
              textTransform: 'capitalize',
              margin: '8px 0 0 0',
              fontWeight: '500'
            }}>
              {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="kiosk-grid-layout" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1.3fr', gap: '30px', maxWidth: '1400px', margin: '0 auto', width: '100%', alignItems: 'stretch' }}>
            {/* Left Column: Terminal Card */}
            <div className="kiosk-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px', margin: 0 }}>
              <div className="kiosk-icon-wrapper" aria-hidden="true" style={{ marginBottom: '20px' }}>
                <UserCheck size={56} strokeWidth={1.5} color="var(--accent, #38bdf8)" />
              </div>
              <h2 style={{ fontSize: '1.6rem', marginBottom: '10px' }}>Por favor, acerque su DNI al lector</h2>
              <p className="kiosk-hint" style={{ fontSize: '1rem', marginBottom: '25px' }}>O ingrese manualmente un DNI o carnet de 8 a 12 caracteres alfanuméricos.</p>

              <div className="scanner-mode-selector" style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '25px' }}>
                <Tooltip content="Modo para lectura rápida mediante código de barras o teclado numérico físico." position="top">
                  <button 
                    type="button" 
                    className={`nav-btn ${scanMode === 'teclado' ? 'active' : ''}`}
                    onClick={() => setScanMode('teclado')}
                    style={{ padding: '10px 20px', fontSize: '14px', borderRadius: '6px' }}
                  >
                    Lector Físico / Teclado
                  </button>
                </Tooltip>
                <Tooltip content="Activa la cámara frontal del terminal para escanear el carnet institucional." position="top">
                  <button 
                    type="button" 
                    className={`nav-btn ${scanMode === 'webcam' ? 'active' : ''}`}
                    onClick={() => setScanMode('webcam')}
                    style={{ padding: '10px 20px', fontSize: '14px', borderRadius: '6px' }}
                  >
                    Escáner Cámara Web
                  </button>
                </Tooltip>
              </div>
              
              {scanMode === 'teclado' ? (
                <form onSubmit={handleDniSubmit} className="kiosk-form" style={{ width: '100%', maxWidth: '500px', margin: '0 auto' }}>
                  <input 
                    type="text" 
                    placeholder="DNI / Código..." 
                    maxLength={12}
                    value={dniInput}
                    onChange={(e) => handleDniInputChange(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                    className="kiosk-input"
                    style={{ fontSize: '1.4rem', padding: '12px', height: 'auto', textAlign: 'center' }}
                    autoFocus
                  />
                  <Tooltip content="Use este botón al digitar el DNI manualmente. Con lector óptico se procesa de inmediato." position="top" style={{ width: '100%' }}>
                    <button type="submit" className="kiosk-submit-btn" style={{ fontSize: '1.1rem', padding: '12px 24px', marginTop: '15px', width: '100%' }}>Marcar Asistencia</button>
                  </Tooltip>
                </form>
              ) : (
                <Suspense fallback={<div className="panel-loading">Inicializando cámara…</div>}>
                  <WebcamScanner 
                    onScan={processDni} 
                    paused={showVisitorModal || showMinorModal} 
                  />
                </Suspense>
              )}

              <div className="kiosk-footer-note" style={{ marginTop: '30px', opacity: 0.7 }}>
                <p>Contingencias: DNI `00000000` para menor de edad sin documento.</p>
              </div>
            </div>

            {/* Right Column: Scanned User Card */}
            <div className="settings-card scanned-user-info-card" style={{ padding: '24px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', minHeight: '400px' }}>
              <h3 style={{ marginBottom: '18px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} color="#38bdf8" />
                <span>Última Marcación Registrada</span>
              </h3>
              {activeCard ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', animation: 'fadeIn 0.2s ease', textAlign: 'left' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Nombre Completo</label>
                    <input type="text" className="form-input" readOnly value={activeCard.name} style={{ background: 'var(--bg-input-read, #1e293b)', cursor: 'default', color: '#38bdf8', fontSize: '1.15rem', padding: '8px 12px', height: 'auto', fontWeight: 'bold', border: '1px solid var(--border-color)' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Documento / DNI</label>
                    <input type="text" className="form-input" readOnly value={activeCard.dni} style={{ background: 'var(--bg-input-read, #1e293b)', cursor: 'default', color: 'var(--text-main)', fontSize: '1rem', padding: '8px 12px', height: 'auto', fontWeight: 'bold', fontFamily: 'monospace' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Tipo de Marcación</label>
                    <div>
                      <span className={`badge ${activeCard.type === 'entrada' ? 'badge-success' : 'badge-danger'}`} style={{ display: 'inline-block', marginTop: '2px', textTransform: 'uppercase', fontWeight: '800', fontSize: '0.95rem', padding: '6px 16px', backgroundColor: activeCard.type === 'salida' ? '#dc2626' : '#16a34a' }}>
                        {activeCard.type}
                      </span>
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Hora de Marcación</label>
                    <input type="text" className="form-input" readOnly value={new Date(activeCard.registered_at).toLocaleTimeString('es-PE')} style={{ background: 'var(--bg-input-read, #1e293b)', cursor: 'default', color: 'var(--text-main)', fontSize: '1rem', padding: '8px 12px', height: 'auto', fontWeight: 'bold' }} />
                  </div>
                  {activeCard.observacion && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Observación</label>
                      <textarea className="form-input" readOnly value={activeCard.observacion} rows={2} style={{ background: 'var(--bg-input-read, #1e293b)', cursor: 'default', color: 'var(--text-main)', resize: 'none', fontSize: '0.85rem', padding: '6px 12px' }} />
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1, color: '#64748b', textAlign: 'center', gap: '15px', padding: '40px' }}>
                  <Clock size={40} strokeWidth={1.5} color="#64748b" />
                  <span style={{ fontSize: '0.95rem' }}>Esperando marcación de DNI...</span>
                </div>
              )}
            </div>
          </div>
        </main>

        {showMinorModal && (
          <Modal
            title="Registro - Menor de Edad"
            subtitle="DNI de contingencia 00000000 detectado."
            onClose={() => { setShowMinorModal(false); setDniInput(''); setMinorAge(''); setMinorName(''); }}
          >
            <form onSubmit={handleRegisterMinor} noValidate>
              <div className="form-group">
                <label htmlFor="minor-name">Nombre completo del menor</label>
                <input id="minor-name" type="text" value={minorName} onChange={(e) => setMinorName(e.target.value)} className="form-input" placeholder="Ingrese nombres y apellidos del menor..." autoFocus />
              </div>
              <div className="form-group">
                <label>Edad del menor</label>
                <NumpadTactil value={minorAge} onChange={setMinorAge} maxLength={2} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => { setShowMinorModal(false); setDniInput(''); setMinorAge(''); setMinorName(''); }}>Cancelar</button>
                <button type="submit" className="btn-submit" disabled={!minorAge || parseInt(minorAge, 10) < 1 || parseInt(minorAge, 10) > 17 || minorName.trim().length < 3}>Registrar Menor</button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    );
  }

  // --- RENDERING ROUTE: adminWindow ---
  if (!isAuthenticated) {
    if (isRegistering) {
      return (
        <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div className="kiosk-card" style={{ width: '450px', padding: '30px', textAlign: 'left' }}>
            <h3 style={{ textAlign: 'center', marginBottom: '10px' }}>Registro de Operador</h3>
            <p className="kiosk-hint" style={{ textAlign: 'center', marginBottom: '20px' }}>Complete los datos para solicitar una cuenta.</p>
            <form onSubmit={handleRegister} className="kiosk-form" style={{ alignItems: 'stretch' }}>
              <div className="form-group">
                <label>Nombre Completo</label>
                <input type="text" className="form-input" value={regFullName} onChange={(e) => setRegFullName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Correo Institucional</label>
                <input type="email" className="form-input" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Usuario</label>
                <input type="text" className="form-input" value={regUsername} onChange={(e) => setRegUsername(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Contrasena</label>
                <input type="password" className="form-input" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Confirmar Contrasena</label>
                <input type="password" className="form-input" value={regConfirmPassword} onChange={(e) => setRegConfirmPassword(e.target.value)} required />
              </div>
              <div className="form-group" style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '12px' }}>
                <input type="checkbox" id="terms" checked={regTerms} onChange={(e) => setRegTerms(e.target.checked)} />
                <label htmlFor="terms" style={{ margin: 0 }}>Acepto las politicas de uso del sistema academico</label>
              </div>
              <button type="submit" className="kiosk-submit-btn" disabled={isLoggingIn}>
                {isLoggingIn ? 'Registrando...' : 'Registrar'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px' }}>
              Ya tiene una cuenta? <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(false); }} style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Iniciar Sesion</a>
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
            onClick={() => setShowQuickSettings(!showQuickSettings)} 
            style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #94a3b8)' }}
            title="Configuración de API"
          >
            <SettingsIcon size={18} />
          </button>
          <h3 style={{ textAlign: 'center', marginBottom: '10px' }}>Iniciar Sesion</h3>
          <p className="kiosk-hint" style={{ textAlign: 'center', marginBottom: '20px' }}>Plataforma InfoUNSA</p>
          <div className={`network-badge ${isOnline ? 'online' : 'offline'}`} role="status" aria-label={isOnline ? 'Servidor disponible' : 'Servidor no disponible'} style={{ justifyContent: 'center', margin: '0 auto 18px', width: 'fit-content' }}>
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{isOnline ? 'SERVIDOR ONLINE' : 'SERVIDOR OFFLINE'}</span>
          </div>

          {showQuickSettings && (
            <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-card-soft, rgba(0,0,0,0.05))', textAlign: 'left' }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Configuración del Servidor</h4>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px' }}>Ruta API Principal</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={quickApiUrl} 
                  onChange={(e) => setQuickApiUrl(e.target.value)} 
                  placeholder="http://localhost:43000" 
                  style={{ fontSize: '13px', padding: '8px', marginTop: '4px' }}
                />
              </div>
              <button 
                type="button" 
                className="kiosk-submit-btn" 
                onClick={() => {
                  updateApiBase(quickApiUrl);
                  setDeviceConfig((prev) => ({ ...prev, api_base_url: quickApiUrl }));
                  if (electronAPI?.updateDeviceConfig) {
                    electronAPI.updateDeviceConfig<DeviceConfig>({ ...deviceConfig, api_base_url: quickApiUrl })
                      .then((saved) => {
                        if (saved) setDeviceConfig(saved);
                      })
                      .catch((err: unknown) => console.warn('No se pudo guardar la config en el main process:', err));
                  }
                  showToast('Dirección API actualizada con éxito', 'success');
                  setShowQuickSettings(false);
                }} 
                style={{ fontSize: '13px', padding: '6px 12px', marginTop: '10px', width: '100%', height: 'auto' }}
              >
                Guardar y Continuar
              </button>
            </div>
          )}

          <form onSubmit={handleLogin} className="kiosk-form">
            <input type="text" className="kiosk-input" placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} style={{ marginBottom: '15px', fontSize: '16px', textAlign: 'left', padding: '10px' }} autoFocus />
            <input type="password" className="kiosk-input" placeholder="Contrasena" value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginBottom: '20px', fontSize: '16px', textAlign: 'left', padding: '10px' }} />
            <button type="submit" className="kiosk-submit-btn" disabled={isLoggingIn || !username || !password}>
              {isLoggingIn ? 'Autenticando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" data-theme={isDark ? 'dark' : 'light'}>
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-mark" aria-hidden="true">
            <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="36" height="36">
              <rect width="36" height="36" rx="6" fill="#14387F" />
              <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="white" fontFamily="sans-serif" fontSize="20" fontWeight="800">i</text>
            </svg>
          </div>
          <div>
            <h2>InfoUNSA - Gestión</h2>
            <p>{profileName ? `${profileName} ${profileLastName || ''} (${userRole === 'administrador' ? 'Administrador' : 'Operador'})` : 'Panel de Administración y Sincronización Offline'}</p>
          </div>
        </div>

        <div className="header-status">
          <Tooltip content="Cambiar tema de la interfaz" position="bottom">
            <button className="theme-toggle" onClick={() => setIsDark(!isDark)} aria-label="Cambiar tema">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </Tooltip>
          <Tooltip content={isOnline ? 'Conexión activa con el servidor central.' : 'Modo Contingencia: Operando con base de datos local cifrada.'} position="bottom">
            <div className={`network-badge ${isOnline ? 'online' : 'offline'}`} role="status" aria-label={isOnline ? 'Conectado' : 'Sin conexion'}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{isOnline ? 'SERVIDOR ONLINE' : 'SERVIDOR OFFLINE'}</span>
            </div>
          </Tooltip>
          <Tooltip content="Cerrar la sesión de administración actual" position="bottom">
            <button className="theme-toggle logout-btn" onClick={handleLogout} title="Cerrar Sesión" style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>
              <LogOutIcon size={14} />
              <span>Cerrar Sesión</span>
            </button>
          </Tooltip>
          <div className="time-badge" aria-label={`Hora: ${time}`}>{time}</div>
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar" role="navigation" aria-label="Navegacion del panel">
          {sidebarItems
            .filter((item) => {
              if (userRole === 'operador') {
                return item.key === 'dashboard' || item.key === 'kiosk' || item.key === 'log';
              }
              return true;
            })
            .map(({ key, icon, label, count }) => (
              <button
                key={key}
                className={`nav-btn ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
                aria-current={activeTab === key ? 'page' : undefined}
              >
                <span className="nav-icon" aria-hidden="true">{icon}</span>
                <span className="nav-label">{label}</span>
                {count !== undefined && count > 0 && (
                  <span className="nav-badge" aria-label={`${count} elementos`}>{count}</span>
                )}
              </button>
            ))}
        </aside>

        <main className="content-panel" id="main-content">
          <AdminTabContent
            activeTab={activeTab}
            userRole={userRole}
            records={records}
            syncQueue={syncQueue}
            syncLogs={syncLogs}
            isOnline={isOnline}
            isLoading={isLoading}
            dniInput={dniInput}
            setDniInput={handleDniInputChange}
            handleDniSubmit={handleDniSubmit}
            filterDni={filterDni}
            setFilterDni={setFilterDni}
            filterDate={filterDate}
            setFilterDate={setFilterDate}
            filteredRecords={filteredRecords}
            users={users}
            setActiveTab={setActiveTab}
            handleSyncNow={handleSyncNowAction}
            reportStart={reportStart}
            setReportStart={setReportStart}
            reportEnd={reportEnd}
            setReportEnd={setReportEnd}
            reportFormat={reportFormat}
            setReportFormat={setReportFormat}
            handleGenerateReport={handleGenerateReport}
            handleGenerateExcel={handleGenerateExcel}
            isExcelLoading={isExcelLoading}
            handleGenerateAuditReport={handleGenerateAuditReport}
            isAuditLoading={isAuditLoading}
            reportUrl={reportUrl}
            profileName={profileName}
            setProfileName={setProfileName}
            profileLastName={profileLastName}
            setProfileLastName={setProfileLastName}
            profileEmail={profileEmail}
            setProfileEmail={setProfileEmail}
            notifyAttendance={notifyAttendance}
            setNotifyAttendance={setNotifyAttendance}
            notifyTerminal={notifyTerminal}
            setNotifyTerminal={setNotifyTerminal}
            notifyReports={notifyReports}
            setNotifyReports={setNotifyReports}
            terminals={terminals}
            handleLogout={handleLogout}
            showToast={showToast}
            deviceConfig={deviceConfig}
            handleSaveDeviceConfig={handleSaveDeviceConfig}
            handleResetLocalData={handleResetLocalData}
            scannedUserCard={scannedUserCard}
            handleUpdateMark={handleUpdateMark}
            handleDeleteMark={handleDeleteMark}
            handleCreateManualMark={handleCreateManualMark}
          />
        </main>
      </div>

      {showVisitorModal && (
        <RegistroVisitanteModal
          dni={visitorDni}
          name={visitorName}
          nombres={visitorNombres}
          apellidoPaterno={visitorApellidoPaterno}
          apellidoMaterno={visitorApellidoMaterno}
          age={visitorAge}
          type={visitorType}
          reason={visitorReason}
          notes={visitorNotes}
          isSubmitting={isLoading}
          onNameChange={setVisitorName}
          onNombresChange={setVisitorNombres}
          onApellidoPaternoChange={setVisitorApellidoPaterno}
          onApellidoMaternoChange={setVisitorApellidoMaterno}
          onAgeChange={setVisitorAge}
          onTypeChange={setVisitorType}
          onReasonChange={setVisitorReason}
          onNotesChange={setVisitorNotes}
          onClose={() => {
            resetVisitorForm();
            setDniInput('');
          }}
          onSubmit={handleRegisterVisitor}
          onSkip={handleSkipVisitor}
        />
      )}

      {showMinorModal && (
        <Modal
          title="Registro - Menor de Edad"
          subtitle="DNI de contingencia 00000000 detectado."
          onClose={() => { setShowMinorModal(false); setDniInput(''); setMinorAge(''); setMinorName(''); }}
        >
          <form onSubmit={handleRegisterMinor} noValidate>
            <div className="form-group">
              <label htmlFor="minor-name">Nombre completo del menor</label>
              <input id="minor-name" type="text" value={minorName} onChange={(e) => setMinorName(e.target.value)} className="form-input" placeholder="Ingrese nombres y apellidos del menor..." autoFocus />
            </div>
            <div className="form-group">
              <label>Edad del menor</label>
              <NumpadTactil value={minorAge} onChange={setMinorAge} maxLength={2} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => { setShowMinorModal(false); setDniInput(''); setMinorAge(''); setMinorName(''); }}>Cancelar</button>
              <button type="submit" className="btn-submit" disabled={!minorAge || parseInt(minorAge, 10) < 1 || parseInt(minorAge, 10) > 17 || minorName.trim().length < 3}>Registrar Menor</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
