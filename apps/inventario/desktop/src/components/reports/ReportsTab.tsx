import React from 'react';
import { ToastType } from '@infounsa/shared-types';
import { ReportHistoryItem, InventoryItem, InventoryMovement } from '../../types';
import Tooltip from '../ui/Tooltip';

interface ReportsTabProps {
  reportType: string;
  setReportType: (v: string) => void;
  reportStart: string;
  setReportStart: (v: string) => void;
  reportEnd: string;
  setReportEnd: (v: string) => void;
  reportFormat: 'resumido' | 'detallado';
  setReportFormat: (v: 'resumido' | 'detallado') => void;
  reportDept: string;
  setReportDept: (v: string) => void;
  reportCategory: string;
  setReportCategory: (v: string) => void;
  handleGenerateReportLocal: (e: React.FormEvent) => Promise<void> | void;
  handleExportExcel: () => void;
  handleViewReport: (report: ReportHistoryItem) => void;
  handleDownloadReport: (report: ReportHistoryItem) => void;
  reportHistory: ReportHistoryItem[];
  showToast: (msg: string, type: ToastType) => void;
  movements: InventoryMovement[];
  items?: InventoryItem[];
}

export default function ReportsTab({
  reportType,
  setReportType,
  reportStart,
  setReportStart,
  reportEnd,
  setReportEnd,
  reportFormat,
  setReportFormat,
  reportDept: _reportDept,
  setReportDept: _setReportDept,
  reportCategory: _reportCategory,
  setReportCategory: _setReportCategory,
  handleGenerateReportLocal,
  handleExportExcel,
  handleViewReport,
  handleDownloadReport: _handleDownloadReport,
  reportHistory,
  movements,
  items = [],
}: ReportsTabProps) {
  // Filter movements by selected date range
  const filteredMovements = movements.filter((m) => {
    if (!m.registered_at) return false;
    try {
      const dateObj = new Date(m.registered_at);
      if (isNaN(dateObj.getTime())) return false;
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      return dateStr >= reportStart && dateStr <= reportEnd;
    } catch {
      return false;
    }
  });

  const hasMovements = filteredMovements.length > 0;
  const activeItems = items.filter(i => i.status === 'Activo' || !i.status);

  // Compute summary for "resumido" preview
  const summaryMap: Record<string, { type: string; total_count: number; total_quantity: number }> = {};
  for (const m of filteredMovements) {
    const typeKey = m.type || 'entrada';
    if (!summaryMap[typeKey]) {
      summaryMap[typeKey] = { type: typeKey, total_count: 0, total_quantity: 0 };
    }
    summaryMap[typeKey].total_count += 1;
    summaryMap[typeKey].total_quantity += Number(m.quantity || 0);
  }
  const summaryList = Object.values(summaryMap);

  return (
    <div className="reports-tab-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="panel-header">
        <h3>Reportes y Análisis Avanzados</h3>
      </div>

      <div className="reports-bento-grid">
        <div className="settings-card report-form-card" style={{ flex: '2' }}>
          <h4 style={{ borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px', marginBottom: '15px' }}>Configuración de Reporte</h4>
          <form onSubmit={handleGenerateReportLocal} className="report-form-layout" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Tipo de Reporte</label>
              <div className="report-radio-group" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <Tooltip content="Genera el formato oficial de saldos y salidas con columnas: Cantidad inicial, Egresos y Stock final." position="top">
                  <label className="report-radio-option" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="radio" name="inv_report_type" checked={reportType === 'almacen'} onChange={() => setReportType('almacen')} />
                    <span>Reporte de Almacén (Cantidad, Salida y Stock - A4 Vertical)</span>
                  </label>
                </Tooltip>
                <Tooltip content="Genera el informe cronológico y resumen estadístico de movimientos de entrada y salida." position="top">
                  <label className="report-radio-option" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="radio" name="inv_report_type" checked={reportType === 'inventario'} onChange={() => setReportType('inventario')} />
                    <span>Movimientos de Inventario (A4 Horizontal)</span>
                  </label>
                </Tooltip>
                <Tooltip content="Genera el padrón completo de bienes con recuadros de firma para entrega y recepción conforme." position="top">
                  <label className="report-radio-option" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="radio" name="inv_report_type" checked={reportType === 'cargo'} onChange={() => setReportType('cargo')} />
                    <span>Estado Total / Cargo de Inventario (A4 Vertical)</span>
                  </label>
                </Tooltip>
              </div>
            </div>

            {reportType === 'almacen' && (
              <>
                <div className="report-fields-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label style={{ fontWeight: 'bold' }}>Fecha Inicial (Cantidad)</label>
                    <input type="date" className="form-input" value={reportStart} onChange={(e) => setReportStart(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontWeight: 'bold' }}>Fecha Final (Stock)</label>
                    <input type="date" className="form-input" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} />
                  </div>
                </div>

                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0' }}>
                  📄 <strong>REPORTE DE ALMACEN-INFOUNSA:</strong> Genera reporte oficial en A4 vertical con columnas: Producto, Medida, Cantidad al [{reportStart}], Salidas en el período y Stock al [{reportEnd}].
                </p>

                <div className="report-actions" style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                  <Tooltip content="Generar documento oficial en formato PDF para impresión y archivo." position="top" style={{ flex: '1' }}>
                    <button type="submit" className="sync-action-btn" style={{ width: '100%', justifyContent: 'center' }}>
                      Generar PDF Almacén (A4 Vertical)
                    </button>
                  </Tooltip>
                  <Tooltip content="Exportar los datos consolidados en formato de hoja de cálculo Excel (.xlsx)." position="top" style={{ flex: '1' }}>
                    <button type="button" className="sync-action-btn secondary" onClick={handleExportExcel} style={{ width: '100%', justifyContent: 'center' }}>
                      Exportar Excel (.xlsx)
                    </button>
                  </Tooltip>
                </div>
              </>
            )}

            {reportType === 'inventario' && (
              <>
                <div className="report-fields-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label style={{ fontWeight: 'bold' }}>Fecha Inicio</label>
                    <input type="date" className="form-input" value={reportStart} onChange={(e) => setReportStart(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label style={{ fontWeight: 'bold' }}>Fecha Fin</label>
                    <input type="date" className="form-input" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} />
                  </div>
                </div>

                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Formato de PDF</label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setReportFormat('resumido')}
                      className="sync-action-btn"
                      style={{
                        flex: '1',
                        justifyContent: 'center',
                        backgroundColor: reportFormat === 'resumido' ? 'var(--accent, #14387f)' : 'var(--bg-card, #1e293b)',
                        color: reportFormat === 'resumido' ? 'white' : 'var(--text-main, #94a3b8)',
                        border: reportFormat === 'resumido' ? '1px solid var(--accent)' : '1px solid var(--border-color, #334155)',
                        fontWeight: 'bold',
                        padding: '10px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      📊 Resumido (Totales por Tipo)
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportFormat('detallado')}
                      className="sync-action-btn"
                      style={{
                        flex: '1',
                        justifyContent: 'center',
                        backgroundColor: reportFormat === 'detallado' ? 'var(--accent, #14387f)' : 'var(--bg-card, #1e293b)',
                        color: reportFormat === 'detallado' ? 'white' : 'var(--text-main, #94a3b8)',
                        border: reportFormat === 'detallado' ? '1px solid var(--accent)' : '1px solid var(--border-color, #334155)',
                        fontWeight: 'bold',
                        padding: '10px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      📋 Detallado (Por Semanas)
                    </button>
                  </div>
                </div>

                <div className="report-actions" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <Tooltip content="Generar reporte de movimientos en formato PDF." position="top" style={{ flex: '1' }}>
                    <button type="submit" className="sync-action-btn" disabled={!hasMovements} style={{ width: '100%', justifyContent: 'center', opacity: !hasMovements ? 0.6 : 1 }}>
                      Generar PDF ({reportFormat === 'resumido' ? 'Resumido' : 'Detallado'})
                    </button>
                  </Tooltip>
                  <Tooltip content="Exportar movimientos en formato de hoja de cálculo Excel." position="top" style={{ flex: '1' }}>
                    <button type="button" className="sync-action-btn secondary" onClick={handleExportExcel} style={{ width: '100%', justifyContent: 'center' }}>
                      Exportar Excel
                    </button>
                  </Tooltip>
                </div>
              </>
            )}

            {reportType === 'cargo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                  📄 Este reporte lista la totalidad de bienes activos en catálogo con sus medidas, cantidades en stock y observaciones, optimizado para impresión en hoja <strong>A4 Vertical</strong> con casilleros de entrega y recepción conforme.
                </p>
                <div className="report-actions" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <Tooltip content="Generar documento oficial de cargo en formato PDF." position="top" style={{ flex: '1' }}>
                    <button type="submit" className="sync-action-btn" style={{ width: '100%', justifyContent: 'center' }}>
                      Generar PDF Cargo (A4 Vertical)
                    </button>
                  </Tooltip>
                  <Tooltip content="Exportar el inventario para cargo en formato Excel." position="top" style={{ flex: '1' }}>
                    <button type="button" className="sync-action-btn secondary" onClick={handleExportExcel} style={{ width: '100%', justifyContent: 'center' }}>
                      Descargar Excel Cargo
                    </button>
                  </Tooltip>
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="report-stats-column" style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div className="settings-card" style={{ backgroundColor: 'var(--accent, #14387f)', color: '#fff', padding: '20px' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8 }}>
              {reportType === 'almacen' ? 'Bienes en Almacén' : (reportType === 'cargo' ? 'Total Bienes Activos' : 'Movimientos en el Rango')}
            </span>
            <h2 style={{ fontSize: '36px', margin: '4px 0 0 0', fontWeight: 'bold' }}>
              {reportType === 'almacen' || reportType === 'cargo' ? activeItems.length : filteredMovements.length}
            </h2>
            <div style={{ fontSize: '12px', marginTop: '10px', color: '#93c5fd' }}>
              {reportType === 'almacen' || reportType === 'cargo' ? 'Artículos en catálogo' : 'Transacciones realizadas'}
            </div>
          </div>

          <div className="settings-card" style={{ padding: '20px' }}>
            <h4 style={{ fontSize: '12px', textTransform: 'uppercase', marginBottom: '12px' }}>Resumen Rápido</h4>
            {reportType === 'almacen' || reportType === 'cargo' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                <div>Total Unidades en Stock: <strong>{activeItems.reduce((acc, i) => acc + (i.stock || 0), 0)}</strong></div>
                <div>Salidas en el Rango: <strong>{filteredMovements.filter(m => m.type === 'salida').reduce((acc, m) => acc + (Number(m.quantity) || 0), 0)} uds</strong></div>
                <div>Categorías Registradas: <strong>{new Set(activeItems.map(i => i.category)).size}</strong></div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {summaryList.map((row) => (
                  <div key={row.type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                      <span style={{ textTransform: 'capitalize' }}>{row.type}s</span>
                      <span>{row.total_count} ({row.total_quantity} uds)</span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: 'var(--border-color, #334155)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          height: '100%', 
                          width: `${Math.min(100, (row.total_count / (filteredMovements.length || 1)) * 100)}%`, 
                          backgroundColor: row.type === 'entrada' ? '#22c55e' : '#ef4444' 
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="settings-card" style={{ marginTop: '10px', padding: '20px' }}>
        <h4 style={{ marginBottom: '15px', borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px', color: 'var(--text-main)' }}>
          Vista Previa: {reportType === 'almacen' ? `REPORTE DE ALMACEN-INFOUNSA (${activeItems.length} bienes)` : (reportType === 'cargo' ? `Estado General de Inventario (Cargo) (${activeItems.length} bienes)` : `${reportFormat === 'resumido' ? 'Resumen por Tipo' : 'Historial Detallado de Movimientos'} (${reportFormat === 'resumido' ? summaryList.length : filteredMovements.length})`)}
        </h4>

        {reportType === 'almacen' ? (
          <div className="table-scroll" style={{ maxHeight: '600px' }}>
            <table className="crud-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '5%' }}>N°</th>
                  <th style={{ width: '35%' }}>Producto</th>
                  <th style={{ width: '15%', textAlign: 'center' }}>Medida</th>
                  <th style={{ width: '15%', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#60a5fa' }}>[{reportStart}]</div>
                    <div>Cantidad</div>
                  </th>
                  <th style={{ width: '15%', textAlign: 'center' }}>Salida</th>
                  <th style={{ width: '15%', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: '#60a5fa' }}>[{reportEnd}]</div>
                    <div>Stock</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeItems.map((item, idx) => {
                  const salidas = filteredMovements
                    .filter(m => (m.item_id && String(m.item_id) === String(item.id)) || (m.item_barcode && m.item_barcode === item.code))
                    .filter(m => m.type === 'salida')
                    .reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
                  const entradas = filteredMovements
                    .filter(m => (m.item_id && String(m.item_id) === String(item.id)) || (m.item_barcode && m.item_barcode === item.code))
                    .filter(m => m.type === 'entrada')
                    .reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
                  const initialQty = Math.max(0, (item.stock || 0) - entradas + salidas);

                  return (
                    <tr key={item.id || item.code}>
                      <td>{idx + 1}</td>
                      <td><strong>{item.name}</strong> <code style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({item.code})</code></td>
                      <td style={{ textAlign: 'center' }}>{item.unit || 'unidad'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{initialQty}</td>
                      <td style={{ textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>{salidas}</td>
                      <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>{item.stock}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : reportType === 'cargo' ? (
          <div className="table-scroll" style={{ maxHeight: '600px' }}>
            <table className="crud-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '6%' }}>N°</th>
                  <th style={{ width: '40%' }}>Producto / Bien</th>
                  <th style={{ width: '15%', textAlign: 'center' }}>Medida</th>
                  <th style={{ width: '15%', textAlign: 'center' }}>Cantidad Actual</th>
                  <th style={{ width: '24%' }}>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {activeItems.map((item, idx) => (
                  <tr key={item.id || item.code}>
                    <td>{idx + 1}</td>
                    <td><strong>{item.name}</strong> <code style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({item.code})</code></td>
                    <td style={{ textAlign: 'center' }}>{item.unit || 'unidad'}</td>
                    <td style={{ textAlign: 'center' }}><span className="badge badge-success">{item.stock}</span></td>
                    <td>{item.description || item.category || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !hasMovements ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#ef4444', fontWeight: 'bold', fontSize: '14px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            ⚠️ No se encontraron movimientos en este rango de fechas. Debe existir al menos un movimiento para generar el reporte.
          </div>
        ) : (
          <div className="table-scroll" style={{ maxHeight: '600px' }}>
            {reportFormat === 'resumido' ? (
              <table className="crud-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Tipo de Movimiento</th>
                    <th style={{ textAlign: 'center' }}>Total Transacciones</th>
                    <th style={{ textAlign: 'center' }}>Cantidad de Artículos</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryList.map((s) => (
                    <tr key={s.type}>
                      <td>
                        <span className={`badge ${s.type === 'entrada' ? 'badge-success' : 'badge-danger'}`} style={{ textTransform: 'uppercase', padding: '2px 8px', backgroundColor: s.type === 'salida' ? '#ef4444' : undefined }}>
                          {s.type}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}><strong>{s.total_count}</strong></td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-pending" style={{ padding: '2px 8px' }}>{s.total_quantity}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="crud-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Fecha/Hora</th>
                    <th>Tipo</th>
                    <th>Bien / Artículo</th>
                    <th style={{ textAlign: 'center' }}>Cantidad</th>
                    <th>Operador / Destino</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.map((m, index) => (
                    <tr key={m.id}>
                      <td>{index + 1}</td>
                      <td>{new Date(m.registered_at).toLocaleString('es-PE')}</td>
                      <td>
                        <span className={`badge ${m.type === 'entrada' ? 'badge-success' : 'badge-danger'}`} style={{ textTransform: 'uppercase', padding: '2px 8px', backgroundColor: m.type === 'salida' ? '#ef4444' : undefined }}>
                          {m.type}
                        </span>
                      </td>
                      <td><strong>{m.item_name || `Item ${m.item_id}`}</strong></td>
                      <td style={{ textAlign: 'center' }}>{m.quantity}</td>
                      <td>{m.destinatario_name || m.operator_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="settings-card" style={{ marginTop: '10px', padding: '20px' }}>
        <h4 style={{ marginBottom: '15px', borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px' }}>Historial de Reportes PDF Generados</h4>
        <div className="table-scroll" style={{ maxHeight: '300px' }}>
          <table className="crud-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre del Reporte</th>
                <th>Fecha Generación</th>
                <th>Usuario</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reportHistory.map(rep => (
                <tr key={rep.id}>
                  <td><code>{rep.id}</code></td>
                  <td><strong>{rep.name}</strong></td>
                  <td>{rep.date}</td>
                  <td>{rep.user}</td>
                  <td>
                    <span className={`badge ${rep.status === 'Completado' ? 'badge-success' : rep.status === 'Error' ? 'badge-out' : 'badge-pending'}`}>
                      {rep.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="text-link-btn" onClick={() => handleViewReport(rep)} style={{ marginRight: '10px' }}>Ver</button>
                    <a href={rep.url} download={rep.name} className="text-link-btn" style={{ textDecoration: 'none' }}>Descargar</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
