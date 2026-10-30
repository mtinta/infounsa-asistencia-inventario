import { useState, useMemo, useEffect } from 'react';
import { FileText, RefreshCw, Search, Filter, CalendarRange, FileSpreadsheet, FileCheck, FileDown, X } from 'lucide-react';
import SkeletonRow from '../ui/SkeletonRow';
import Tooltip from '../ui/Tooltip';
import { AttendanceRecord } from '../../types';

interface ReportsTabProps {
  reportStart: string;
  setReportStart: (v: string) => void;
  reportEnd: string;
  setReportEnd: (v: string) => void;
  reportFormat: 'semanal' | 'detallado' | 'resumido';
  setReportFormat: (v: 'semanal' | 'detallado' | 'resumido') => void;
  handleGenerateReport: (filters: { search: string; filterType: string; filterRole: string; applyDayFilter: boolean; startDayOfWeek: number; endDayOfWeek: number }) => void;
  handleGenerateExcel: (filters: { search: string; filterType: string; filterRole: string; applyDayFilter: boolean; startDayOfWeek: number; endDayOfWeek: number }) => void;
  handleGenerateAuditReport: (filters: { search: string; filterType: string; filterRole: string; applyDayFilter: boolean; startDayOfWeek: number; endDayOfWeek: number }) => void;
  isAuditLoading: boolean;
  userRole: string;
  isOnline: boolean;
  isLoading: boolean;
  isExcelLoading: boolean;
  reportUrl: string | null;
  records: AttendanceRecord[];
}

export default function ReportsTab({
  reportStart,
  setReportStart,
  reportEnd,
  setReportEnd,
  reportFormat,
  setReportFormat,
  handleGenerateReport,
  handleGenerateExcel,
  handleGenerateAuditReport,
  isAuditLoading,
  userRole,
  isOnline,
  isLoading,
  isExcelLoading,
  reportUrl,
  records,
}: ReportsTabProps) {
  // Filtros adicionales interactivos para la vista previa
  const [filterNameOrDni, setFilterNameOrDni] = useState('');
  const [filterType, setFilterType] = useState<'todos' | 'entrada' | 'salida'>('todos');
  const [filterRole, setFilterRole] = useState<'todos' | 'usuario' | 'visitante' | 'menor'>('todos');
  
  // Rango de Días de la Semana: Permite seleccionar un inicio y fin de día laboral (ej. Lunes a Viernes)
  const [startDayOfWeek, setStartDayOfWeek] = useState<number>(1); // 1: Lunes por defecto
  const [endDayOfWeek, setEndDayOfWeek] = useState<number>(5);     // 5: Viernes por defecto
  const [applyDayFilter, setApplyDayFilter] = useState<boolean>(false);
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);

  // Abrir automaticamente la ventana emergente al generar un nuevo reportUrl
  useEffect(() => {
    if (reportUrl) {
      setShowPdfModal(true);
    }
  }, [reportUrl]);

  // Mapeo helper para determinar el rol de un registro
  const getRecordRole = (dni: string): 'usuario' | 'visitante' | 'menor' => {
    if (dni === '00000000') return 'menor';
    if (dni.startsWith('VISIT') || dni === 'VISIT000') return 'visitante';
    return 'usuario';
  };

  // 1. Filtrar registros por fecha, estado de auditoria y filtros del usuario
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (!r.registered_at) return false;
      if (r.estado_auditoria === 'borrado') return false;

      // Filtro de Fecha Rango
      const dateStr = r.registered_at.split('T')[0];
      const inDateRange = dateStr >= reportStart && dateStr <= reportEnd;
      if (!inDateRange) return false;

      // Filtro de Nombre o DNI
      if (filterNameOrDni.trim()) {
        const query = filterNameOrDni.toLowerCase().trim();
        const matchesDni = r.dni.toLowerCase().includes(query);
        const matchesName = r.name.toLowerCase().includes(query);
        if (!matchesDni && !matchesName) return false;
      }

      // Filtro de Tipo (Entrada/Salida)
      if (filterType !== 'todos' && r.type !== filterType) {
        return false;
      }

      // Filtro de Rol
      if (filterRole !== 'todos') {
        const role = getRecordRole(r.dni);
        if (role !== filterRole) return false;
      }

      // Filtro de rango de días de la semana (Lunes: 1, Domingo: 0/7)
      if (applyDayFilter) {
        const dateObj = new Date(r.registered_at);
        let day = dateObj.getDay(); // 0: Domingo, 1: Lunes, ..., 6: Sabado
        if (day === 0) day = 7; // Mapear Domingo a 7 para comparacion lineal logica
        
        const startLimit = startDayOfWeek;
        const endLimit = endDayOfWeek;
        
        if (startLimit <= endLimit) {
          if (day < startLimit || day > endLimit) return false;
        } else {
          // Si el rango es nocturno o cruza el fin de semana (ej: Viernes a Lunes)
          if (day < startLimit && day > endLimit) return false;
        }
      }

      return true;
    });
  }, [records, reportStart, reportEnd, filterNameOrDni, filterType, filterRole, startDayOfWeek, endDayOfWeek, applyDayFilter]);

  const hasRecords = filteredRecords.length > 0;

  // 2. Computar matriz semanal para formato "semanal" (Pivoteado por usuario y fechas)
  const weeklyMatrix = useMemo(() => {
    const dateSet = new Set<string>();
    for (const r of filteredRecords) {
      if (r.registered_at) {
        dateSet.add(r.registered_at.split('T')[0]);
      }
    }
    const sortedDates = Array.from(dateSet).sort();

    const userMap: Record<string, {
      dni: string;
      apellidos: string;
      nombres: string;
      condicion: string;
      cargo: string;
      hora_ingreso: string;
      marks: Record<string, string>;
      observaciones: string[];
    }> = {};

    for (const r of filteredRecords) {
      const dni = r.dni || 'SIN-DNI';
      if (!userMap[dni]) {
        let apellidos = 'Sin Apellidos';
        let nombres = 'Sin Nombres';

        if (r.apellido_paterno || r.apellido_materno) {
          const p = (r.apellido_paterno || '').trim();
          const m = (r.apellido_materno || '').trim();
          apellidos = m && p ? `${m} ${p}` : (m || p);
          nombres = (r.nombres || r.name || '').trim();
        } else if (r.name) {
          if (r.name.includes(',')) {
            const parts = r.name.split(',');
            apellidos = parts[0].trim();
            nombres = parts.slice(1).join(',').trim();
          } else {
            const parts = r.name.trim().split(/\s+/);
            if (parts.length <= 2) {
              apellidos = parts[0] || '';
              nombres = parts.slice(1).join(' ') || '';
            } else {
              apellidos = `${parts[0]} ${parts[1]}`;
              nombres = parts.slice(2).join(' ');
            }
          }
        }

        userMap[dni] = {
          dni,
          apellidos: apellidos || 'Sin Apellidos',
          nombres: nombres || 'Sin Nombres',
          condicion: r.dni.startsWith('VISIT') || r.dni === 'VISIT000' ? 'VISITANTE' : (r.dni === '00000000' ? 'MENOR' : 'PERSONAL'),
          cargo: r.dni.startsWith('VISIT') || r.dni === 'VISIT000' ? 'VISITANTE' : 'COLABORADOR',
          hora_ingreso: '08:00 a.m.',
          marks: {},
          observaciones: [],
        };
      }

      const dateStr = r.registered_at.split('T')[0];
      const timeStr = new Date(r.registered_at).toLocaleTimeString('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).toLowerCase();

      if (r.type === 'entrada' || !userMap[dni].marks[dateStr]) {
        userMap[dni].marks[dateStr] = timeStr;
      }

      if (r.observacion) {
        const cleanObs = r.observacion.replace(/[\r\n]+/g, ' ').trim();
        if (cleanObs && !userMap[dni].observaciones.includes(cleanObs)) {
          userMap[dni].observaciones.push(cleanObs);
        }
      }
    }

    return {
      dates: sortedDates,
      users: Object.values(userMap),
    };
  }, [filteredRecords]);

  const daysOfWeek = [
    { value: 1, label: 'Lunes' },
    { value: 2, label: 'Martes' },
    { value: 3, label: 'Miércoles' },
    { value: 4, label: 'Jueves' },
    { value: 5, label: 'Viernes' },
    { value: 6, label: 'Sábado' },
    { value: 7, label: 'Domingo' },
  ];

  const isWeekly = reportFormat === 'semanal' || reportFormat === 'resumido';

  return (
    <div className="reports-tab">
      <div className="panel-header">
        <h3>Generador de Reportes PDF & Excel</h3>
      </div>
      <div className="report-controls" style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1' }}>
            <label htmlFor="report-start">Fecha inicio</label>
            <Tooltip content="Fecha inicial del período para el reporte y análisis de asistencia." position="top" style={{ width: '100%' }}>
              <input id="report-start" type="date" className="form-input" value={reportStart} onChange={(e) => setReportStart(e.target.value)} />
            </Tooltip>
          </div>
          <div className="form-group" style={{ flex: '1' }}>
            <label htmlFor="report-end">Fecha fin</label>
            <Tooltip content="Fecha de corte final del período para el reporte de asistencia." position="top" style={{ width: '100%' }}>
              <input id="report-end" type="date" className="form-input" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} />
            </Tooltip>
          </div>
        </div>

        {/* Panel de Filtros Avanzados (Exportación & Vista Previa Integrada) */}
        <div className="settings-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-color, #334155)', borderRadius: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main, #e2e8f0)' }}>
            <Filter size={18} style={{ color: 'var(--accent, #3b82f6)' }} /> Panel de Filtros Avanzados (Exportación & Vista Previa)
          </span>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {/* Búsqueda por DNI o Nombre */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-main, #94a3b8)', marginBottom: '6px', display: 'block' }}>Nombre o DNI</label>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="text"
                  placeholder="Buscar por DNI o Colaborador..."
                  className="form-input"
                  style={{ paddingLeft: '32px', width: '100%', boxSizing: 'border-box' }}
                  value={filterNameOrDni}
                  onChange={(e) => setFilterNameOrDni(e.target.value)}
                />
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              </div>
            </div>

            {/* Tipo de Registro */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-main, #94a3b8)', marginBottom: '6px', display: 'block' }}>Tipo</label>
              <select className="form-input" style={{ width: '100%', boxSizing: 'border-box' }} value={filterType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterType(e.target.value as 'entrada' | 'salida' | 'todos')}>
                <option value="todos">Todos los Tipos</option>
                <option value="entrada">Entradas</option>
                <option value="salida">Salidas</option>
              </select>
            </div>

            {/* Rol */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-main, #94a3b8)', marginBottom: '6px', display: 'block' }}>Rol</label>
              <select className="form-input" style={{ width: '100%', boxSizing: 'border-box' }} value={filterRole} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterRole(e.target.value as 'usuario' | 'todos' | 'visitante' | 'menor')}>
                <option value="todos">Todos los Roles</option>
                <option value="usuario">Personal / Alumnos</option>
                <option value="visitante">Visitantes</option>
                <option value="menor">Menores de Edad</option>
              </select>
            </div>
          </div>

          {/* Rango de Días de la Semana */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px dashed var(--border-color, #334155)' }}>
            <Tooltip content="Excluye fines de semana u horarios no laborales para evitar inconsistencias en el cómputo." position="right">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  id="apply-day-filter" 
                  type="checkbox" 
                  checked={applyDayFilter} 
                  onChange={(e) => setApplyDayFilter(e.target.checked)} 
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="apply-day-filter" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-main)', cursor: 'pointer' }}>
                  Filtrar por Rango de Días Laborales:
                </label>
              </div>
            </Tooltip>

            {applyDayFilter && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select 
                  className="form-input" 
                  value={startDayOfWeek} 
                  onChange={(e) => setStartDayOfWeek(parseInt(e.target.value, 10))}
                  style={{ padding: '4px 8px', fontSize: '13px' }}
                >
                  {daysOfWeek.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
                <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>a</span>
                <select 
                  className="form-input" 
                  value={endDayOfWeek} 
                  onChange={(e) => setEndDayOfWeek(parseInt(e.target.value, 10))}
                  style={{ padding: '4px 8px', fontSize: '13px' }}
                >
                  {daysOfWeek.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* TABLA DE RESUMEN DE VISTA PREVIA DENTRO DEL PANEL DE FILTROS */}
          <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color, #334155)', paddingTop: '16px' }}>
            <h4 style={{ marginBottom: '12px', color: 'var(--text-main)', fontSize: '0.95rem' }}>
              Vista Previa: {isWeekly ? 'Matriz Semanal de Asistencia' : 'Registro de Marcaciones Detallado'} ({isWeekly ? weeklyMatrix.users.length : filteredRecords.length} registros)
            </h4>
            
            {!hasRecords ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#ef4444', fontWeight: 'bold', fontSize: '13px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                ⚠️ No se encontraron registros de asistencia con los filtros seleccionados en este rango de fechas.
              </div>
            ) : (
              <div className="table-scroll" style={{ maxHeight: '350px', overflowX: 'auto' }}>
                {isWeekly ? (
                  <table className="crud-table mini-table" style={{ width: '100%', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '30px', textAlign: 'center' }}>N°</th>
                        <th>Apellidos</th>
                        <th>Nombres</th>
                        <th style={{ textAlign: 'center' }}>Condición</th>
                        <th>Cargo</th>
                        <th style={{ textAlign: 'center' }}>Hora Ingreso</th>
                        {weeklyMatrix.dates.map((d) => (
                          <th key={d} style={{ textAlign: 'center', minWidth: '55px', backgroundColor: '#1e3a8a', color: 'white' }}>
                            {new Date(d + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })}
                          </th>
                        ))}
                        <th>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeklyMatrix.users.map((u, idx) => (
                        <tr key={u.dni}>
                          <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                          <td><strong>{u.apellidos}</strong></td>
                          <td>{u.nombres}</td>
                          <td style={{ textAlign: 'center' }}><span className="badge badge-info">{u.condicion}</span></td>
                          <td>{u.cargo}</td>
                          <td style={{ textAlign: 'center' }}><code>{u.hora_ingreso}</code></td>
                          {weeklyMatrix.dates.map((d) => (
                            <td key={d} style={{ textAlign: 'center' }}>
                              {u.marks[d] ? (
                                <span className="badge badge-success" style={{ fontSize: '10.5px' }}>{u.marks[d]}</span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>-</span>
                              )}
                            </td>
                          ))}
                          <td>
                            {u.observaciones.length > 0 ? (
                              <span style={{ fontSize: '11px', color: '#64748b' }}>{Array.from(new Set(u.observaciones)).join(', ')}</span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="crud-table mini-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>DNI / ID</th>
                        <th>Colaborador</th>
                        <th>Rol</th>
                        <th>Tipo</th>
                        <th>Fecha/Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((r, index) => {
                        let roleLabel = 'Personal / Alumno';
                        const role = getRecordRole(r.dni);
                        if (role === 'menor') {
                          roleLabel = 'Menor de Edad';
                        } else if (role === 'visitante') {
                          roleLabel = 'Visitante';
                        }
                        return (
                          <tr key={r.id_local}>
                            <td>{index + 1}</td>
                            <td><code>{r.dni}</code></td>
                            <td><strong>{r.name}</strong></td>
                            <td>{roleLabel}</td>
                            <td>
                              <span className={`badge ${r.type === 'entrada' ? 'badge-success' : 'badge-danger'}`} style={{ textTransform: 'uppercase', padding: '2px 8px', fontSize: '11px', backgroundColor: r.type === 'salida' ? '#ef4444' : undefined }}>
                                {r.type}
                              </span>
                            </td>
                            <td>{new Date(r.registered_at).toLocaleString('es-PE')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-main)' }}>Tipo de Formato</label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Tooltip content="Genera una matriz condensada en hoja A4 horizontal con los 7 días de la semana por fila de persona." position="top" style={{ flex: '1' }}>
              <button
                type="button"
                onClick={() => setReportFormat('semanal')}
                className="sync-action-btn"
                style={{
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  backgroundColor: isWeekly ? 'var(--accent, #14387f)' : 'var(--bg-card, #1e293b)',
                  color: isWeekly ? 'white' : 'var(--text-main, #94a3b8)',
                  border: isWeekly ? '1px solid var(--accent)' : '1px solid var(--border-color, #334155)',
                  fontWeight: 'bold',
                  padding: '10px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <CalendarRange size={18} />
                <span>Reporte Semanal (Matriz A4)</span>
              </button>
            </Tooltip>
            <Tooltip content="Genera un informe cronológico desglosando cada entrada y salida con fecha y hora exacta." position="top" style={{ flex: '1' }}>
              <button
                type="button"
                onClick={() => setReportFormat('detallado')}
                className="sync-action-btn"
                style={{
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
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
                <FileText size={18} />
                <span>Reporte Detallado (Logs por Día)</span>
              </button>
            </Tooltip>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
          <Tooltip content="Generar reporte en formato PDF listo para previsualización e impresión" position="top" style={{ flex: '1 1 200px' }}>
            <button 
              className="sync-action-btn report-generate-btn" 
              onClick={() => {
                handleGenerateReport({
                  search: filterNameOrDni,
                  filterType,
                  filterRole,
                  applyDayFilter,
                  startDayOfWeek,
                  endDayOfWeek
                });
                setShowPdfModal(true);
              }} 
              disabled={isLoading || !hasRecords}
              style={{ 
                opacity: (!hasRecords || isLoading) ? 0.6 : 1, 
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: 'clamp(0.85rem, 1.2vw, 0.95rem)',
                padding: '12px 16px' 
              }}
            >
              <FileDown size={18} />
              <span>{isLoading ? 'Generando PDF...' : `Generar PDF (${reportFormat === 'detallado' ? 'Detallado' : 'Semanal'})`}</span>
            </button>
          </Tooltip>

          <Tooltip content="Exportar hoja de cálculo Excel (.xlsx) con los registros filtrados" position="top" style={{ flex: '1 1 200px' }}>
            <button 
              className="sync-action-btn" 
              onClick={() => handleGenerateExcel({
                search: filterNameOrDni,
                filterType,
                filterRole,
                applyDayFilter,
                startDayOfWeek,
                endDayOfWeek
              })} 
              disabled={isExcelLoading || !hasRecords}
              style={{ 
                opacity: (!hasRecords || isExcelLoading) ? 0.6 : 1, 
                width: '100%',
                justifyContent: 'center',
                fontSize: 'clamp(0.85rem, 1.2vw, 0.95rem)',
                padding: '12px 16px',
                backgroundColor: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: (!hasRecords || isExcelLoading) ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isExcelLoading ? (
                <RefreshCw size={18} className="spin-animation" />
              ) : (
                <FileSpreadsheet size={18} />
              )}
              <span>Descargar Excel</span>
            </button>
          </Tooltip>

          {userRole === 'administrador' && (
            <Tooltip content="Descarga un Excel forense con IP de origen, usuario creador y trazabilidad de cambios (Requiere ONLINE)." position="top" style={{ flex: '1 1 200px' }}>
              <button 
                className="sync-action-btn" 
                onClick={() => handleGenerateAuditReport({
                  search: filterNameOrDni,
                  filterType,
                  filterRole,
                  applyDayFilter,
                  startDayOfWeek,
                  endDayOfWeek
                })} 
                disabled={isAuditLoading || !isOnline}
                style={{ 
                  opacity: (!isOnline || isAuditLoading) ? 0.6 : 1, 
                  width: '100%',
                  justifyContent: 'center',
                  fontSize: 'clamp(0.85rem, 1.2vw, 0.95rem)',
                  padding: '12px 16px',
                  backgroundColor: '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (!isOnline || isAuditLoading) ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                title={isOnline ? 'Descargar Excel de Auditoría' : 'Debe estar ONLINE para descargar el reporte de auditoría'}
              >
                {isAuditLoading ? (
                  <RefreshCw size={18} className="spin-animation" />
                ) : (
                  <FileCheck size={18} />
                )}
                <span>Reporte Auditoría</span>
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {isLoading && <SkeletonRow count={8} />}

      {/* VENTANA EMERGENTE POPUP MODAL PARA VISTA PREVIA DEL PDF */}
      {showPdfModal && reportUrl && (
        <div 
          className="modal-overlay" 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            zIndex: 9999, 
            backgroundColor: 'rgba(15, 23, 42, 0.8)', 
            backdropFilter: 'blur(4px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '20px' 
          }}
          onClick={() => setShowPdfModal(false)}
        >
          <div 
            className="modal-card" 
            style={{ 
              width: '92vw', 
              maxWidth: '1100px', 
              height: '88vh', 
              backgroundColor: '#0f172a', 
              borderRadius: '12px', 
              border: '1px solid #334155', 
              display: 'flex', 
              flexDirection: 'column', 
              overflow: 'hidden', 
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '14px 20px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc', fontWeight: 'bold' }}>Vista Previa del Reporte PDF</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Tooltip content="Descargar archivo PDF al almacenamiento local" position="bottom">
                  <a 
                    href={reportUrl} 
                    download={`reporte-asistencia-${reportStart}-a-${reportEnd}.pdf`} 
                    className="btn-download-pdf" 
                    style={{ 
                      textDecoration: 'none', 
                      backgroundColor: '#0284c7', 
                      color: '#ffffff', 
                      padding: '8px 18px', 
                      borderRadius: '6px', 
                      fontSize: '0.85rem', 
                      fontWeight: 'bold', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '6px',
                      transition: 'background-color 0.2s'
                    }}
                  >
                    <FileDown size={16} />
                    <span>Descargar PDF</span>
                  </a>
                </Tooltip>
                <Tooltip content="Cerrar vista previa" position="bottom">
                  <button 
                    type="button" 
                    onClick={() => setShowPdfModal(false)} 
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Cerrar ventana emergente"
                  >
                    <X size={20} />
                  </button>
                </Tooltip>
              </div>
            </div>
            <div style={{ flex: 1, backgroundColor: '#334155', width: '100%', height: '100%' }}>
              <iframe src={reportUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Reporte PDF de Asistencia" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
