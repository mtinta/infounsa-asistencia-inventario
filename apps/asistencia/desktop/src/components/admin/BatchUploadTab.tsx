import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, RefreshCw, X, Download, Trash2, Edit2, Check } from 'lucide-react';
import { getStoredTokens } from '../../utils/api';
import { ToastType } from '@infounsa/shared-types';

interface BatchUploadTabProps {
  activeApiBase: string;
  showToast: (msg: string, type: ToastType) => void;
}

interface PreviewItem {
  row: number;
  dni: string;
  nombres?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  nombre_completo: string;
  estado: boolean;
  condicion: string | null;
  cargo: string | null;
  hasError: boolean;
  hasWarning: boolean;
}

interface ValidationError {
  row: number;
  col: number;
  columnName: string;
  value: string;
  severity: 'CRITICAL' | 'WARNING';
  message: string;
}

interface PreviewResponse {
  preview: PreviewItem[];
  totalRows: number;
  errors: ValidationError[];
  isValid: boolean;
}

export default function BatchUploadTab({ activeApiBase, showToast }: BatchUploadTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ total: number; insertados: number; actualizados: number } | null>(null);

  // States para la edición en caliente
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editedItem, setEditedItem] = useState<PreviewItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setPreviewData(null);
    setUploadResult(null);
    setEditingRowIndex(null);
    setEditedItem(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleDownloadTemplate = async () => {
    try {
      const { accessToken } = getStoredTokens();
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      
      const res = await fetch(`${activeApiBase}/users/template`, {
        headers,
      });

      if (!res.ok) throw new Error('Error al descargar la plantilla');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_personal.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo descargar la plantilla.';
      showToast(msg, 'error');
    }
  };

  const handlePreviewFile = useCallback(async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.xlsx')) {
      showToast('Formato no soportado. Debe seleccionar un archivo Excel (.xlsx)', 'error');
      return;
    }
    setFile(selectedFile);
    setLoading(true);
    setUploadResult(null);
    setPreviewData(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const { accessToken } = getStoredTokens();
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetch(`${activeApiBase}/users/preview-lote`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error al procesar la previsualización del lote.');
      }

      const data: PreviewResponse = await res.json();
      setPreviewData(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo leer el archivo.';
      showToast(msg, 'error');
      resetState();
    } finally {
      setLoading(false);
    }
  }, [activeApiBase, showToast, resetState]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handlePreviewFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handlePreviewFile(e.target.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Acciones en caliente para editar o eliminar registros de la previsualización antes de importar
  const handleStartEdit = (index: number, item: PreviewItem) => {
    setEditingRowIndex(index);
    setEditedItem({ ...item });
  };

  const handleSaveEdit = () => {
    if (!previewData || editingRowIndex === null || !editedItem) return;

    // Validación local rápida del DNI editado
    if (!editedItem.dni || !/^\d{8,9}$/.test(editedItem.dni)) {
      showToast('El DNI debe tener 8 o 9 dígitos numéricos.', 'error');
      return;
    }
    if (!editedItem.nombres?.trim() && !editedItem.apellido_paterno?.trim()) {
      showToast('Nombres y Apellido Paterno son requeridos.', 'error');
      return;
    }

    const surnames = `${(editedItem.apellido_paterno || '').trim()} ${(editedItem.apellido_materno || '').trim()}`.trim();
    editedItem.nombre_completo = surnames ? `${surnames}, ${(editedItem.nombres || '').trim()}`.trim() : (editedItem.nombres || '').trim();

    const updatedPreview = [...previewData.preview];
    
    // Marcar como limpio temporalmente y recalcular errores para este registro
    const updatedItem = {
      ...editedItem,
      hasError: false,
      hasWarning: false,
    };
    
    updatedPreview[editingRowIndex] = updatedItem;

    // Filtrar errores antiguos de esta fila
    let updatedErrors = previewData.errors.filter((e) => e.row !== updatedItem.row);

    // Comprobar si hay DNI duplicado localmente
    const isDniDuplicated = updatedPreview.some((p, i) => i !== editingRowIndex && p.dni === updatedItem.dni);
    if (isDniDuplicated) {
      updatedErrors.push({
        row: updatedItem.row,
        col: 1,
        columnName: 'DNI',
        value: updatedItem.dni,
        severity: 'CRITICAL',
        message: 'Este DNI está duplicado dentro del mismo archivo Excel.',
      });
      updatedItem.hasError = true;
    }

    setPreviewData({
      ...previewData,
      preview: updatedPreview,
      errors: updatedErrors,
      isValid: updatedErrors.filter((e) => e.severity === 'CRITICAL').length === 0,
    });

    setEditingRowIndex(null);
    setEditedItem(null);
    showToast('Fila actualizada localmente. Puede confirmar cuando no queden errores críticos.', 'success');
  };

  const handleOmitRow = (index: number) => {
    if (!previewData) return;

    const itemToOmit = previewData.preview[index];
    const updatedPreview = previewData.preview.filter((_, i) => i !== index);
    const updatedErrors = previewData.errors.filter((e) => e.row !== itemToOmit.row);

    setPreviewData({
      ...previewData,
      preview: updatedPreview,
      totalRows: previewData.totalRows - 1,
      errors: updatedErrors,
      isValid: updatedErrors.filter((e) => e.severity === 'CRITICAL').length === 0,
    });

    showToast('Registro omitido del lote.', 'success');
  };

  const handleUploadSubmit = async () => {
    if (!previewData) return;
    setUploading(true);

    try {
      const { accessToken } = getStoredTokens();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      // Enviar el lote limpio y corregido a la API
      const res = await fetch(`${activeApiBase}/users/import-lote`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ users: previewData.preview }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error al procesar la importación del lote.');
      }

      const data = await res.json();

      // Guardar también en la base de datos SQLite local para disponibilidad inmediata offline
      const electronAPI = window.electronAPI;
      if (electronAPI?.saveLocalUser) {
        for (const u of previewData.preview) {
          const surnames = `${(u.apellido_paterno || '').trim()} ${(u.apellido_materno || '').trim()}`.trim();
          const fullName = u.nombre_completo || (surnames ? `${surnames}, ${(u.nombres || '').trim()}`.trim() : u.nombres);
          await electronAPI.saveLocalUser({
            dni: u.dni,
            nombres: u.nombres || '',
            apellido_paterno: u.apellido_paterno || '',
            apellido_materno: u.apellido_materno || '',
            name: fullName,
            role: 'usuario',
            condicion: u.condicion,
            cargo: u.cargo,
          }).catch(() => {});
        }
        electronAPI?.notifyDatabaseChanged?.();
      }

      setUploadResult(data.stats);
      showToast(`Importación completada: ${data.stats.insertados} insertados, ${data.stats.actualizados} actualizados.`, 'success');
      
      // Notificar a otras vistas
      window.dispatchEvent(new Event('force-sync-outbox'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al importar los datos.';
      showToast(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  const criticalErrors = previewData?.errors.filter((e) => e.severity === 'CRITICAL') || [];
  const warningErrors = previewData?.errors.filter((e) => e.severity === 'WARNING') || [];

  return (
    <div className="batch-upload-tab">
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3>Carga Masiva de Personal (Lotes de Usuarios)</h3>
          <p className="panel-subtitle">Suba un archivo Excel (.xlsx) estructurado para registrar o actualizar al personal en bloque.</p>
        </div>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="sync-action-btn"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', border: 'none', backgroundColor: 'var(--accent, #14387f)', color: 'white', fontWeight: 'bold' }}
        >
          <Download size={16} />
          Descargar Plantilla Excel
        </button>
      </div>

      <div className="settings-card" style={{ padding: '24px', marginBottom: '20px' }}>
        {!file && (
          <div
            className={`drag-drop-zone ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={triggerFileSelect}
            style={{
              border: '2px dashed var(--border-color, #334155)',
              borderRadius: '8px',
              padding: '40px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              backgroundColor: isDragOver ? 'rgba(20, 56, 127, 0.05)' : 'transparent',
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx"
              style={{ display: 'none' }}
            />
            <Upload size={48} style={{ color: 'var(--accent, #14387f)', marginBottom: '16px' }} />
            <p style={{ fontWeight: 'bold', fontSize: '15px', margin: '0 0 8px 0', color: 'var(--text-main)' }}>
              Arrastre su archivo Excel (.xlsx) aquí
            </p>
            <p style={{ fontSize: '13px', margin: 0, opacity: 0.7, color: 'var(--text-muted)' }}>
              O haga clic para buscar en su equipo
            </p>
          </div>
        )}

        {file && (
          <div className="selected-file-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-input-read, #1e293b)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FileSpreadsheet size={24} style={{ color: '#16a34a' }} />
              <div>
                <p style={{ fontWeight: 'bold', margin: 0, color: 'var(--text-main)', fontSize: '14px' }}>{file.name}</p>
                <p style={{ fontSize: '12px', margin: 0, opacity: 0.7, color: 'var(--text-muted)' }}>
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            {!uploading && !loading && (
              <button
                type="button"
                onClick={resetState}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                title="Quitar archivo"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-main)' }}>
          <RefreshCw size={36} className="spin-animation" style={{ color: 'var(--accent)', marginBottom: '12px' }} />
          <p>Validando y analizando estructura de personal...</p>
        </div>
      )}

      {previewData && (
        <div className="preview-results-panel animate-fade-in">
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div className="settings-card" style={{ flex: '1', minWidth: '150px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Filas en lote</span>
              <p style={{ fontSize: '24px', fontWeight: '800', margin: '6px 0 0 0', color: 'var(--text-main)' }}>{previewData.totalRows}</p>
            </div>
            <div className="settings-card" style={{ flex: '1', minWidth: '150px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Errores Críticos</span>
              <p style={{ fontSize: '24px', fontWeight: '800', margin: '6px 0 0 0', color: criticalErrors.length > 0 ? '#ef4444' : '#16a34a' }}>
                {criticalErrors.length}
              </p>
            </div>
            <div className="settings-card" style={{ flex: '1', minWidth: '150px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Advertencias</span>
              <p style={{ fontSize: '24px', fontWeight: '800', margin: '6px 0 0 0', color: warningErrors.length > 0 ? '#eab308' : '#16a34a' }}>
                {warningErrors.length}
              </p>
            </div>
          </div>

          {criticalErrors.length > 0 && (
            <div className="info-banner" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '16px', borderRadius: '6px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <AlertTriangle size={24} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: '13.5px', textAlign: 'left' }}>
                <strong>Errores de validación críticos detectados:</strong> Debe resolver o eliminar las filas con errores críticos antes de procesar la importación.
              </p>
            </div>
          )}

          {criticalErrors.length === 0 && warningErrors.length > 0 && (
            <div className="info-banner" style={{ backgroundColor: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.2)', padding: '16px', borderRadius: '6px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <AlertTriangle size={24} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: '13.5px', textAlign: 'left' }}>
                <strong>Advertencias presentes:</strong> Hay usuarios existentes. Al confirmar se procederá a actualizar su información en base a los valores del Excel.
              </p>
            </div>
          )}

          {previewData.errors.length > 0 && (
            <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-main)' }}>Detalle de Inconsistencias (Por Fila / Columna)</h4>
              <div className="table-scroll" style={{ maxHeight: '200px', fontSize: '13px' }}>
                <table className="crud-table mini-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Columna</th>
                      <th>Gravedad</th>
                      <th>Valor Leído</th>
                      <th>Detalle del Problema</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.errors.map((err, i) => (
                      <tr key={i} style={{ backgroundColor: err.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.05)' : 'rgba(234, 179, 8, 0.05)' }}>
                        <td>{err.row}</td>
                        <td>{err.columnName} (Col {err.col})</td>
                        <td>
                          <span style={{
                            color: err.severity === 'CRITICAL' ? '#ef4444' : '#eab308',
                            fontWeight: 'bold'
                          }}>
                            {err.severity}
                          </span>
                        </td>
                        <td><code>{err.value || '(Vacío)'}</code></td>
                        <td>{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!uploadResult && (
            <div className="settings-card" style={{ padding: '20px', marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', color: 'var(--text-main)' }}>
                Editar / Resolver Registros en Caliente
              </h4>
              <div className="table-scroll" style={{ maxHeight: '350px' }}>
                <table className="crud-table mini-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>DNI</th>
                      <th>Nombres</th>
                      <th>Apellido Paterno</th>
                      <th>Apellido Materno</th>
                      <th>Estado</th>
                      <th>Condición</th>
                      <th>Cargo</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.preview.map((p, idx) => {
                      const isEditing = editingRowIndex === idx;
                      const hasCritical = previewData.errors.some((e) => e.row === p.row && e.severity === 'CRITICAL');
                      const hasWarning = previewData.errors.some((e) => e.row === p.row && e.severity === 'WARNING');

                      let rowBg = 'transparent';
                      if (hasCritical) rowBg = 'rgba(239, 68, 68, 0.08)';
                      else if (hasWarning) rowBg = 'rgba(234, 179, 8, 0.08)';

                      return (
                        <tr key={idx} style={{ backgroundColor: rowBg }}>
                          <td>{p.row}</td>
                          <td>
                            {isEditing ? (
                              <input
                                type="text"
                                className="custom-input"
                                style={{ width: '90px', padding: '4px' }}
                                value={editedItem?.dni || ''}
                                onChange={(e) => setEditedItem({ ...editedItem!, dni: e.target.value })}
                              />
                            ) : (
                              <code>{p.dni}</code>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="text"
                                className="custom-input"
                                style={{ width: '130px', padding: '4px' }}
                                value={editedItem?.nombres || ''}
                                onChange={(e) => setEditedItem({ ...editedItem!, nombres: e.target.value })}
                              />
                            ) : (
                              p.nombres || '-'
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="text"
                                className="custom-input"
                                style={{ width: '120px', padding: '4px' }}
                                value={editedItem?.apellido_paterno || ''}
                                onChange={(e) => setEditedItem({ ...editedItem!, apellido_paterno: e.target.value })}
                              />
                            ) : (
                              p.apellido_paterno || '-'
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="text"
                                className="custom-input"
                                style={{ width: '120px', padding: '4px' }}
                                value={editedItem?.apellido_materno || ''}
                                onChange={(e) => setEditedItem({ ...editedItem!, apellido_materno: e.target.value })}
                              />
                            ) : (
                              p.apellido_materno || '-'
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <select
                                className="custom-input"
                                style={{ padding: '4px' }}
                                value={editedItem?.estado ? 'ACTIVO' : 'INACTIVO'}
                                onChange={(e) => setEditedItem({ ...editedItem!, estado: e.target.value === 'ACTIVO' })}
                              >
                                <option value="ACTIVO">ACTIVO</option>
                                <option value="INACTIVO">INACTIVO</option>
                              </select>
                            ) : (
                              <span className={`badge ${p.estado ? 'badge-success' : 'badge-danger'}`}>
                                {p.estado ? 'ACTIVO' : 'INACTIVO'}
                              </span>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="text"
                                className="custom-input"
                                style={{ width: '120px', padding: '4px' }}
                                value={editedItem?.condicion || ''}
                                onChange={(e) => setEditedItem({ ...editedItem!, condicion: e.target.value || null })}
                              />
                            ) : (
                              p.condicion || '-'
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="text"
                                className="custom-input"
                                style={{ width: '120px', padding: '4px' }}
                                value={editedItem?.cargo || ''}
                                onChange={(e) => setEditedItem({ ...editedItem!, cargo: e.target.value || null })}
                              />
                            ) : (
                              p.cargo || '-'
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={handleSaveEdit}
                                    style={{ background: '#16a34a', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                    title="Guardar"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setEditingRowIndex(null); setEditedItem(null); }}
                                    style={{ background: '#64748b', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                    title="Cancelar"
                                  >
                                    <X size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(idx, p)}
                                    style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                    title="Editar fila"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOmitRow(idx)}
                                    style={{ background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                    title="Omitir esta fila"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!uploadResult && (
            <div className="action-buttons-panel" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={resetState}
                disabled={uploading}
                style={{ padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--border-color)', fontWeight: 'bold' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="sync-action-btn"
                onClick={handleUploadSubmit}
                disabled={uploading || criticalErrors.length > 0}
                style={{
                  padding: '10px 24px',
                  borderRadius: '6px',
                  cursor: (uploading || criticalErrors.length > 0) ? 'not-allowed' : 'pointer',
                  opacity: (uploading || criticalErrors.length > 0) ? 0.6 : 1,
                  backgroundColor: 'var(--accent, #14387f)',
                  color: 'white',
                  fontWeight: 'bold',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {uploading ? (
                  <>
                    <RefreshCw size={16} className="spin-animation" />
                    Procesando...
                  </>
                ) : (
                  'Confirmar e Importar Personal'
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {uploadResult && (
        <div className="upload-success-panel settings-card animate-fade-in" style={{ padding: '30px', textAlign: 'center', maxWidth: '500px', margin: '40px auto 0 auto' }}>
          <CheckCircle size={64} style={{ color: '#16a34a', marginBottom: '20px' }} />
          <h4 style={{ color: 'var(--text-main)', fontSize: '20px', margin: '0 0 10px 0' }}>¡Carga procesada con éxito!</h4>
          <p style={{ fontSize: '14.5px', color: 'var(--text-muted)', margin: '0 0 24px 0' }}>
            Los usuarios han sido insertados y actualizados correctamente en la base de datos de InfoUNSA.
          </p>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '30px' }}>
            <div style={{ padding: '12px 24px', background: 'var(--bg-input-read, #1e293b)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '12px', opacity: 0.7, color: 'var(--text-muted)' }}>Insertados</span>
              <p style={{ fontSize: '22px', fontWeight: 'bold', margin: '4px 0 0 0', color: '#16a34a' }}>{uploadResult.insertados}</p>
            </div>
            <div style={{ padding: '12px 24px', background: 'var(--bg-input-read, #1e293b)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '12px', opacity: 0.7, color: 'var(--text-muted)' }}>Actualizados</span>
              <p style={{ fontSize: '22px', fontWeight: 'bold', margin: '4px 0 0 0', color: '#eab308' }}>{uploadResult.actualizados}</p>
            </div>
          </div>

          <button
            type="button"
            className="sync-action-btn"
            onClick={resetState}
            style={{ margin: '0 auto', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'var(--accent, #14387f)', color: 'white', border: 'none', fontWeight: 'bold' }}
          >
            Subir otro archivo
          </button>
        </div>
      )}
    </div>
  );
}
