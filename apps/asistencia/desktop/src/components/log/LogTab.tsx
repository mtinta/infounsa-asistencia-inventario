import React, { useState } from 'react';
import { AttendanceRecord, User } from '../../types';
import SkeletonRow from '../ui/SkeletonRow';
import Tooltip from '../ui/Tooltip';
import { Check, X, Edit3, Trash2, Inbox, FileText, History } from 'lucide-react';
import { ToastType, AttendanceMarkRecord, AttendanceManualMarkPayload } from '@infounsa/shared-types';

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

function getRecordCategory(record: AttendanceRecord, users: User[]) {
  if (record.es_menor_manual || record.dni === '00000000') {
    return { className: 'badge-menor-manual', label: 'MENOR' };
  }

  if (record.visitante_nombre || record.visitante_motivo) {
    return { className: 'badge-visitante', label: 'VISITANTE' };
  }

  const matchedUser = users.find((user) => user.dni === record.dni);
  switch (matchedUser?.role) {
    case 'administrador':
      return { className: 'badge-administrador', label: 'ADMIN' };
    case 'operador':
      return { className: 'badge-operador', label: 'OPERADOR' };
    case 'usuario':
      return { className: 'badge-usuario', label: 'USUARIO' };
    default:
      return { className: 'badge-visitante', label: 'SIN PADRON' };
  }
}

interface LogTabProps {
  filterDni: string;
  setFilterDni: (v: string) => void;
  filterDate: string;
  setFilterDate: (v: string) => void;
  isLoading: boolean;
  records: AttendanceRecord[];
  filteredRecords: AttendanceRecord[];
  users: User[];
  userRole: string;
  isOnline: boolean;
  deviceConfig: { api_base_url: string; terminal_id: string; sede_id: string };
  onUpdateMark: (localId: string, fields: Partial<AttendanceMarkRecord>) => Promise<void>;
  onDeleteMark: (localId: string) => Promise<void>;
  onCreateManualMark: (payload: AttendanceManualMarkPayload) => Promise<void>;
  showToast: (msg: string, type: ToastType) => void;
}

export default function LogTab({
  filterDni,
  setFilterDni,
  filterDate,
  setFilterDate,
  isLoading,
  records,
  filteredRecords,
  users,
  userRole,
  onUpdateMark,
  onDeleteMark,
  onCreateManualMark,
  showToast,
}: LogTabProps) {
  const isAdmin = userRole === 'administrador';

  // Modal states
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editTime, setEditTime] = useState('');
  const [editType, setEditType] = useState<'entrada' | 'salida'>('entrada');
  const [editObs, setEditObs] = useState('');
  const [auditDetailRecord, setAuditDetailRecord] = useState<AttendanceRecord | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [createDni, setCreateDni] = useState('');
  const [createName, setCreateName] = useState('');
  const [createTime, setCreateTime] = useState('');
  const [createType, setCreateType] = useState<'entrada' | 'salida'>('entrada');
  const [createObs, setCreateObs] = useState('');

  // Auto-fill name when DNI is entered in create form
  const handleCreateDniChange = (val: string) => {
    const numericVal = val.replace(/[^0-9]/g, '').substring(0, 8);
    setCreateDni(numericVal);
    if (numericVal.length === 8) {
      const matched = users.find((u) => u.dni === numericVal);
      if (matched) {
        setCreateName(matched.name);
      } else {
        setCreateName('');
      }
    } else {
      setCreateName('');
    }
  };

  const handleEditClick = (record: AttendanceRecord) => {
    setEditingRecord(record);
    // Convert ISO/sqlite string date to datetime-local format (YYYY-MM-DDTHH:MM)
    const d = new Date(record.registered_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    const localDateTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setEditTime(localDateTime);
    setEditType(record.type as 'entrada' | 'salida');
    setEditObs(record.observacion || '');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    try {
      await onUpdateMark(editingRecord.id_local, {
        fecha_hora: new Date(editTime).toISOString(),
        tipo_marca: editType,
        observacion: editObs,
        estado_auditoria: 'editado'
      });
      setEditingRecord(null);
    } catch (err) {
      // Toast handled by hook
    }
  };

  const handleDeleteClick = async (record: AttendanceRecord) => {
    if (!confirm(`¿Está seguro de eliminar la marcación de ${record.name}?`)) return;
    try {
      await onDeleteMark(record.id_local);
    } catch (err) {
      // Toast handled by hook
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createDni.length !== 8) {
      showToast('El DNI debe tener exactamente 8 dígitos.', 'error');
      return;
    }
    if (!createName.trim()) {
      showToast('Por favor ingrese el nombre del colaborador.', 'error');
      return;
    }
    if (!createTime) {
      showToast('Seleccione la fecha y hora del registro.', 'error');
      return;
    }

    try {
      const matched = users.find((u) => u.dni === createDni);
      await onCreateManualMark({
        dni: createDni,
        name: createName.trim(),
        usuario_id: matched?.dni || null,
        type: createType,
        registered_at: new Date(createTime).toISOString(),
        observacion: createObs.trim() || 'Ingreso manual por administrador',
      });
      setIsCreating(false);
      setCreateDni('');
      setCreateName('');
      setCreateTime('');
      setCreateObs('');
    } catch (err) {
      // Toast handled by hook
    }
  };

  const getAuditStateBadge = (state?: string) => {
    switch (state) {
      case 'borrado':
        return (
          <Tooltip content="Marcación anulada administrativamente. Permanece en el sistema exclusivamente por auditoría." position="top">
            <span
              className="badge"
              style={{ backgroundColor: '#ef4444', color: 'white', cursor: 'default' }}
            >
              BORRADO
            </span>
          </Tooltip>
        );
      case 'editado':
        return (
          <Tooltip content="La hora, tipo o justificación fue modificada administrativamente." position="top">
            <span
              className="badge"
              style={{ backgroundColor: '#f59e0b', color: 'white', cursor: 'default' }}
            >
              EDITADO
            </span>
          </Tooltip>
        );
      case 'nuevo':
        return (
          <Tooltip content="Registro creado manualmente por un administrador u operador." position="top">
            <span
              className="badge"
              style={{ backgroundColor: '#0284c7', color: 'white', cursor: 'default' }}
            >
              NUEVO
            </span>
          </Tooltip>
        );
      default:
        return (
          <Tooltip content="Marcación capturada de forma automática y fidedigna desde el kiosco." position="top">
            <span
              className="badge"
              style={{ backgroundColor: '#10b981', color: 'white', cursor: 'default' }}
            >
              NORMAL
            </span>
          </Tooltip>
        );
    }
  };

  return (
    <div className="log-tab">
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <h3>Marcaciones del Día</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {isAdmin && (
            <Tooltip content="Permite ingresar una marcación justificada para personal cuyo carnet o DNI presentó fallas." position="bottom">
              <button
                onClick={() => {
                  setIsCreating(true);
                  const d = new Date();
                  const pad = (n: number) => String(n).padStart(2, '0');
                  setCreateTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                }}
                style={{
                  backgroundColor: 'var(--accent, #14387f)',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                ➕ Crear Registro Manual
              </button>
            </Tooltip>
          )}
          <div className="filter-row log-filter-row" style={{ margin: 0 }}>
            <Tooltip content="Filtrar por número de DNI o apellidos del colaborador" position="top">
              <input
                type="text"
                placeholder="Filtrar por DNI o nombre…"
                className="filter-input"
                value={filterDni}
                onChange={(e) => setFilterDni(e.target.value)}
                aria-label="Filtrar por DNI o nombre"
              />
            </Tooltip>
            <Tooltip content="Filtrar marcaciones por fecha de registro" position="top">
              <input
                type="date"
                className="filter-input"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                aria-label="Filtrar por fecha"
              />
            </Tooltip>
          </div>
        </div>
      </div>

      {isLoading ? <SkeletonRow /> : filteredRecords.length === 0 ? (
        <div className="info-banner" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Inbox size={18} color="#64748b" />
          {records.length === 0 ? 'No se registran marcas en la sesión actual.' : 'Sin resultados para el filtro.'}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="crud-table">
            <thead>
              <tr>
                <th scope="col">Hora</th>
                <th scope="col">DNI</th>
                <th scope="col">Persona</th>
                <th scope="col">Tipo</th>
                <th scope="col">Estado Sync</th>
                <th scope="col">Estado Auditoría</th>
                {isAdmin && <th scope="col">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => {
                const syncBadge = getSyncBadge(record.sync_status);
                const categoryBadge = getRecordCategory(record, users);
                const isBorrado = record.estado_auditoria === 'borrado';

                return (
                  <tr key={record.id_local} style={{ opacity: isBorrado ? 0.5 : 1, textDecoration: isBorrado ? 'line-through' : 'none' }}>
                    <td className="cell-time">{new Date(record.registered_at).toLocaleTimeString('es-PE')}</td>
                    <td className="cell-code"><code>{record.dni}</code></td>
                    <td>
                      <div className="person-cell">
                        <strong>{record.name}</strong>
                        <span className={`badge ${categoryBadge.className}`}>{categoryBadge.label}</span>
                      </div>
                      {record.observacion && (
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FileText size={12} color="#64748b" />
                          <span>{record.observacion}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${record.type === 'entrada' ? 'badge-in' : 'badge-out'}`}>
                        {record.type.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${syncBadge.className}`}>{syncBadge.label}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {getAuditStateBadge(record.estado_auditoria)}
                        <Tooltip content="Ver línea de tiempo y trazabilidad forense de modificaciones de este registro." position="left">
                          <button
                            onClick={() => setAuditDetailRecord(record)}
                            style={{
                              padding: '4px 6px',
                              backgroundColor: '#1e293b',
                              color: '#94a3b8',
                              border: '1px solid #334155',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            title="Ver historial y detalle de auditoría"
                          >
                            <History size={13} />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <Tooltip content="Modificar la hora, tipo o justificación de esta marcación." position="top">
                            <button
                              onClick={() => handleEditClick(record)}
                              disabled={isBorrado}
                              style={{
                                padding: '6px',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isBorrado ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Editar marcación"
                            >
                              <Edit3 size={14} />
                            </button>
                          </Tooltip>
                          <Tooltip content="Anular esta marcación del cómputo diario (requiere confirmación)." position="top">
                            <button
                              onClick={() => handleDeleteClick(record)}
                              disabled={isBorrado}
                              style={{
                                padding: '6px',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isBorrado ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Borrar marcación"
                            >
                              <Trash2 size={14} />
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Create Modal */}
      {isCreating && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="settings-card" style={{ width: '450px', padding: '25px', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', backgroundColor: 'var(--bg-card, #1e293b)' }}>
            <h4 style={{ marginBottom: '15px', color: 'var(--text-main)' }}>Crear Registro de Asistencia Manual</h4>
            <form onSubmit={handleCreateSubmit}>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>DNI del Colaborador</label>
                <input
                  type="text"
                  className="form-input"
                  value={createDni}
                  onChange={(e) => handleCreateDniChange(e.target.value)}
                  placeholder="Ingrese DNI (8 dígitos)..."
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Apellidos y Nombres</label>
                <input
                  type="text"
                  className="form-input"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Se autocompleta con DNI o digite..."
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Tipo de Marca</label>
                <select
                  className="form-input"
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value as 'entrada' | 'salida')}
                >
                  <option value="entrada">ENTRADA</option>
                  <option value="salida">SALIDA</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Fecha y Hora</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={createTime}
                  onChange={(e) => setCreateTime(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label>Observación / Nota</label>
                <textarea
                  className="form-input"
                  style={{ height: '70px', resize: 'none' }}
                  value={createObs}
                  onChange={(e) => setCreateObs(e.target.value)}
                  placeholder="Ej. Justificación de retraso..."
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setIsCreating(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--accent, #14387f)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
                  Crear Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingRecord && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="settings-card" style={{ width: '450px', padding: '25px', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', backgroundColor: 'var(--bg-card, #1e293b)' }}>
            <h4 style={{ marginBottom: '10px', color: 'var(--text-main)' }}>Editar Registro de Asistencia</h4>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '15px' }}>
              Modificando marca de: <strong>{editingRecord.name}</strong> (DNI: {editingRecord.dni})
            </p>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Tipo de Marca</label>
                <select
                  className="form-input"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as 'entrada' | 'salida')}
                >
                  <option value="entrada">ENTRADA</option>
                  <option value="salida">SALIDA</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Fecha y Hora</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label>Observación / Nota</label>
                <textarea
                  className="form-input"
                  style={{ height: '70px', resize: 'none' }}
                  value={editObs}
                  onChange={(e) => setEditObs(e.target.value)}
                  placeholder="Justificación de la edición..."
                />
              </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
            <Tooltip content="Anular esta marcación del cómputo diario y archivarla solo para auditoría." position="top">
              <button
                type="button"
                onClick={async () => {
                  if (confirm('¿Está seguro de anular este registro de asistencia? Se ocultará de la lista del día y figurará solo en auditoría.')) {
                    try {
                      await onDeleteMark(editingRecord.id_local);
                      setEditingRecord(null);
                    } catch {}
                  }
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
                title="Anular Registro"
              >
                Anular Registro
              </button>
            </Tooltip>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: '500',
                  fontSize: '0.85rem'
                }}
                title="Descartar cambios"
              >
                <X size={16} />
                <span>Cancelar</span>
              </button>
              <button
                type="submit"
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#10b981',
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.85rem'
                }}
                title="Guardar Cambios"
              >
                <Check size={16} />
                <span>Guardar Cambios</span>
              </button>
            </div>
          </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial y Detalle de Auditoría */}
      {auditDetailRecord && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div className="modal-card" style={{ maxWidth: '560px', width: '100%', padding: '24px', backgroundColor: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#f8fafc', fontSize: '1.15rem' }}>
                <History size={20} color="#3b82f6" />
                Historial y Detalle de Auditoría
              </h4>
              <button
                onClick={() => setAuditDetailRecord(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.9rem' }}>
              {/* Información General del Registro */}
              <div style={{ padding: '14px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 'bold' }}>DNI / DOCUMENTO</span>
                  <span style={{ fontWeight: 'bold', color: '#f8fafc' }}>{auditDetailRecord.dni}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 'bold' }}>COLABORADOR / PERSONA</span>
                  <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>{auditDetailRecord.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 'bold' }}>TIPO DE MARCACIÓN</span>
                  <span className={`badge ${auditDetailRecord.type === 'entrada' ? 'badge-in' : 'badge-out'}`}>
                    {auditDetailRecord.type.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 'bold' }}>HORA DE REGISTRO ORIGINAL</span>
                  <span style={{ color: '#f8fafc', fontWeight: 'bold' }}>{new Date(auditDetailRecord.registered_at).toLocaleString('es-PE')}</span>
                </div>
              </div>

              {/* Historial de Cambios / Trazabilidad */}
              <div style={{ padding: '14px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 'bold', display: 'block', marginBottom: '12px' }}>
                  HISTORIAL DE CAMBIOS Y TRAZABILIDAD
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '8px', borderLeft: '2px solid #1e293b' }}>
                  {/* Evento 1: Creación */}
                  <div style={{ position: 'relative', paddingLeft: '12px' }}>
                    <div style={{ position: 'absolute', left: '-15px', top: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6' }} />
                    <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#f8fafc' }}>
                      1. Registro Inicial Capturado
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                      {auditDetailRecord.estado_auditoria === 'nuevo'
                        ? 'Creado manualmente por Operador/Administrador en el sistema.'
                        : 'Capturado automáticamente desde el Kiosco de Asistencia.'}
                    </div>
                  </div>

                  {/* Evento 2: Edición (si aplica) */}
                  {auditDetailRecord.estado_auditoria === 'editado' && (
                    <div style={{ position: 'relative', paddingLeft: '12px', marginTop: '6px' }}>
                      <div style={{ position: 'absolute', left: '-15px', top: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                      <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        2. Modificación de Observación / Datos
                        {getAuditStateBadge('editado')}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#e2e8f0', marginTop: '4px', padding: '8px', backgroundColor: '#1e293b', borderRadius: '6px' }}>
                        <strong>Observación Actualizada:</strong> "{auditDetailRecord.observacion || 'Sin notas'}"
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                        Responsable: Administrador QA Asistencia
                      </div>
                    </div>
                  )}

                  {/* Evento 3: Anulación (si aplica) */}
                  {auditDetailRecord.estado_auditoria === 'borrado' && (
                    <div style={{ position: 'relative', paddingLeft: '12px', marginTop: '6px' }}>
                      <div style={{ position: 'absolute', left: '-15px', top: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                      <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        2. Marcación Anulada
                        {getAuditStateBadge('borrado')}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                        La marcación fue desactivada por un administrador.
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b', paddingTop: '10px', marginTop: '10px', borderTop: '1px solid #1e293b' }}>
                  <span>ESTADO AUDITORÍA ACTUAL: {(auditDetailRecord.estado_auditoria || 'normal').toUpperCase()}</span>
                  <span>ESTADO SYNC: {auditDetailRecord.sync_status?.toUpperCase()}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAuditDetailRecord(null)}
                style={{
                  padding: '8px 20px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.9rem'
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
