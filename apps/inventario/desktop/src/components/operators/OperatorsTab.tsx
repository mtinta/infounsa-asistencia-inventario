import React, { useState, useEffect } from 'react';
import { UserPlus as UserPlusIcon } from 'lucide-react';
import { ToastType } from '@infounsa/shared-types';
import { apiFetch } from '../../utils/api';

export interface InventoryUser {
  id: string | number;
  full_name: string;
  username: string;
  email: string;
  role: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

interface OperatorsTabProps {
  showToast: (msg: string, type: ToastType) => void;
  userRole: string | null;
}

export default function OperatorsTab({ showToast, userRole }: OperatorsTabProps) {
  const [apiUsers, setApiUsers] = useState<InventoryUser[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryUser | null>(null);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operador');
  const [status, setStatus] = useState('activo');

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

  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFullName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setRole('operador');
    setStatus('activo');
    setModalOpen(true);
  };

  const handleOpenEditModal = (user: InventoryUser) => {
    setEditingItem(user);
    setFullName(user.full_name);
    setUsername(user.username);
    setEmail(user.email);
    setPassword('');
    setRole(user.role);
    setStatus(user.status);
    setModalOpen(true);
  };

  const handleSaveApiUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !username || !email || (!editingItem && !password)) {
      showToast('Por favor, complete todos los campos obligatorios.', 'error');
      return;
    }
    try {
      const payload = {
        full_name: fullName,
        username,
        email,
        password: password || undefined,
        role,
        status,
      };

      let res;
      if (editingItem) {
        res = await apiFetch(`/users/${editingItem.id}`, {
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
      showToast(err instanceof Error ? err.message : 'Error de red al guardar usuario', 'error');
    }
  };

  const handleToggleStatus = async (user: InventoryUser) => {
    const nextStatus = user.status === 'activo' ? 'inactivo' : 'activo';
    try {
      const res = await apiFetch(`/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        showToast(`Usuario ${nextStatus === 'activo' ? 'activado' : 'desactivado'}`, 'success');
        fetchApiUsers();
      } else {
        showToast('No se pudo cambiar el estado del usuario', 'error');
      }
    } catch (err) {
      showToast('Error de conexión', 'error');
    }
  };

  const handleDeleteUser = async (id: number | string) => {
    if (!confirm('¿Está seguro de que desea eliminar permanentemente a este usuario?')) return;
    try {
      const res = await apiFetch(`/users/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('Usuario eliminado', 'success');
        fetchApiUsers();
      } else {
        showToast('No se pudo eliminar el usuario', 'error');
      }
    } catch (err) {
      showToast('Error de conexión', 'error');
    }
  };

  return (
    <div className="operators-tab-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Gestión de Usuarios y Operadores</h3>
          <p className="kiosk-hint">Administración de cuentas con acceso a la plataforma de Inventario</p>
        </div>
        <button className="scan-btn" onClick={handleOpenCreateModal} style={{ backgroundColor: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <UserPlusIcon size={16} /> Registrar Operador
        </button>
      </div>

      <div className="settings-card" style={{ padding: '20px' }}>
        <h4 style={{ marginBottom: '15px', borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px' }}>
          Cuentas Registradas ({apiUsers.length})
        </h4>
        <div className="table-scroll">
          <table className="crud-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre Completo</th>
                <th>Usuario</th>
                <th>Correo Electrónico</th>
                <th>Rol</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {apiUsers.map((user) => (
                <tr key={user.id}>
                  <td><code>{user.id}</code></td>
                  <td><strong>{user.full_name}</strong></td>
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className="badge" style={{ backgroundColor: user.role === 'administrador' ? 'rgba(96,165,250,0.15)' : 'rgba(148,163,184,0.15)', color: user.role === 'administrador' ? '#60a5fa' : '#94a3b8', textTransform: 'capitalize' }}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleToggleStatus(user)}
                      className={`badge ${user.status === 'activo' ? 'badge-success' : 'badge-danger'}`}
                      style={{ border: 'none', cursor: 'pointer', textTransform: 'capitalize', padding: '2px 8px', backgroundColor: user.status === 'inactivo' ? '#ef4444' : undefined }}
                    >
                      {user.status}
                    </button>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="text-link-btn" onClick={() => handleOpenEditModal(user)} style={{ marginRight: '10px' }}>
                      Editar
                    </button>
                    <button className="text-link-btn" onClick={() => handleDeleteUser(Number(user.id))} style={{ color: '#ef4444' }}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {apiUsers.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                    No hay operadores registrados en el servidor central.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="settings-card" style={{ width: '450px', padding: '25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px' }}>
              {editingItem ? 'Editar Operador' : 'Registrar Nuevo Operador'}
            </h3>
            <form onSubmit={handleSaveApiUser} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Nombre Completo *</label>
                <input type="text" className="form-input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. Juan Pérez" required />
              </div>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Nombre de Usuario *</label>
                <input type="text" className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ej. jperez" required />
              </div>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Correo Electrónico *</label>
                <input type="email" className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ej. jperez@infounsa.local" required />
              </div>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  Contraseña {editingItem ? '(dejar en blanco para no cambiar)' : '*'}
                </label>
                <input type="password" className="form-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña de acceso" required={!editingItem} />
              </div>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Rol en el Sistema</label>
                <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: '8px' }}>
                  <option value="operador">Operador (Almacenero)</option>
                  <option value="administrador">Administrador General</option>
                </select>
              </div>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Estado</label>
                <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '8px' }}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button type="submit" className="sync-action-btn" style={{ flex: '1', justifyContent: 'center' }}>
                  Guardar
                </button>
                <button type="button" className="sync-action-btn secondary" onClick={() => setModalOpen(false)} style={{ flex: '1', justifyContent: 'center' }}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
