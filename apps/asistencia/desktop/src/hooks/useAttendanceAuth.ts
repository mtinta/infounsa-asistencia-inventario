import { useCallback, useEffect, useState } from 'react';
import {
  apiGetCurrentUser,
  apiLogin,
  apiRegister,
  API_BASE,
  clearSession,
  getStoredTokens,
  getStoredUser,
  storeSession,
} from '../utils/api';
import { DeviceConfig, UserRole } from '../types';
import { AsistenciaElectronAPI, ToastType } from '@infounsa/shared-types';

interface UseAttendanceAuthParams {
  electronAPI?: AsistenciaElectronAPI;
  deviceConfig: DeviceConfig;
  setDeviceConfig: (config: DeviceConfig) => void;
  refreshDesktopState: () => Promise<void>;
  showToast: (msg: string, type: ToastType) => void;
}

export function useAttendanceAuth({
  electronAPI,
  deviceConfig,
  setDeviceConfig,
  refreshDesktopState,
  showToast,
}: UseAttendanceAuthParams) {
  const storedUser = getStoredUser();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const { accessToken } = getStoredTokens();
    return !!accessToken;
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regTerms, setRegTerms] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(() => (storedUser?.role as UserRole | null) ?? null);
  const [profileName, setProfileName] = useState(storedUser?.full_name?.split(' ')[0] ?? 'Operador');
  const [profileLastName, setProfileLastName] = useState(storedUser?.full_name?.split(' ').slice(1).join(' ') ?? '');
  const [profileEmail, setProfileEmail] = useState(storedUser?.email ?? '');

  const handleLogout = useCallback(() => {
    clearSession();
    electronAPI?.setAuthToken?.({ accessToken: null, refreshToken: null });
    setIsAuthenticated(false);
    setUserRole(null);
    setUsername('');
    setPassword('');
    showToast('Sesion cerrada', 'info');
  }, [electronAPI, showToast]);

  const syncStoredTokensToDesktop = useCallback(async () => {
    const { accessToken, refreshToken } = getStoredTokens();
    if (electronAPI?.setAuthToken && accessToken) {
      await electronAPI.setAuthToken({ accessToken, refreshToken });
    }
  }, [electronAPI]);

  useEffect(() => {
    if (isAuthenticated) {
      syncStoredTokensToDesktop().catch(() => {});
      refreshDesktopState();
    }
  }, [isAuthenticated, refreshDesktopState, syncStoredTokensToDesktop]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchProfile = async () => {
      const user = getStoredUser();
      if (!user?.id) return;
      try {
        const profile = await apiGetCurrentUser(user.id, handleLogout);
        localStorage.setItem('ast_user', JSON.stringify(profile));
        setProfileName(profile.full_name?.split(' ')[0] ?? profile.username ?? 'Operador');
        setProfileLastName(profile.full_name?.split(' ').slice(1).join(' ') ?? '');
        setProfileEmail(profile.email ?? '');
        if (profile.role) {
          setUserRole(profile.role as UserRole);
        }
      } catch (err) {
        console.warn('No se pudo obtener el perfil del servidor, cargando datos locales:', err);
        const localUser = getStoredUser();
        if (localUser) {
          setProfileName(localUser.full_name?.split(' ')[0] ?? localUser.username ?? 'Operador');
          setProfileLastName(localUser.full_name?.split(' ').slice(1).join(' ') ?? '');
          setProfileEmail(localUser.email ?? '');
          if (localUser.role) {
            setUserRole(localUser.role as UserRole);
          }
        }
      }
    };
    fetchProfile();
  }, [handleLogout, isAuthenticated]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const data = await apiLogin(username, password);
      if (API_BASE !== deviceConfig.api_base_url) {
        const nextConfig = { ...deviceConfig, api_base_url: API_BASE };
        const savedConfig = await electronAPI?.updateDeviceConfig?.(nextConfig);
        setDeviceConfig((savedConfig as DeviceConfig) || nextConfig);
      }
      storeSession(data.access_token, data.refresh_token, data.user);
      await electronAPI?.setAuthToken?.({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });

      // Save encrypted credentials locally for future offline login
      try {
        await electronAPI?.saveOfflineCredentials?.({
          username,
          password,
          user: data.user,
        });
      } catch (saveErr) {
        console.warn('Could not save offline auth credentials:', saveErr);
      }

      setIsAuthenticated(true);
      setUserRole(data.user?.role ?? null);
      setProfileName(data.user?.full_name?.split(' ')[0] ?? data.user?.username ?? 'Operador');
      setProfileLastName(data.user?.full_name?.split(' ').slice(1).join(' ') ?? '');
      setProfileEmail(data.user?.email ?? '');
      showToast(`Bienvenido ${data.user?.full_name ?? username}`, 'success');
    } catch (err: unknown) {
      // Fallback: Attempt offline authentication using local SQLite credentials
      try {
        const offlineRes = await electronAPI?.verifyOfflineCredentials?.({ username, password });
        if (offlineRes && typeof offlineRes === 'object' && (offlineRes as { ok?: boolean }).ok && (offlineRes as { user?: { role?: UserRole; full_name?: string; username?: string; email?: string } }).user) {
          const offlineUser = (offlineRes as { user: { role?: UserRole; full_name?: string; username?: string; email?: string } }).user;
          const dummyToken = 'offline-contingency-token-' + Date.now();
          storeSession(dummyToken, dummyToken, offlineUser);
          await electronAPI?.setAuthToken?.({
            accessToken: dummyToken,
            refreshToken: dummyToken,
          });

          setIsAuthenticated(true);
          setUserRole(offlineUser.role ?? 'operador');
          setProfileName(offlineUser.full_name?.split(' ')[0] ?? offlineUser.username ?? 'Operador');
          setProfileLastName(offlineUser.full_name?.split(' ').slice(1).join(' ') ?? '');
          setProfileEmail(offlineUser.email ?? '');
          showToast(`⚠️ Modo Contingencia: Sesión iniciada offline (${offlineUser.full_name})`, 'info');
          return;
        }
      } catch (offlineErr) {
        console.warn('Fallo verificacion offline:', offlineErr);
      }

      const errMsg = err instanceof Error ? err.message : 'No se pudo autenticar contra la API de asistencia.';
      showToast(errMsg, 'error');
    } finally {
      setIsLoggingIn(false);
    }
  }, [deviceConfig, electronAPI, setDeviceConfig, showToast, username, password]);

  const handleRegister = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword !== regConfirmPassword) {
      showToast('Las contrasenas no coinciden', 'error');
      return;
    }
    if (!regTerms) {
      showToast('Debe aceptar las politicas de uso', 'error');
      return;
    }

    setIsLoggingIn(true);
    try {
      await apiRegister({
        fullName: regFullName,
        email: regEmail,
        username: regUsername,
        password: regPassword,
      });
      showToast('Registro exitoso. Inicie sesion.', 'success');
      setIsRegistering(false);
      setUsername(regUsername);
      setRegFullName('');
      setRegEmail('');
      setRegUsername('');
      setRegPassword('');
      setRegConfirmPassword('');
      setRegTerms(false);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'No se pudo completar el registro.';
      showToast(errMsg, 'error');
    } finally {
      setIsLoggingIn(false);
    }
  }, [regConfirmPassword, regEmail, regFullName, regPassword, regTerms, regUsername, showToast]);

  return {
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
    setUserRole,
    profileName,
    setProfileName,
    profileLastName,
    setProfileLastName,
    profileEmail,
    setProfileEmail,
    handleLogout,
    handleLogin,
    handleRegister,
  };
}
