import { useState, useEffect, useCallback } from 'react';
import {
  apiLogin,
  storeSession,
  clearSession,
  getStoredUser,
  getStoredTokens,
  apiGetCurrentUser,
  API_BASE,
  updateApiBase,
} from '../utils/api';
import desktopConfig from '../../desktop-config.json';
import { InventarioElectronAPI, ToastType, DomainError, DomainErrorCode } from '@infounsa/shared-types';

const defaultHost = (desktopConfig as { api_host?: string })?.api_host || 'localhost';

export interface UseInventoryAuthParams {
  electron?: InventarioElectronAPI;
  showToast: (msg: string, type: ToastType) => void;
  onLogout?: () => void;
}

export function useInventoryAuth({ electron, showToast, onLogout }: UseInventoryAuthParams) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const { accessToken } = getStoredTokens();
    return !!accessToken;
  });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [quickApiUrl, setQuickApiUrl] = useState(() => localStorage.getItem('inv_api_url') || API_BASE);
  const [currentApiUrl, setCurrentApiUrl] = useState(() => localStorage.getItem('inv_api_url') || API_BASE);

  // Registro de Operador
  const [isRegistering, setIsRegistering] = useState(false);
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regTerms, setRegTerms] = useState(false);

  // Perfil y Configuración
  const storedUser = getStoredUser();
  const [userRole, setUserRole] = useState<string | null>(() => storedUser?.role ?? null);
  const [profileName, setProfileName] = useState(storedUser?.full_name?.split(' ')[0] ?? 'Operador');
  const [profileLastName, setProfileLastName] = useState(storedUser?.full_name?.split(' ').slice(1).join(' ') ?? '');
  const [profileEmail, setProfileEmail] = useState(storedUser?.email ?? '');
  const [notifyStockAlerts, setNotifyStockAlerts] = useState(true);
  const [notifyMovements, setNotifyMovements] = useState(true);
  const [notifyMonthlyReports, setNotifyMonthlyReports] = useState(false);
  const [dbPath, setDbPath] = useState('local_audit.db');

  const handleLogout = useCallback(() => {
    clearSession();
    setIsAuthenticated(false);
    setUserRole(null);
    setUsername('');
    setPassword('');
    showToast('Sesión cerrada', 'info');
    onLogout?.();
  }, [showToast, onLogout]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const data = await apiLogin(username, password);
      storeSession(data.access_token, data.refresh_token, data.user);
      setIsAuthenticated(true);
      setUserRole(data.user?.role ?? null);
      showToast(`Bienvenido ${data.user?.full_name ?? username}`, 'success');
    } catch (err: unknown) {
      if (DomainError.isDomainError(err)) {
        showToast(err.message, 'error');
      } else {
        const msg = err instanceof Error ? err.message : 'No se pudo autenticar contra la API de inventario.';
        showToast(msg, 'error');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword !== regConfirmPassword) {
      showToast('Las contraseñas no coinciden', 'error');
      return;
    }
    if (!regTerms) {
      showToast('Debe aceptar las políticas de uso', 'error');
      return;
    }
    setIsLoggingIn(true);
    try {
      throw new Error('Registro de operadores deshabilitado; use el panel de administracion.');
    } catch (err: unknown) {
      if (DomainError.isDomainError(err) && err.code === DomainErrorCode.ERR_USER_ALREADY_EXISTS) {
        showToast(err.message, 'error');
      } else {
        const msg = err instanceof Error ? err.message : 'No se pudo registrar el operador en la API.';
        showToast(msg, 'error');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSaveQuickApiUrl = async () => {
    updateApiBase(quickApiUrl);
    setCurrentApiUrl(quickApiUrl);
    if (electron?.setAuthToken) {
      await electron.setAuthToken({ accessToken: null, refreshToken: null, apiUrl: quickApiUrl });
    }
    showToast('Dirección API actualizada con éxito', 'success');
    setShowQuickSettings(false);
  };

  const syncStoredTokensToDesktop = useCallback(async () => {
    const { accessToken, refreshToken } = getStoredTokens();
    if (electron?.setAuthToken && accessToken) {
      const currentUrl = localStorage.getItem('inv_api_url') || `http://${defaultHost}:43001`;
      await electron.setAuthToken({ accessToken, refreshToken, apiUrl: currentUrl });
    }
  }, [electron]);

  useEffect(() => {
    if (isAuthenticated) {
      syncStoredTokensToDesktop().catch(() => {});
    }
  }, [isAuthenticated, syncStoredTokensToDesktop]);

  // Cargar perfil de usuario en arranque/login con caché local
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchProfile = async () => {
      const user = getStoredUser();
      if (!user?.id) return;
      try {
        const profile = await apiGetCurrentUser(user.id, handleLogout);
        localStorage.setItem('inv_user', JSON.stringify(profile));
        setProfileName((profile.full_name?.split(' ')[0]) || profile.username || 'Operador');
        setProfileLastName(profile.full_name?.split(' ').slice(1).join(' ') ?? '');
        setProfileEmail(profile.email ?? '');
        if (profile.role) {
          setUserRole(profile.role);
        }
      } catch (err) {
        console.warn('No se pudo obtener el perfil del servidor, cargando datos locales:', err);
        const cachedUser = getStoredUser();
        if (cachedUser) {
          setProfileName(cachedUser.full_name?.split(' ')[0] ?? cachedUser.username ?? 'Operador');
          setProfileLastName(cachedUser.full_name?.split(' ').slice(1).join(' ') ?? '');
          setProfileEmail(cachedUser.email ?? '');
          if (cachedUser.role) {
            setUserRole(cachedUser.role);
          }
        }
      }
    };
    fetchProfile();
  }, [isAuthenticated, handleLogout]);

  return {
    isAuthenticated,
    setIsAuthenticated,
    username,
    setUsername,
    password,
    setPassword,
    isLoggingIn,
    setIsLoggingIn,
    showQuickSettings,
    setShowQuickSettings,
    quickApiUrl,
    setQuickApiUrl,
    currentApiUrl,
    setCurrentApiUrl,
    handleSaveQuickApiUrl,
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
    setUserRole,
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
    handleLogin,
    handleRegister,
    syncStoredTokensToDesktop,
  };
}
