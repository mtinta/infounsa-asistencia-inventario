import { useState, useRef } from 'react';
import { InventoryItem } from '../../types';
import { apiFetch } from '../../utils/api';
import { useToast } from '../ui/ToastProvider';
import Tooltip from '../ui/Tooltip';
import { 
  FileSpreadsheet, 
  AlertCircle, 
  Trash2, 
  Check, 
  FileCheck,
  XCircle,
  Download,
} from 'lucide-react';

interface ExcelUploadTabProps {
  items: InventoryItem[];
  categories: { id: number; name: string }[];
  onImportComplete: () => Promise<void>;
  isOnline: boolean;
}

interface ParsedStockItem {
  rowIndex: number;
  name: string;
  unit: string;
  quantity: number;
  min_stock: number;
  category_name?: string;
  category_id?: number;
  description?: string;
  isDbMatch?: boolean;
  isExcelDuplicate?: boolean;
  action: 'overwrite' | 'ignore';
  error?: string;
}

interface ParsedMovement {
  rowIndex: number;
  item_name: string;
  unit?: string;
  type: 'entrada' | 'salida';
  quantity: number;
  registered_at: string;
  observations: string;
  destinatario_name: string | null;
  operator_name: string;
}

export default function ExcelUploadTab({
  items,
  categories,
  onImportComplete,
  isOnline,
}: ExcelUploadTabProps) {
  const { showToast } = useToast();
  
  const [filePath, setFilePath] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedStockItem[]>([]);
  const [parsedIngresos, setParsedIngresos] = useState<ParsedMovement[]>([]);
  const [parsedSalidas, setParsedSalidas] = useState<ParsedMovement[]>([]);
  
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'stock' | 'ingreso' | 'salida'>('stock');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCancelPreview = () => {
    setFilePath(null);
    setParsedItems([]);
    setParsedIngresos([]);
    setParsedSalidas([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast('Previsualización cancelada.', 'info');
  };

  const recalculateValidations = (stockList: ParsedStockItem[]) => {
    const nameCounts: Record<string, number> = {};
    stockList.forEach(item => {
      const key = item.name.trim().toLowerCase();
      if (key) nameCounts[key] = (nameCounts[key] || 0) + 1;
    });

    return stockList.map(item => {
      const cleanName = item.name.trim();
      const nameKey = cleanName.toLowerCase();
      
      const isDbMatch = items.some(
        (dbItem) => dbItem.name.toLowerCase() === nameKey
      );

      const isExcelDuplicate = (nameCounts[nameKey] || 0) > 1;

      return {
        ...item,
        isDbMatch,
        isExcelDuplicate,
        error: cleanName ? '' : 'El nombre del producto no puede estar vacío.'
      };
    });
  };

  const handleFileProcess = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      showToast('Formato no soportado. Debe seleccionar un archivo Excel (.xlsx)', 'error');
      return;
    }

    setIsParsing(true);
    setFilePath(file.name);
    setParsedItems([]);
    setParsedIngresos([]);
    setParsedSalidas([]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiFetch('/inventory-items/import/preview', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al procesar el archivo Excel en el servidor.');
      }

      const resData = await res.json();
      const rawStockList: ParsedStockItem[] = (resData.stockItems || []).map((item: Record<string, unknown>) => ({
        rowIndex: Number(item.rowIndex),
        name: String(item.name || ''),
        unit: (item.unit as string) || 'UNIDAD',
        quantity: Number(item.quantity) || 0,
        min_stock: Number(item.min_stock) || 5,
        category_id: (item.category_id as number) || categories[0]?.id || 1,
        category_name: (item.category_name as string) || categories[0]?.name || 'Material de oficina',
        description: (item.description as string) || 'Importado de planilla de inventario',
        action: (item.action as 'overwrite' | 'skip') || 'overwrite',
      }));

      const validatedStockItems = recalculateValidations(rawStockList);
      setParsedItems(validatedStockItems);
      setParsedIngresos(resData.ingresoMovements || []);
      setParsedSalidas(resData.salidaMovements || []);

      showToast('Archivo Excel leído y analizado con éxito en el servidor.', 'success');
    } catch (err: unknown) {
      setFilePath(null);
      const msg = err instanceof Error ? err.message : 'Error desconocido al procesar el archivo';
      showToast(`Error al procesar el archivo: ${msg}`, 'error');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

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
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleSelectClick = () => {
    fileInputRef.current?.click();
  };

  // Field edit handlers for Stock Items
  const handleUpdateItemField = (index: number, field: keyof ParsedStockItem, value: ParsedStockItem[keyof ParsedStockItem]) => {
    const updated = [...parsedItems];
    updated[index] = { ...updated[index], [field]: value };
    setParsedItems(recalculateValidations(updated));
  };

  const handleDeleteItem = (index: number) => {
    const updated = [...parsedItems];
    updated.splice(index, 1);
    setParsedItems(recalculateValidations(updated));
  };

  // Field edit handlers for Ingresos
  const handleUpdateIngresoField = (index: number, field: keyof ParsedMovement, value: ParsedMovement[keyof ParsedMovement]) => {
    const updated = [...parsedIngresos];
    updated[index] = { ...updated[index], [field]: value };
    setParsedIngresos(updated);
  };

  const handleDeleteIngreso = (index: number) => {
    const updated = [...parsedIngresos];
    updated.splice(index, 1);
    setParsedIngresos(updated);
  };

  // Field edit handlers for Salidas
  const handleUpdateSalidaField = (index: number, field: keyof ParsedMovement, value: ParsedMovement[keyof ParsedMovement]) => {
    const updated = [...parsedSalidas];
    updated[index] = { ...updated[index], [field]: value };
    setParsedSalidas(updated);
  };

  const handleDeleteSalida = (index: number) => {
    const updated = [...parsedSalidas];
    updated.splice(index, 1);
    setParsedSalidas(updated);
  };

  const handleImport = async () => {
    if (!isOnline) {
      showToast('Debe estar conectado al servidor para realizar la importación.', 'error');
      return;
    }

    const hasErrors = parsedItems.some(i => !!i.error);
    if (hasErrors) {
      showToast('Por favor corrige todos los campos vacíos o con errores en rojo antes de importar.', 'error');
      return;
    }

    setIsImporting(true);
    try {
      const payloadItems = parsedItems.map(item => ({
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        min_stock: item.min_stock,
        category_name: categories.find(c => c.id === item.category_id)?.name || item.category_name,
        description: item.description,
        overwrite: item.action === 'overwrite'
      }));

      const payloadMovements = [
        ...parsedIngresos,
        ...parsedSalidas
      ].map(m => ({
        item_name: m.item_name,
        unit: m.unit || 'UNIDAD',
        type: m.type,
        quantity: m.quantity,
        registered_at: m.registered_at,
        observations: m.observations,
        destinatario_name: m.destinatario_name,
        operator_name: m.operator_name
      }));

      const res = await apiFetch('/inventory-items/import/confirm', {
        method: 'POST',
        body: JSON.stringify({
          items: payloadItems,
          movements: payloadMovements
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al procesar la importación masiva.');
      }

      const result = await res.json();
      showToast(
        `Importación exitosa. ${result.importedItemsCount} productos y ${result.importedMovementsCount} movimientos cargados.`,
        'success'
      );
      
      // Reset state
      setFilePath(null);
      setParsedItems([]);
      setParsedIngresos([]);
      setParsedSalidas([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      // Refresh global state
      await onImportComplete();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fallo de red al importar datos.';
      showToast(msg, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // Pre-calculate statistics
  const totalItems = parsedItems.length;
  const dbMatchCount = parsedItems.filter(i => i.isDbMatch).length;
  const excelDuplicateCount = parsedItems.filter(i => i.isExcelDuplicate).length;
  const zeroStockCount = parsedItems.filter(i => i.quantity <= 0).length;
  const criticalCount = parsedItems.filter(i => i.quantity <= i.min_stock && i.quantity > 0).length;
  const totalMovements = parsedIngresos.length + parsedSalidas.length;
  const emptyFieldsCount = parsedItems.filter(i => !!i.error).length;

  const handleDownloadTemplate = async () => {
    try {
      const res = await apiFetch('/inventory-items/import/template');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al descargar la plantilla');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Plantilla_Inventario_InfoUNSA.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Plantilla Excel descargada exitosamente.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido al descargar la plantilla';
      showToast(`Error al descargar la plantilla: ${msg}`, 'error');
    }
  };

  return (
    <div className="excel-upload-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px' }}>
      <div className="panel-header">
        <div>
          <h3>Importar Catálogo y Movimientos desde Excel</h3>
          <p className="kiosk-hint">Cargue las planillas reales (STOCK, INGRESO, SALIDA) para poblar la base de datos central</p>
        </div>
      </div>

      <div className="settings-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Input de archivo oculto */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />

        {/* Selector de Archivo con Drag & Drop */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            border: isDragOver ? '2px dashed #3b82f6' : '2px dashed var(--border-color, #475569)', 
            borderRadius: '8px', 
            padding: '30px', 
            background: isDragOver ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-main, #0f172a)', 
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease-in-out'
          }}
          onClick={(e) => {
            // Solo si no fue click en un botón hijo
            if ((e.target as HTMLElement).tagName !== 'BUTTON') {
              handleSelectClick();
            }
          }}
        >
          <FileSpreadsheet size={48} style={{ color: filePath ? '#10b981' : '#64748b', marginBottom: '12px' }} />
          {filePath ? (
            <div>
              <p style={{ fontWeight: 'bold', color: '#10b981', margin: '0 0 5px 0' }}>Archivo leído exitosamente</p>
              <code style={{ fontSize: '12px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all' }}>{filePath}</code>
            </div>
          ) : (
            <div>
              <p style={{ fontWeight: 'bold', margin: '0 0 5px 0' }}>Seleccione o arrastre la planilla Excel de inventario</p>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0 0 15px 0' }}>Debe contener las pestañas STOCK, INGRESO y SALIDA</p>
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '12px', marginTop: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button 
              className="sync-action-btn"
              onClick={(e) => { e.stopPropagation(); handleSelectClick(); }}
              disabled={isParsing || isImporting}
              style={{ background: '#3b82f6' }}
            >
              {isParsing ? 'Procesando archivo...' : filePath ? 'Cambiar Planilla Excel' : 'Buscar Archivo Excel'}
            </button>

            <Tooltip content="Descargue la estructura oficial de columnas requerida por el motor de importación." position="bottom">
              <button 
                className="sync-action-btn"
                onClick={(e) => { e.stopPropagation(); handleDownloadTemplate(); }}
                disabled={isParsing || isImporting}
                style={{ background: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={16} />
                Descargar Plantilla Tipo (.xlsx)
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Panel de Estadísticas y Validaciones de Previsualización */}
        {filePath && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color, #1e293b)', padding: '12px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Bienes Encontrados</span>
              <h3 style={{ margin: '5px 0 0 0', fontSize: '22px', fontWeight: 'bold' }}>{totalItems}</h3>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color, #1e293b)', padding: '12px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', color: '#60a5fa', textTransform: 'uppercase' }}>Coincidencias en BD</span>
              <h3 style={{ margin: '5px 0 0 0', fontSize: '22px', fontWeight: 'bold', color: '#60a5fa' }}>{dbMatchCount}</h3>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color, #1e293b)', padding: '12px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', color: '#f59e0b', textTransform: 'uppercase' }}>Duplicados Planilla</span>
              <h3 style={{ margin: '5px 0 0 0', fontSize: '22px', fontWeight: 'bold', color: '#f59e0b' }}>{excelDuplicateCount}</h3>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color, #1e293b)', padding: '12px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', color: '#ef4444', textTransform: 'uppercase' }}>Productos Sin Stock (0)</span>
              <h3 style={{ margin: '5px 0 0 0', fontSize: '22px', fontWeight: 'bold', color: '#ef4444' }}>{zeroStockCount}</h3>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color, #1e293b)', padding: '12px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', color: '#f59e0b', textTransform: 'uppercase' }}>Bajo Stock Mínimo</span>
              <h3 style={{ margin: '5px 0 0 0', fontSize: '22px', fontWeight: 'bold', color: '#f59e0b' }}>{criticalCount}</h3>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color, #1e293b)', padding: '12px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', color: '#ec4899', textTransform: 'uppercase' }}>Movimientos Históricos</span>
              <h3 style={{ margin: '5px 0 0 0', fontSize: '22px', fontWeight: 'bold', color: '#ec4899' }}>{totalMovements}</h3>
            </div>
          </div>
        )}

        {/* Tablas de Previsualización (3 Pestañas) */}
        {filePath && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color, #1e293b)', gap: '10px' }}>
              <button 
                className={`tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
                onClick={() => setActiveTab('stock')}
                style={{ padding: '10px 20px', border: 'none', background: 'none', color: activeTab === 'stock' ? '#60a5fa' : 'var(--text-muted)', borderBottom: activeTab === 'stock' ? '2px solid #60a5fa' : 'none', cursor: 'pointer', fontWeight: 'bold' }}
              >
                📦 Previsualizar Catálogo / Stock ({parsedItems.length})
              </button>
              <button 
                className={`tab-btn ${activeTab === 'ingreso' ? 'active' : ''}`}
                onClick={() => setActiveTab('ingreso')}
                style={{ padding: '10px 20px', border: 'none', background: 'none', color: activeTab === 'ingreso' ? '#10b981' : 'var(--text-muted)', borderBottom: activeTab === 'ingreso' ? '2px solid #10b981' : 'none', cursor: 'pointer', fontWeight: 'bold' }}
              >
                🟢 Previsualizar Entradas / Ingresos ({parsedIngresos.length})
              </button>
              <button 
                className={`tab-btn ${activeTab === 'salida' ? 'active' : ''}`}
                onClick={() => setActiveTab('salida')}
                style={{ padding: '10px 20px', border: 'none', background: 'none', color: activeTab === 'salida' ? '#ef4444' : 'var(--text-muted)', borderBottom: activeTab === 'salida' ? '2px solid #ef4444' : 'none', cursor: 'pointer', fontWeight: 'bold' }}
              >
                🔴 Previsualizar Salidas / Egresos ({parsedSalidas.length})
              </button>
            </div>

            {/* SubTab 1: Catálogo / Stock */}
            {activeTab === 'stock' && (
              <div className="table-scroll" style={{ maxHeight: '450px' }}>
                <table className="crud-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '5%' }}>Fila</th>
                      <th style={{ width: '32%' }}>Producto (Nombre) *</th>
                      <th style={{ width: '10%' }}>Medida *</th>
                      <th style={{ width: '9%' }}>Cant. Inicial</th>
                      <th style={{ width: '14%' }}>Categoría</th>
                      <th style={{ width: '22%' }}>Comentarios / Observaciones</th>
                      <th style={{ width: '8%' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedItems.map((item, idx) => {
                      const isZero = item.quantity <= 0;
                      const isCritical = item.quantity <= item.min_stock && item.quantity > 0;
                      const isDbMatch = item.isDbMatch;
                      const isExcelDuplicate = item.isExcelDuplicate;

                      return (
                        <tr key={idx} style={{ background: item.error ? 'rgba(239, 68, 68, 0.05)' : undefined }}>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.rowIndex}</td>
                          <td>
                            <input 
                              type="text" 
                              className={`form-input ${item.error ? 'error' : ''}`}
                              value={item.name}
                              onChange={(e) => handleUpdateItemField(idx, 'name', e.target.value)}
                              placeholder="Falta nombre del producto..."
                              style={{ width: '100%', padding: '6px', fontSize: '13px', borderColor: item.error ? '#ef4444' : undefined }}
                            />
                            {item.error && (
                              <span style={{ fontSize: '10.5px', color: '#ef4444', display: 'block', marginTop: '2px' }}>
                                ⚠️ {item.error}
                              </span>
                            )}
                          </td>
                          <td>
                            <input 
                              type="text" 
                              className="form-input"
                              value={item.unit}
                              onChange={(e) => handleUpdateItemField(idx, 'unit', e.target.value)}
                              style={{ width: '100%', padding: '6px', fontSize: '13px' }}
                            />
                          </td>
                          <td>
                            <input 
                              type="number" 
                              className="form-input"
                              min="0"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItemField(idx, 'quantity', Math.max(0, parseInt(e.target.value, 10) || 0))}
                              style={{ width: '75px', padding: '6px', fontSize: '13px' }}
                            />
                          </td>
                          <td>
                            <select
                              className="form-input"
                              value={item.category_id || 0}
                              onChange={(e) => handleUpdateItemField(idx, 'category_id', Number(e.target.value))}
                              style={{ width: '100%', padding: '5px', fontSize: '12.5px', background: 'var(--bg-main, #1e293b)' }}
                            >
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <input 
                                type="text" 
                                className="form-input"
                                value={item.description || ''}
                                onChange={(e) => handleUpdateItemField(idx, 'description', e.target.value)}
                                placeholder="Escribir comentario..."
                                style={{ width: '100%', padding: '4px 6px', fontSize: '12px' }}
                              />
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {isZero && (
                                  <span className="badge badge-danger" style={{ fontSize: '10px', padding: '1px 3px' }}>
                                    🔴 SIN STOCK
                                  </span>
                                )}
                                {isCritical && (
                                  <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', fontSize: '10px', padding: '1px 3px' }}>
                                    ⚠️ CRÍTICO
                                  </span>
                                )}
                                {isDbMatch && (
                                  <span className="badge" style={{ backgroundColor: 'rgba(96, 165, 250, 0.2)', color: '#60a5fa', fontSize: '10px', padding: '1px 3px' }}>
                                    👥 COINCIDE BD
                                  </span>
                                )}
                                {isExcelDuplicate && (
                                  <span className="badge" style={{ backgroundColor: 'rgba(239, 112, 48, 0.2)', color: '#ef7030', fontSize: '10px', padding: '1px 3px' }}>
                                    ⚠️ DUPLICADO
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {isDbMatch || isExcelDuplicate ? (
                                <select
                                  className="form-input"
                                  value={item.action}
                                  onChange={(e) => handleUpdateItemField(idx, 'action', e.target.value)}
                                  style={{ padding: '2px 4px', fontSize: '11px', background: 'var(--bg-main)', cursor: 'pointer', border: '1px solid #60a5fa' }}
                                  title="Acción por duplicado o coincidencia"
                                >
                                  <option value="overwrite">Actualizar</option>
                                  <option value="ignore">Ignorar</option>
                                </select>
                              ) : (
                                <span style={{ color: '#10b981', display: 'flex', alignItems: 'center' }} title="Ok">
                                  <Check size={14} />
                                </span>
                              )}
                              <button 
                                type="button" 
                                className="action-btn out" 
                                onClick={() => handleDeleteItem(idx)}
                                style={{ padding: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                title="Eliminar fila"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* SubTab 2: Entradas / Ingresos */}
            {activeTab === 'ingreso' && (
              <div className="table-scroll" style={{ maxHeight: '450px' }}>
                <table className="crud-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '5%' }}>Fila</th>
                      <th style={{ width: '14%' }}>Fecha</th>
                      <th style={{ width: '34%' }}>Producto (Nombre)</th>
                      <th style={{ width: '12%' }}>Medida</th>
                      <th style={{ width: '9%' }}>Cantidad</th>
                      <th style={{ width: '20%' }}>Observaciones</th>
                      <th style={{ width: '6%' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedIngresos.map((m, idx) => (
                      <tr key={idx}>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.rowIndex}</td>
                        <td>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={m.registered_at.split('T')[0]} 
                            onChange={(e) => handleUpdateIngresoField(idx, 'registered_at', e.target.value)}
                            style={{ padding: '4px', fontSize: '12px' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={m.item_name} 
                            onChange={(e) => handleUpdateIngresoField(idx, 'item_name', e.target.value)}
                            style={{ padding: '4px', fontSize: '12.5px', fontWeight: 'bold' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={m.unit || 'UNIDAD'} 
                            onChange={(e) => handleUpdateIngresoField(idx, 'unit', e.target.value)}
                            style={{ padding: '4px', fontSize: '12px' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            className="form-input" 
                            min="0"
                            value={m.quantity} 
                            onChange={(e) => handleUpdateIngresoField(idx, 'quantity', Math.max(0, parseInt(e.target.value, 10) || 0))}
                            style={{ width: '65px', padding: '4px', fontSize: '12.5px', fontWeight: 'bold' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={m.observations} 
                            onChange={(e) => handleUpdateIngresoField(idx, 'observations', e.target.value)}
                            style={{ padding: '4px', fontSize: '12px' }}
                          />
                        </td>
                        <td>
                          <button 
                            type="button" 
                            onClick={() => handleDeleteIngreso(idx)}
                            style={{ padding: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            title="Eliminar fila"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {parsedIngresos.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                          No se encontraron registros de ingreso en la planilla.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* SubTab 3: Salidas / Egresos */}
            {activeTab === 'salida' && (
              <div className="table-scroll" style={{ maxHeight: '450px' }}>
                <table className="crud-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '5%' }}>Fila</th>
                      <th style={{ width: '13%' }}>Fecha</th>
                      <th style={{ width: '32%' }}>Producto (Material)</th>
                      <th style={{ width: '8%' }}>Cantidad</th>
                      <th style={{ width: '15%' }}>Destinatario</th>
                      <th style={{ width: '12%' }}>Entregado Por</th>
                      <th style={{ width: '10%' }}>Observaciones</th>
                      <th style={{ width: '5%' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedSalidas.map((m, idx) => (
                      <tr key={idx}>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.rowIndex}</td>
                        <td>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={m.registered_at.split('T')[0]} 
                            onChange={(e) => handleUpdateSalidaField(idx, 'registered_at', e.target.value)}
                            style={{ padding: '4px', fontSize: '12px' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={m.item_name} 
                            onChange={(e) => handleUpdateSalidaField(idx, 'item_name', e.target.value)}
                            style={{ padding: '4px', fontSize: '12.5px', fontWeight: 'bold' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            className="form-input" 
                            min="0"
                            value={m.quantity} 
                            onChange={(e) => handleUpdateSalidaField(idx, 'quantity', Math.max(0, parseInt(e.target.value, 10) || 0))}
                            style={{ width: '65px', padding: '4px', fontSize: '12.5px', fontWeight: 'bold' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={m.destinatario_name || ''} 
                            onChange={(e) => handleUpdateSalidaField(idx, 'destinatario_name', e.target.value)}
                            style={{ padding: '4px', fontSize: '12px' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={m.operator_name || ''} 
                            onChange={(e) => handleUpdateSalidaField(idx, 'operator_name', e.target.value)}
                            style={{ padding: '4px', fontSize: '12px' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={m.observations || ''} 
                            onChange={(e) => handleUpdateSalidaField(idx, 'observations', e.target.value)}
                            style={{ padding: '4px', fontSize: '12px' }}
                          />
                        </td>
                        <td>
                          <button 
                            type="button" 
                            onClick={() => handleDeleteSalida(idx)}
                            style={{ padding: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            title="Eliminar fila"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {parsedSalidas.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                          No se encontraron registros de salida en la planilla.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Acciones Finales de Importación y Cancelación */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', borderTop: '1px solid var(--border-color, #1e293b)', paddingTop: '15px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {emptyFieldsCount > 0 ? (
                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                    ❌ Hay {emptyFieldsCount} campos con errores que debes corregir antes de importar.
                  </span>
                ) : (
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                    ✔ Todo listo. Los datos están validados.
                  </span>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {!isOnline && (
                  <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '12.5px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={15} /> Servidor Offline
                  </div>
                )}

                <button
                  type="button"
                  className="sync-action-btn"
                  onClick={handleCancelPreview}
                  disabled={isImporting || isParsing}
                  style={{ background: 'transparent', border: '1px solid var(--border-color, #475569)', color: 'var(--text-muted, #94a3b8)', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <XCircle size={15} />
                  Cancelar
                </button>
                
                <button
                  className="sync-action-btn"
                  onClick={handleImport}
                  disabled={!isOnline || isImporting || isParsing || emptyFieldsCount > 0 || parsedItems.length === 0}
                  style={{ background: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <FileCheck size={16} />
                  {isImporting ? 'Procesando Importación...' : 'Confirmar e Importar al Servidor'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
