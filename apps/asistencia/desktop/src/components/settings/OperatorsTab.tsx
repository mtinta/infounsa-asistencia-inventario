import React, { useState, useEffect } from 'react';
import { Plus as PlusIcon, ChevronDown as ChevronDownIcon, ChevronUp as ChevronUpIcon, Edit2 as EditIcon, Trash2 as TrashIcon, RefreshCw as RestoreIcon } from 'lucide-react';
import Tooltip from '../ui/Tooltip';
import { apiFetch } from '../../utils/api';
import { User as LocalUser } from '../../types';
import { ToastType, LocalAttendanceUser } from '@infounsa/shared-types';

export interface ApiUser {
  id: string | number;
  full_name?: string;
  username: string;
  email?: string;
  role?: string;
  role_id?: number;
  status: string;
  created_at?: string;
  [key: string]: unknown;
}

interface OperatorsTabProps {
  showToast: (msg: string, type: ToastType) => void;
  userRole: string | null;
  users: LocalUser[];
}

export default function OperatorsTab({ showToast, userRole, users }: OperatorsTabProps) {
  // Collapsible accordion states
  const [adminsExpanded, setAdminsExpanded] = useState(true);
  const [operatorsExpanded, setOperatorsExpanded] = useState(true);
  const [usersExpanded, setUsersExpanded] = useState(false);

  // Users from API (AdminUsers)
  const [apiUsers, setApiUsers] = useState<ApiUser[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'api' | 'local'>('api'); // 'api' for Admins/Ops, 'local' for Attendees
  const [editingItem, setEditingItem] = useState<ApiUser | LocalUser | null>(null);

  // Form fields for Admins/Operators (API)
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(2); // 2 = operador, 1 = administrador
  const [status, setStatus] = useState('activo');

  // Form fields for Local Attendees (Usuarios)
  const [localDni, setLocalDni] = useState('');
  const [localNombres, setLocalNombres] = useState('');
  const [localApellidoPaterno, setLocalApellidoPaterno] = useState('');
  const [localApellidoMaterno, setLocalApellidoMaterno] = useState('');
  const [localRole, setLocalRole] = useState('usuario');
  const [localSede, setLocalSede] = useState('Sede Universitaria');
  const [localCondicion, setLocalCondicion] = useState('CONTRATADO');
  const [localCargo, setLocalCargo] = useState('PERSONAL_ADMINISTRATIVO');

  // Modal para confirmación de DNI duplicado
  const [duplicateUserConfirmation, setDuplicateUserConfirmation] = useState<{ existingName: string; payload: LocalAttendanceUser } | null>(null);

  const fetchApiUsers = async () => {
    try {
      const res = await apiFetch('/users');
      if (res.ok) {
        const data = await res.json();
        setApiUsers(data);
      }
    } catch (err) {
      console.error('Error fetching API users:', err);
    }
  };

  useEffect(() => {
    if (userRole === 'administrador') {
      fetchApiUsers();
    }
  }, [userRole]);

  // --- CRUD Admins & Operators (API) ---
  const handleSaveApiUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        full_name: fullName,
        username,
        email,
        password: password || undefined,
        role_id: roleId,
        status,
      };

      let res;
      if (editingItem) {
        res = await apiFetch(`/users/${(editingItem as ApiUser).id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        res = await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        showToast(editingItem ? 'Usuario actualizado con éxito' : 'Usuario creado con éxito', 'success');
        setModalOpen(false);
        fetchApiUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || 'Error al guardar usuario', 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de red al guardar usuario';
      showToast(msg, 'error');
    }
  };

  const handleToggleStatus = async (op: ApiUser) => {
    const nextStatus = op.status === 'activo' ? 'inactivo' : 'activo';
    try {
      const res = await apiFetch(`/users/${op.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        showToast(`Usuario ${nextStatus === 'activo' ? 'activado' : 'desactivado'} con éxito`, 'success');
        fetchApiUsers();
      } else {
        showToast('Error al actualizar estado del usuario', 'error');
      }
    } catch {
      showToast('Error de red', 'error');
    }
  };

  const handleDeleteApiUser = async (op: ApiUser) => {
    if (!confirm(`¿Está seguro de eliminar al usuario "${op.username}"?`)) return;
    try {
      const res = await apiFetch(`/users/${op.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('Usuario eliminado con éxito', 'success');
        fetchApiUsers();
      } else {
        showToast('Error al eliminar usuario', 'error');
      }
    } catch {
      showToast('Error de red', 'error');
    }
  };

  const handleRestoreApiUser = async (op: ApiUser) => {
    try {
      const res = await apiFetch(`/users/${op.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'activo' }),
      });
      if (res.ok) {
        showToast('Usuario restaurado con éxito', 'success');
        fetchApiUsers();
      } else {
        showToast('Error al restaurar usuario', 'error');
      }
    } catch {
      showToast('Error de red', 'error');
    }
  };

  // Dynamic options lists for Cargo, Sede and Condicion

  // Dynamic options lists for Cargo, Sede and Condicion
  const defaultCargos = ['PERSONAL_ADMINISTRATIVO', 'DOCENTE', 'INVESTIGADOR', 'ASISTENTE', 'ESTUDIANTE'];
  const defaultSedes = ['Sede Universitaria', 'Pabellón A', 'Biblioteca Central', 'Laboratorio'];
  const defaultCondiciones = ['SIN CONTRATO', 'CONTRATADO', 'CAS', 'NOMBRADO', 'BECARIO', 'PRACTICANTE', 'VISITANTE'];
  const defaultRoles = ['alumno', 'visitante', 'operador', 'administrador'];

  const [customCargos, setCustomCargos] = useState<string[]>([]);
  const [customSedes, setCustomSedes] = useState<string[]>([]);
  const [customCondiciones, setCustomCondiciones] = useState<string[]>([]);
  const [customRoles, setCustomRoles] = useState<string[]>([]);

  const availableCargos = Array.from(new Set([...defaultCargos, ...customCargos, ...users.map((u) => u.cargo).filter(Boolean)]));
  const availableSedes = Array.from(new Set([...defaultSedes, ...customSedes, ...users.map((u) => u.sede).filter(Boolean)]));
  const availableCondiciones = Array.from(new Set([...defaultCondiciones, ...customCondiciones, ...users.map((u) => u.condicion).filter(Boolean)]));
  const availableRoles = Array.from(new Set([...defaultRoles, ...customRoles, ...users.map((u) => (u.role || '').toLowerCase()).filter(Boolean)]));

  // Sub-modals states
  const [addRoleModalOpen, setAddRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');

  const [addCargoModalOpen, setAddCargoModalOpen] = useState(false);
  const [newCargoName, setNewCargoName] = useState('');

  const [addCondicionModalOpen, setAddCondicionModalOpen] = useState(false);
  const [newCondicionName, setNewCondicionName] = useState('');

  const [addSedeModalOpen, setAddSedeModalOpen] = useState(false);
  const [newSedeName, setNewSedeName] = useState('');

  // When Cargo changes: if not ESTUDIANTE and current Condicion is SIN CONTRATO, switch to CONTRATADO automatically
  const handleCargoChange = (newCargo: string) => {
    if (newCargo === 'add_new') {
      setAddCargoModalOpen(true);
      return;
    }
    setLocalCargo(newCargo);
    if (newCargo !== 'ESTUDIANTE' && localCondicion === 'SIN CONTRATO') {
      setLocalCondicion('CONTRATADO');
    }
  };

  // When Condicion changes
  const handleCondicionChange = (newCond: string) => {
    if (newCond === 'add_new') {
      setAddCondicionModalOpen(true);
      return;
    }
    setLocalCondicion(newCond);
  };

  // When Sede changes
  const handleSedeChange = (newSede: string) => {
    if (newSede === 'add_new') {
      setAddSedeModalOpen(true);
      return;
    }
    setLocalSede(newSede);
  };

  // When Role changes
  const handleRoleChange = (newRole: string) => {
    if (newRole === 'add_new') {
      setAddRoleModalOpen(true);
      return;
    }
    setLocalRole(newRole);
    if (newRole === 'alumno') {
      setLocalCondicion('SIN CONTRATO');
      setLocalCargo('ESTUDIANTE');
    } else if (newRole === 'visitante') {
      setLocalCondicion('VISITANTE');
      setLocalCargo('VISITANTE');
    } else {
      setLocalCondicion('CONTRATADO');
      setLocalCargo('PERSONAL_ADMINISTRATIVO');
    }
  };

  // --- SUB-MODAL CREATION HANDLERS (Direct Local & DB update validation) ---
  const handleCreateNewRole = (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = newRoleName.trim().toLowerCase();
    if (!formatted) return;
    if (availableRoles.some((r) => r.toLowerCase() === formatted)) {
      showToast(`El rol "${formatted.toUpperCase()}" ya existe en el sistema.`, 'warning');
      return;
    }
    setCustomRoles((prev) => [...prev, formatted]);
    setLocalRole(formatted);
    setAddRoleModalOpen(false);
    setNewRoleName('');
    showToast(`Nuevo rol "${formatted.toUpperCase()}" añadido con éxito.`, 'success');
  };

  const handleCreateNewCargo = (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = newCargoName.trim().toUpperCase();
    if (!formatted) return;
    if (availableCargos.some((c) => c && c.toUpperCase() === formatted)) {
      showToast(`El cargo "${formatted}" ya existe en el sistema.`, 'warning');
      return;
    }
    setCustomCargos((prev) => [...prev, formatted]);
    setLocalCargo(formatted);
    if (formatted !== 'ESTUDIANTE' && localCondicion === 'SIN CONTRATO') {
      setLocalCondicion('CONTRATADO');
    }
    setAddCargoModalOpen(false);
    setNewCargoName('');
    showToast(`Nuevo cargo "${formatted}" creado con éxito.`, 'success');
  };

  const handleCreateNewCondicion = (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = newCondicionName.trim().toUpperCase();
    if (!formatted) return;
    if (availableCondiciones.some((c) => c && c.toUpperCase() === formatted)) {
      showToast(`La condición laboral "${formatted}" ya existe en el sistema.`, 'warning');
      return;
    }
    setCustomCondiciones((prev) => [...prev, formatted]);
    setLocalCondicion(formatted);
    setAddCondicionModalOpen(false);
    setNewCondicionName('');
    showToast(`Nueva condición "${formatted}" creada con éxito.`, 'success');
  };

  const handleCreateNewSede = (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = newSedeName.trim();
    if (!formatted) return;
    if (availableSedes.some((s) => s && s.toLowerCase() === formatted.toLowerCase())) {
      showToast(`La sede "${formatted}" ya existe en el sistema.`, 'warning');
      return;
    }
    setCustomSedes((prev) => [...prev, formatted]);
    setLocalSede(formatted);
    setAddSedeModalOpen(false);
    setNewSedeName('');
    showToast(`Nueva sede "${formatted}" agregada con éxito.`, 'success');
  };

  // --- CRUD Attendees (Local Users) ---
  const executeSaveUser = async (payload: LocalAttendanceUser) => {
    try {
      const electronAPI = window.electronAPI;
      if (electronAPI?.saveLocalUser) {
        await electronAPI.saveLocalUser(payload);
        showToast(editingItem ? 'Usuario local actualizado con éxito' : 'Usuario local guardado con éxito', 'success');
        setModalOpen(false);
        setDuplicateUserConfirmation(null);
        electronAPI?.notifyDatabaseChanged?.();
      } else {
        showToast('El backend local no está disponible.', 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar usuario local';
      showToast(msg, 'error');
    }
  };

  const handleSaveLocalUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const electronAPI = window.electronAPI;
      const finalCargo = localCargo;
      const finalSede = localSede;
      const finalCondicion = localCondicion;
      const surnames = `${localApellidoPaterno.trim()} ${localApellidoMaterno.trim()}`.trim();
      const fullNameCombined = surnames ? `${surnames}, ${localNombres.trim()}`.trim() : localNombres.trim();

      const payload: LocalAttendanceUser = {
        originalDni: editingItem ? (editingItem as LocalUser).dni : undefined,
        dni: localDni,
        name: fullNameCombined,
        nombres: localNombres,
        apellido_paterno: localApellidoPaterno,
        apellido_materno: localApellidoMaterno,
        apellidos: surnames,
        condicion: finalCondicion,
        cargo: finalCargo,
        role: localRole,
        sede: finalSede,
      };

      if (!editingItem && electronAPI?.findLocalUserByDni) {
        const existing = await electronAPI.findLocalUserByDni(localDni);
        if (existing) {
          setDuplicateUserConfirmation({ existingName: existing.name || existing.nombres || 'Usuario', payload });
          return;
        }
      }

      await executeSaveUser(payload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la información del usuario';
      showToast(msg, 'error');
    }
  };

  const handleDeleteLocalUser = async (userItem: LocalUser) => {
    try {
      const electronAPI = window.electronAPI;
      if (electronAPI?.deleteLocalUser) {
        await electronAPI.deleteLocalUser(userItem.dni);
        showToast('Usuario local eliminado', 'success');
        electronAPI?.notifyDatabaseChanged?.();
      } else {
        showToast('El backend local no está disponible.', 'error');
      }
    } catch {
      showToast('Error de red', 'error');
    }
  };

  // --- MODAL TRIGGERS ---
  const openCreateModal = (type: 'api' | 'local') => {
    setModalType(type);
    setEditingItem(null);
    if (type === 'api') {
      setFullName('');
      setUsername('');
      setEmail('');
      setPassword('');
      setRoleId(2);
      setStatus('activo');
    } else {
      setLocalDni('');
      setLocalNombres('');
      setLocalApellidoPaterno('');
      setLocalApellidoMaterno('');
      setLocalCondicion('SIN CONTRATO');
      setLocalCargo('ESTUDIANTE');
      setLocalRole('alumno');
      setLocalSede('Sede Universitaria');
    }
    setModalOpen(true);
  };

  const openEditModal = (item: ApiUser | LocalUser, type: 'api' | 'local') => {
    setModalType(type);
    setEditingItem(item);
    if (type === 'api') {
      const apiItem = item as ApiUser;
      setFullName(apiItem.full_name || '');
      setUsername(apiItem.username || '');
      setEmail(apiItem.email || '');
      setPassword('');
      setRoleId(apiItem.role_id || 2);
      setStatus(apiItem.status || 'activo');
    } else {
      const localItem = item as LocalUser;
      const parts = (localItem.name || '').split(' ');
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      const rawRole = (localItem.role || 'alumno').toLowerCase();
      const currentRole = rawRole === 'usuario' ? 'alumno' : rawRole;
      setLocalDni(localItem.dni);
      setLocalNombres(localItem.nombres || firstName);
      setLocalApellidoPaterno(localItem.apellido_paterno || localItem.apellidos?.split(' ')[0] || lastName.split(' ')[0] || '');
      setLocalApellidoMaterno(localItem.apellido_materno || localItem.apellidos?.split(' ').slice(1).join(' ') || lastName.split(' ').slice(1).join(' ') || '');
      setLocalCondicion(localItem.condicion || (currentRole === 'alumno' ? 'SIN CONTRATO' : 'CONTRATADO'));
      setLocalCargo(localItem.cargo || (currentRole === 'alumno' ? 'ESTUDIANTE' : 'PERSONAL_ADMINISTRATIVO'));
      setLocalRole(currentRole);
      setLocalSede(localItem.sede || 'Sede Universitaria');
    }
    setModalOpen(true);
  };

  // Split base API users
  const admins = apiUsers.filter((u) => u.role_id === 1 && (showDeleted ? u.status === 'eliminado' : u.status !== 'eliminado'));
  const operators = apiUsers.filter((u) => u.role_id === 2 && (showDeleted ? u.status === 'eliminado' : u.status !== 'eliminado'));

  // Global Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('todos');
  const [filterSede, setFilterSede] = useState('todos');
  const [filterCondicion, setFilterCondicion] = useState('todos');

  // Filter API Admins & Operators
  const filteredAdmins = apiUsers.filter((u) => {
    if (u.role_id !== 1) return false;
    if (showDeleted ? u.status !== 'eliminado' : u.status === 'eliminado') return false;

    const term = searchTerm.toLowerCase();
    const matchesSearch = (u.full_name || '').toLowerCase().includes(term) ||
                          (u.username || '').toLowerCase().includes(term) ||
                          (u.email || '').toLowerCase().includes(term);

    const matchesRole = filterRole === 'todos' || filterRole === 'administrador';
    return matchesSearch && matchesRole;
  });

  const filteredOperators = apiUsers.filter((u) => {
    if (u.role_id !== 2) return false;
    if (showDeleted ? u.status !== 'eliminado' : u.status === 'eliminado') return false;

    const term = searchTerm.toLowerCase();
    const matchesSearch = (u.full_name || '').toLowerCase().includes(term) ||
                          (u.username || '').toLowerCase().includes(term) ||
                          (u.email || '').toLowerCase().includes(term);

    const matchesRole = filterRole === 'todos' || filterRole === 'operador';
    return matchesSearch && matchesRole;
  });
  
  // Filter local attendees dynamically
  const filteredAttendees = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = (u.dni || '').toLowerCase().includes(term) ||
                          (u.name || '').toLowerCase().includes(term) ||
                          (u.nombres || '').toLowerCase().includes(term) ||
                          (u.apellidos || '').toLowerCase().includes(term);

    const matchesRole = filterRole === 'todos' || (u.role || 'usuario').toLowerCase() === filterRole.toLowerCase();
    const matchesSede = filterSede === 'todos' || (u.sede || 'Sede Universitaria').toLowerCase() === filterSede.toLowerCase();
    const matchesCondicion = filterCondicion === 'todos' || (u.condicion || '').toLowerCase() === filterCondicion.toLowerCase();

    return matchesSearch && matchesRole && matchesSede && matchesCondicion;
  });

  return (
    <div className="settings-tab-container">
      <div className="panel-header">
        <h3>Gestión de Usuarios del Sistema</h3>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', margin: 0, color: 'var(--text-main)' }}>
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            Ver eliminados
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="sync-action-btn settings-primary-action" onClick={() => openCreateModal('local')} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <PlusIcon size={15} />
              <span>+ Agregar Usuario</span>
            </button>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS GENERAL E INTERACTIVA */}
      <div style={{ background: 'var(--bg-card)', padding: '15px 20px', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '15px' }}>
        <div className="filter-grid-responsive" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: 'var(--text-main)' }}>🔍 Buscar por Nombre / DNI / Usuario / Email</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Escriba DNI, Nombre, Apellido, Usuario o Email..."
              className="form-input"
              style={{ fontSize: '0.85rem', padding: '6px 10px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: 'var(--text-main)' }}>Rol Interno</label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.85rem', padding: '6px 10px', background: 'var(--bg-input)', color: 'var(--text-main)' }}
            >
              <option value="todos">Todos los Roles</option>
              <option value="administrador">Administrador</option>
              <option value="operador">Operador local</option>
              <option value="usuario">Usuario / Alumno</option>
              <option value="visitante">Visitante</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: 'var(--text-main)' }}>Sede</label>
            <select
              value={filterSede}
              onChange={(e) => setFilterSede(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.85rem', padding: '6px 10px', background: 'var(--bg-input)', color: 'var(--text-main)' }}
            >
              <option value="todos">Todas las Sedes</option>
              <option value="Sede Universitaria">Sede Universitaria</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: 'var(--text-main)' }}>Condición</label>
            <select
              value={filterCondicion}
              onChange={(e) => setFilterCondicion(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.85rem', padding: '6px 10px', background: 'var(--bg-input)', color: 'var(--text-main)' }}
            >
              <option value="todos">Todas las Cond.</option>
              <option value="CONTRATADO">Contratado</option>
              <option value="NOMBRADO">Nombrado</option>
              <option value="CAS">CAS</option>
              <option value="PRACTICANTE">Practicante</option>
              <option value="VISITANTE">Visitante</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
        
        {/* GROUP 1: ADMINISTRADORES */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div 
            onClick={() => setAdminsExpanded(!adminsExpanded)}
            style={{ padding: '15px 20px', background: 'rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          >
            <h4 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🛡️ Administradores <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>({filteredAdmins.length} de {admins.length})</span>
            </h4>
            {adminsExpanded ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
          </div>
          
          {adminsExpanded && (
            <div className="table-scroll">
              <table className="crud-table" style={{ margin: 0, border: 'none' }}>
                <thead>
                  <tr>
                    <th>Nombre Completo</th>
                    <th>Usuario</th>
                    <th>Email</th>
                    <th>Estado</th>
                    <th className="cell-actions-header">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdmins.map((u) => (
                    <tr key={u.id}>
                      <td className="cell-wrap">{u.full_name}</td>
                      <td>{u.username}</td>
                      <td className="cell-wrap">{u.email}</td>
                      <td>
                        <span className={`badge ${u.status === 'activo' ? 'badge-success' : u.status === 'inactivo' ? 'badge-pending' : 'badge-danger'}`} style={{ backgroundColor: u.status === 'eliminado' ? '#ef4444' : undefined }}>
                          {u.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="cell-actions" style={{ display: 'flex', gap: '6px' }}>
                        <button className="sync-action-btn" onClick={() => openEditModal(u, 'api')} style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#475569', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <EditIcon size={12} /> Editar
                        </button>
                        {u.status !== 'eliminado' ? (
                          <>
                            <button className="sync-action-btn" onClick={() => handleToggleStatus(u)} style={{ padding: '4px 8px', fontSize: '0.75rem', background: u.status === 'activo' ? '#e2e8f0' : '#22c55e', color: u.status === 'activo' ? '#0f172a' : 'white' }}>
                              {u.status === 'activo' ? 'Deshabilitar' : 'Habilitar'}
                            </button>
                            <Tooltip content="Dar de baja lógica a este usuario administrativo" position="top">
                              <button className="sync-action-btn" onClick={() => handleDeleteApiUser(u)} style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <TrashIcon size={12} /> Eliminar
                              </button>
                            </Tooltip>
                          </>
                        ) : (
                          <Tooltip content="Reactiva este usuario y restablece sus permisos de acceso al kiosco." position="top">
                            <button className="sync-action-btn" onClick={() => handleRestoreApiUser(u)} style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <RestoreIcon size={12} /> Restaurar
                            </button>
                          </Tooltip>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredAdmins.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '15px', color: '#64748b' }}>
                        No hay administradores que coincidan con los filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* GROUP 2: OPERADORES */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div 
            onClick={() => setOperatorsExpanded(!operatorsExpanded)}
            style={{ padding: '15px 20px', background: 'rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          >
            <h4 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              👤 Operadores (Recepcionistas) <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>({filteredOperators.length} de {operators.length})</span>
            </h4>
            {operatorsExpanded ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
          </div>
          
          {operatorsExpanded && (
            <div className="table-scroll">
              <table className="crud-table" style={{ margin: 0, border: 'none' }}>
                <thead>
                  <tr>
                    <th>Nombre Completo</th>
                    <th>Usuario</th>
                    <th>Email</th>
                    <th>Estado</th>
                    <th className="cell-actions-header">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOperators.map((u) => (
                    <tr key={u.id}>
                      <td className="cell-wrap">{u.full_name}</td>
                      <td>{u.username}</td>
                      <td className="cell-wrap">{u.email}</td>
                      <td>
                        <span className={`badge ${u.status === 'activo' ? 'badge-success' : u.status === 'inactivo' ? 'badge-pending' : 'badge-danger'}`} style={{ backgroundColor: u.status === 'eliminado' ? '#ef4444' : undefined }}>
                          {u.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="cell-actions" style={{ display: 'flex', gap: '6px' }}>
                        <button className="sync-action-btn" onClick={() => openEditModal(u, 'api')} style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#475569', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <EditIcon size={12} /> Editar
                        </button>
                        {u.status !== 'eliminado' ? (
                          <>
                            <button className="sync-action-btn" onClick={() => handleToggleStatus(u)} style={{ padding: '4px 8px', fontSize: '0.75rem', background: u.status === 'activo' ? '#e2e8f0' : '#22c55e', color: u.status === 'activo' ? '#0f172a' : 'white' }}>
                              {u.status === 'activo' ? 'Deshabilitar' : 'Habilitar'}
                            </button>
                            <Tooltip content="Dar de baja lógica a este usuario administrativo" position="top">
                              <button className="sync-action-btn" onClick={() => handleDeleteApiUser(u)} style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <TrashIcon size={12} /> Eliminar
                              </button>
                            </Tooltip>
                          </>
                        ) : (
                          <Tooltip content="Reactiva este usuario y restablece sus permisos de acceso al kiosco." position="top">
                            <button className="sync-action-btn" onClick={() => handleRestoreApiUser(u)} style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <RestoreIcon size={12} /> Restaurar
                            </button>
                          </Tooltip>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredOperators.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '15px', color: '#64748b' }}>
                        No hay operadores que coincidan con los filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* GROUP 3: USUARIOS DE ASISTENCIA */}
        <div style={{ background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div 
            onClick={() => setUsersExpanded(!usersExpanded)}
            style={{ padding: '15px 20px', background: 'rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          >
            <h4 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🎓 Usuarios de Asistencia (Lector/Local) <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>({filteredAttendees.length} de {users.length})</span>
            </h4>
            {usersExpanded ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
          </div>
          
          {usersExpanded && (
            <div className="table-scroll">
              <table className="crud-table" style={{ margin: 0, border: 'none' }}>
                <thead>
                  <tr>
                    <th>DNI / Carnet</th>
                    <th>Nombres / Nombre Completo</th>
                    <th>Apellidos</th>
                    <th>Rol Interno</th>
                    <th>Sede</th>
                    <th>Condición</th>
                    <th>Cargo</th>
                    <th className="cell-actions-header">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendees.map((u) => {
                    const parts = (u.name || '').split(' ');
                    const firstName = u.nombres || parts[0] || u.name;
                    const lastName = u.apellidos || parts.slice(1).join(' ') || '-';
                    return (
                      <tr key={u.dni}>
                        <td style={{ fontWeight: 'bold' }}>{u.dni}</td>
                        <td className="cell-wrap">{firstName}</td>
                        <td className="cell-wrap">{lastName}</td>
                        <td>
                          <span className="badge badge-neutral">
                            {(u.role || 'usuario').toUpperCase()}
                          </span>
                        </td>
                        <td>{u.sede || 'Sede Universitaria'}</td>
                        <td>
                          <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                            {u.condicion || 'CONTRATADO'}
                          </span>
                        </td>
                        <td>{u.cargo || 'PERSONAL_ADMINISTRATIVO'}</td>
                        <td className="cell-actions" style={{ display: 'flex', gap: '6px' }}>
                          <button className="sync-action-btn" onClick={() => openEditModal(u, 'local')} style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#475569', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <EditIcon size={12} /> Editar
                          </button>
                          <button className="sync-action-btn" onClick={() => handleDeleteLocalUser(u)} style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <TrashIcon size={12} /> Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredAttendees.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '15px', color: '#64748b' }}>
                        No se encontraron usuarios de asistencia que coincidan con los filtros aplicados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* --- CRUD MODAL --- */}
      {modalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1000 }}>
          <div className="modal-box" style={{ maxWidth: '480px' }}>
              <>
                <h4>{editingItem ? 'Editar Usuario' : 'Registrar Nuevo Usuario'}</h4>
                <p className="modal-subtitle">Seleccione el tipo de usuario y complete los campos requeridos</p>

                {/* Selector de Tipo de Usuario (Unificado) */}
                {!editingItem && (
                  <div className="form-group" style={{ marginBottom: '14px', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: 'var(--accent, #38bdf8)' }}>
                      Categoría de Usuario a Crear *
                    </label>
                    <select
                      value={modalType}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setModalType(e.target.value as 'api' | 'local')}
                      className="form-input"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-main)', fontWeight: 'bold' }}
                    >
                      <option value="local">🎓 Usuario de Asistencia (Lector DNI / Alumno / Personal)</option>
                      <option value="api">🛡️ Administrador / Operador del Sistema (Acceso a App)</option>
                    </select>
                  </div>
                )}

                {modalType === 'api' ? (
                  <form onSubmit={handleSaveApiUser}>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Nombre Completo *</label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="form-input"
                        placeholder="Ej: Juan Pérez"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Nombre de Usuario *</label>
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="form-input"
                        placeholder="Ej: jperez"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Email *</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="form-input"
                        placeholder="Ej: jperez@unsa.edu.pe"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                        {editingItem ? 'Nueva Contraseña (dejar vacío para mantener actual)' : 'Contraseña *'}
                      </label>
                      <input
                        type="password"
                        required={!editingItem}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="form-input"
                        placeholder={editingItem ? '••••••••' : 'Ingrese contraseña'}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                      <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Rol *</label>
                        <select
                          value={roleId}
                          onChange={(e) => setRoleId(Number(e.target.value))}
                          className="form-input"
                          style={{ background: 'var(--bg-input)', color: 'var(--text-main)' }}
                        >
                          <option value={1}>Administrador</option>
                          <option value={2}>Operador (Recepcionista)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Estado *</label>
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                          className="form-input"
                          style={{ background: 'var(--bg-input)', color: 'var(--text-main)' }}
                        >
                          <option value="activo">Activo</option>
                          <option value="inactivo">Inactivo</option>
                        </select>
                      </div>
                    </div>
                    <div className="modal-actions">
                      <button type="button" className="btn-cancel" onClick={() => setModalOpen(false)}>Cancelar</button>
                      <button type="submit" className="btn-submit">Guardar</button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleSaveLocalUser}>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>DNI / Carnet * (Editable)</label>
                    <input
                      type="text"
                      required
                      value={localDni}
                      onChange={(e) => setLocalDni(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                      className="form-input"
                      placeholder="Ej: 77777777"
                      maxLength={12}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Nombres *</label>
                    <input
                      type="text"
                      required
                      value={localNombres}
                      onChange={(e) => setLocalNombres(e.target.value)}
                      className="form-input"
                      placeholder="Ej: Juan Carlos"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div className="form-group">
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Apellido Paterno *</label>
                      <input
                        type="text"
                        required
                        value={localApellidoPaterno}
                        onChange={(e) => setLocalApellidoPaterno(e.target.value)}
                        className="form-input"
                        placeholder="Ej: Pérez"
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Apellido Materno</label>
                      <input
                        type="text"
                        value={localApellidoMaterno}
                        onChange={(e) => setLocalApellidoMaterno(e.target.value)}
                        className="form-input"
                        placeholder="Ej: Quispe"
                      />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Rol Interno *</label>
                    <select
                      value={localRole}
                      onChange={(e) => handleRoleChange(e.target.value)}
                      className="form-input"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-main)', fontWeight: 'bold' }}
                    >
                      {availableRoles.map((r) => (
                        <option key={r} value={r}>
                          {r === 'alumno' ? 'Alumno / Estudiante' : r === 'usuario' ? 'Alumno / Estudiante' : r.toUpperCase()}
                        </option>
                      ))}
                      <option value="add_new" style={{ color: '#38bdf8', fontWeight: 'bold' }}>➕ + Crear Nuevo Rol...</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div className="form-group">
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                        Condición / Régimen *
                      </label>
                      <select
                        value={localCondicion}
                        onChange={(e) => handleCondicionChange(e.target.value)}
                        className="form-input"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-main)' }}
                      >
                        {availableCondiciones.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        <option value="add_new" style={{ color: '#38bdf8', fontWeight: 'bold' }}>➕ + Crear Nueva Condición...</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Cargo *</label>
                      <select
                        value={localCargo}
                        onChange={(e) => handleCargoChange(e.target.value)}
                        className="form-input"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-main)' }}
                      >
                        {availableCargos.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        <option value="add_new" style={{ color: '#38bdf8', fontWeight: 'bold' }}>➕ + Crear Nuevo Cargo...</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Sede Universitaria *</label>
                    <select
                      value={localSede}
                      onChange={(e) => handleSedeChange(e.target.value)}
                      className="form-input"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-main)' }}
                    >
                      {availableSedes.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      <option value="add_new" style={{ color: '#38bdf8', fontWeight: 'bold' }}>➕ + Crear Nueva Sede...</option>
                    </select>
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="btn-cancel" onClick={() => setModalOpen(false)}>Cancelar</button>
                    <button type="submit" className="btn-submit">Guardar</button>
                  </div>
                </form>
              )}
            </>
          </div>
        </div>
      )}

      {/* --- SUB-MODAL: CREAR NUEVO ROL DINÁMICO --- */}
      {addRoleModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-box" style={{ maxWidth: '360px' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#38bdf8' }}>➕ Crear Nuevo Rol de Usuario</h4>
            <p className="modal-subtitle" style={{ marginBottom: '15px' }}>Ingrese la denominación para el nuevo rol personalizado</p>
            <form onSubmit={handleCreateNewRole}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>Nombre del Rol *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="form-input"
                  placeholder="Ej: pasante, contratado_externo"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setAddRoleModalOpen(false);
                    setNewRoleName('');
                    setLocalRole(availableRoles[0] || 'alumno');
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-submit">Crear Rol</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- SUB-MODAL: CREAR NUEVO CARGO --- */}
      {addCargoModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-box" style={{ maxWidth: '360px' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#38bdf8' }}>💼 Crear Nuevo Cargo</h4>
            <p className="modal-subtitle" style={{ marginBottom: '15px' }}>Ingrese la denominación para el nuevo cargo laboral</p>
            <form onSubmit={handleCreateNewCargo}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>Nombre del Cargo *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newCargoName}
                  onChange={(e) => setNewCargoName(e.target.value)}
                  className="form-input"
                  placeholder="Ej: JEFE_DE_PABELLON, SUPERVISOR"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setAddCargoModalOpen(false);
                    setNewCargoName('');
                    setLocalCargo(availableCargos[0] || 'ESTUDIANTE');
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-submit">Guardar Cargo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- SUB-MODAL: CREAR NUEVA CONDICIÓN --- */}
      {addCondicionModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-box" style={{ maxWidth: '360px' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#38bdf8' }}>📄 Crear Nueva Condición Laboral</h4>
            <p className="modal-subtitle" style={{ marginBottom: '15px' }}>Ingrese la denominación para el nuevo régimen de contrato</p>
            <form onSubmit={handleCreateNewCondicion}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>Nombre de la Condición *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newCondicionName}
                  onChange={(e) => setNewCondicionName(e.target.value)}
                  className="form-input"
                  placeholder="Ej: SERVIR, LOCADOR_SERVICIOS"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setAddCondicionModalOpen(false);
                    setNewCondicionName('');
                    setLocalCondicion(availableCondiciones[0] || 'SIN CONTRATO');
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-submit">Guardar Condición</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- SUB-MODAL: CREAR NUEVA SEDE --- */}
      {addSedeModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-box" style={{ maxWidth: '360px' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#38bdf8' }}>🏢 Crear Nueva Sede Universitaria</h4>
            <p className="modal-subtitle" style={{ marginBottom: '15px' }}>Ingrese la ubicación o nombre de la nueva sede</p>
            <form onSubmit={handleCreateNewSede}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}>Nombre de la Sede *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newSedeName}
                  onChange={(e) => setNewSedeName(e.target.value)}
                  className="form-input"
                  placeholder="Ej: Sede Camaná, Campus Pedregal"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setAddSedeModalOpen(false);
                    setNewSedeName('');
                    setLocalSede(availableSedes[0] || 'Sede Universitaria');
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-submit">Guardar Sede</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* --- SUB-MODAL: CONFIRMACIÓN DE DNI DUPLICADO --- */}
      {duplicateUserConfirmation && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }}>
          <div className="modal-box" style={{ maxWidth: '420px', border: '1px solid #eab308' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#eab308', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚠️ Confirmar Sobrescritura de Usuario
            </h4>
            <p className="modal-subtitle" style={{ marginBottom: '12px' }}>
              El DNI <strong>{duplicateUserConfirmation.payload.dni}</strong> ya existe en la base de datos local.
            </p>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Usuario Registrado Actualmente:</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8' }}>
                👤 {duplicateUserConfirmation.existingName}
              </div>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '16px', lineHeight: '1.4' }}>
              ¿Está seguro de que desea sobrescribir y actualizar la información de este usuario con los nuevos datos ingresados?
            </p>
            <div className="modal-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setDuplicateUserConfirmation(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-submit"
                onClick={() => executeSaveUser(duplicateUserConfirmation.payload)}
                style={{ backgroundColor: '#eab308', color: '#000', fontWeight: 'bold' }}
              >
                Confirmar y Sobrescribir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
