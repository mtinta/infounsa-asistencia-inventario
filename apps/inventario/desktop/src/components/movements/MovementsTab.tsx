import React, { useState, useEffect, useRef } from 'react';
import { InventoryItem, InventoryMovement, MovementFormData } from '../../types';
import { apiFetch, getStoredUser } from '../../utils/api';
import { useToast } from '../ui/ToastProvider';
import Tooltip from '../ui/Tooltip';
import { Search, Plus, X, User, ArrowRight, RefreshCw, Cloud, Clock, AlertCircle, Calendar } from 'lucide-react';

interface MovementsTabProps {
  movements: InventoryMovement[];
  items: InventoryItem[];
  onAddMovement: (data: MovementFormData) => Promise<void>;
  onUpdateMovementDate?: (id: number | string, newDate: string) => Promise<void>;
  isLoading: boolean;
  categories: { id: number; name: string }[];
  onAddItem: (data: {
    barcode: string;
    name: string;
    description: string;
    quantity: number;
    min_stock: number;
    unit: string;
    category_id: number;
    observation?: string;
  }) => Promise<void>;
  isOnline: boolean;
  userRole?: string;
  onVerifySync: () => Promise<void>;
  onRefreshCategories?: () => Promise<unknown>;
}

interface MovementArea {
  id: string | number;
  name: string;
  responsable?: string;
  created_at?: string;
  updated_at?: string;
}

interface MovementUser {
  id: string | number;
  username: string;
  full_name?: string;
  role?: string;
}

export default function MovementsTab({
  movements,
  items,
  onAddMovement,
  onUpdateMovementDate,
  isLoading,
  categories = [],
  onAddItem,
  isOnline = false,
  userRole: _userRole = 'administrador',
  onVerifySync,
  onRefreshCategories,
}: MovementsTabProps) {
  const { showToast } = useToast();
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const [barcode, setBarcode] = useState('');
  const [type, setType] = useState<'entrada' | 'salida'>('entrada');
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [observations, setObservations] = useState('');

  // Operation custom date/time state (defaulting to current local time)
  const [operationDate, setOperationDate] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });

  // Modal for editing existing movement date
  const [editingMovement, setEditingMovement] = useState<InventoryMovement | null>(null);
  const [editingDateValue, setEditingDateValue] = useState('');
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);

  // Area & Destinatario states
  const [areas, setAreas] = useState<MovementArea[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [newAreaName, setNewAreaName] = useState('');
  const [_responsable, setResponsable] = useState('');
  const [destinatarioPerson, setDestinatarioPerson] = useState('');
  const [customDestinatario, setCustomDestinatario] = useState('');

  // Operator / Entregado Por states
  const [usersList, setUsersList] = useState<MovementUser[]>([]);
  const [selectedOperator, setSelectedOperator] = useState<string>(() => {
    const user = getStoredUser();
    return user?.username || 'admin';
  });
  const [customOperator, setCustomOperator] = useState('');

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Search & Autocomplete
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<InventoryItem[]>([]);

  // "+ Agregar Nuevo Insumo" Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('unidad');
  const [newProductQty, setNewProductQty] = useState<number | ''>(0);
  const [newProductMinStock, setNewProductMinStock] = useState<number | ''>(5);
  const [newProductCategory, setNewProductCategory] = useState<number>(0);
  const [newProductNewCatName, setNewProductNewCatName] = useState('');
  const [newProductObs, setNewProductObs] = useState('');
  const [isAddingNewItem, setIsAddingNewItem] = useState(false);

  // Fetch areas on mount
  useEffect(() => {
    const fetchAreas = async () => {
      try {
        const res = await apiFetch('/areas');
        if (res.ok) {
          const data = await res.json();
          const loadedAreas = Array.isArray(data) ? data : (data.data || []);
          setAreas(loadedAreas);
          if (loadedAreas.length === 0) {
            setSelectedAreaId('nueva');
          }
        }
      } catch (err) {
        console.warn('Error al cargar áreas de la API:', err);
      }
    };
    fetchAreas();
  }, []);

  // Fetch registered users (operators/admins) on mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await apiFetch('/users');
        if (res.ok) {
          const data = await res.json();
          setUsersList(Array.isArray(data) ? data : (data.data || []));
        }
      } catch (err) {
        console.warn('Error al cargar usuarios de la API:', err);
      }
    };
    fetchUsers();
  }, []);

  // Filter suggestions dynamically
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredSuggestions([]);
      return;
    }
    const q = searchTerm.toLowerCase();
    const matches = items.filter(
      (it) => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q)
    );
    setFilteredSuggestions(matches.slice(0, 15));
  }, [searchTerm, items]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Synchronize validation error
  useEffect(() => {
    if (!selectedItem) {
      if (barcode.trim()) {
        setValidationError('Bien no encontrado en el catálogo.');
      } else {
        setValidationError(null);
      }
      return;
    }
    const finalQty = Number(quantity) || 1;
    if (type === 'salida' && finalQty > selectedItem.stock) {
      setValidationError(`Operación inválida: stock insuficiente (${selectedItem.stock})`);
    } else {
      setValidationError(null);
    }
  }, [type, quantity, selectedItem, barcode]);

  // Prefill responsable when area changes
  const handleAreaChange = (areaId: string) => {
    setSelectedAreaId(areaId);
    if (areaId && areaId !== 'nueva' && areaId !== 'otro') {
      const foundArea = areas.find(a => a.id.toString() === areaId);
      if (foundArea) {
        setResponsable(foundArea.responsable || '');
        if (!destinatarioPerson) {
          setDestinatarioPerson(foundArea.responsable || '');
        }
      }
    } else {
      setResponsable('');
    }
  };

  const handleSelectSuggestion = (item: InventoryItem) => {
    setSelectedItem(item);
    setBarcode(item.code);
    setSearchTerm(item.name);
    setShowSuggestions(false);
    setValidationError(null);
  };

  const handleClearSelection = () => {
    setSelectedItem(null);
    setBarcode('');
    setSearchTerm('');
    setShowSuggestions(false);
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) {
      setValidationError('Por favor, busque y seleccione un bien del catálogo.');
      return;
    }
    const finalQty = Number(quantity) || 1;
    if (type === 'salida' && finalQty > selectedItem.stock) {
      setValidationError(`Operación inválida: stock insuficiente (${selectedItem.stock})`);
      return;
    }
    if (finalQty <= 0) {
      setValidationError('La cantidad debe ser mayor a cero.');
      return;
    }

    let finalDestinatario = '';
    let finalAreaId: number | null = null;
    const finalOperator = selectedOperator === 'custom' ? customOperator.trim() : selectedOperator;

    if (!finalOperator) {
      setValidationError('Por favor ingrese o seleccione la persona que entrega.');
      return;
    }

    if (type === 'salida') {
      const recipientName = destinatarioPerson.trim();
      if (!recipientName) {
        setValidationError('Por favor ingrese el nombre de la persona que recibe el bien.');
        return;
      }

      if (selectedAreaId === 'nueva' || selectedAreaId === 'otro' || (areas.length === 0 && newAreaName.trim())) {
        const areaName = newAreaName.trim() || customDestinatario.trim();
        if (!areaName) {
          setValidationError('Por favor ingrese el nombre de la nueva área de destino.');
          return;
        }

        let areaMatch = areas.find(a => a.name.toLowerCase() === areaName.toLowerCase());
        if (!areaMatch) {
          try {
            const areaRes = await apiFetch('/areas', {
              method: 'POST',
              body: JSON.stringify({
                name: areaName,
                responsable: recipientName || null
              })
            });
            if (areaRes.ok) {
              const createdArea = await areaRes.json();
              areaMatch = createdArea;
              setAreas(prev => [...prev, createdArea]);
              setSelectedAreaId(createdArea.id.toString());
            }
          } catch (err) {
            console.warn('Error al guardar nueva área:', err);
          }
        }
        finalAreaId = areaMatch ? Number(areaMatch.id) : null;
        finalDestinatario = `${areaName} — ${recipientName}`;
      } else if (selectedAreaId && selectedAreaId !== 'nueva') {
        const area = areas.find(a => a.id.toString() === selectedAreaId);
        if (area) {
          finalAreaId = Number(area.id);
          finalDestinatario = `${area.name} — ${recipientName}`;
        } else {
          finalDestinatario = recipientName;
        }
      } else {
        setValidationError('Por favor seleccione o cree un área de destino.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onAddMovement({
        barcode,
        type,
        quantity: finalQty,
        destinatario: finalDestinatario,
        operator_name: finalOperator,
        observations,
        area_id: finalAreaId,
        registered_at: operationDate ? new Date(operationDate).toISOString() : new Date().toISOString(),
      });
      // Clear form on success
      handleClearSelection();
      setType('entrada');
      setQuantity(1);
      setSelectedAreaId(areas.length > 0 ? '' : 'nueva');
      setNewAreaName('');
      setResponsable('');
      setDestinatarioPerson('');
      setCustomDestinatario('');
      setObservations('');
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setOperationDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`);
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : 'Error al registrar el movimiento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditDate = (mv: InventoryMovement) => {
    setEditingMovement(mv);
    const dateObj = new Date(mv.registered_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    const localStr = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
    setEditingDateValue(localStr);
  };

  const handleSaveEditedDate = async () => {
    if (!editingMovement || !editingDateValue) return;
    setIsUpdatingDate(true);
    try {
      const isoDate = new Date(editingDateValue).toISOString();
      if (onUpdateMovementDate) {
        await onUpdateMovementDate(editingMovement.id || editingMovement.id_operacion_local, isoDate);
      } else {
        await apiFetch(`/inventory-movements/${editingMovement.id}/date`, {
          method: 'PATCH',
          body: JSON.stringify({ registered_at: isoDate }),
        });
        showToast('Fecha de operación actualizada correctamente', 'success');
      }
      setEditingMovement(null);
    } catch (err: unknown) {
      showToast(`Error al actualizar fecha: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setIsUpdatingDate(false);
    }
  };

  const handleCreateNewItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) {
      alert('Por favor complete el nombre del bien.');
      return;
    }

    const finalMinStock = Number(newProductMinStock) || 1;
    if (finalMinStock < 1) {
      alert('El stock mínimo debe ser de al menos 1 unidad.');
      return;
    }

    setIsAddingNewItem(true);
    try {
      let finalCategoryId = newProductCategory;
      if (newProductCategory === -1 || (newProductCategory === 0 && newProductNewCatName.trim())) {
        if (!newProductNewCatName.trim()) {
          alert('Por favor ingrese el nombre de la nueva categoría.');
          setIsAddingNewItem(false);
          return;
        }
        const catRes = await apiFetch('/categories', {
          method: 'POST',
          body: JSON.stringify({
            name: newProductNewCatName.trim(),
            description: `Categoría creada desde movimientos: ${newProductNewCatName.trim()}`
          })
        });
        if (!catRes.ok) {
          const errData = await catRes.json().catch(() => ({}));
          throw new Error(errData.message || 'Error al crear la nueva categoría.');
        }
        const createdCat = await catRes.json();
        finalCategoryId = createdCat.id;
        if (onRefreshCategories) {
          await onRefreshCategories();
        }
      } else if (finalCategoryId <= 0) {
        alert('Por favor seleccione o cree una categoría para el bien.');
        setIsAddingNewItem(false);
        return;
      }

      await onAddItem({
        barcode: '', // autogenerated in backend
        name: newProductName.trim(),
        description: 'Producto registrado desde movimientos',
        quantity: Number(newProductQty) || 0,
        min_stock: finalMinStock,
        unit: newProductUnit,
        category_id: finalCategoryId,
        observation: newProductObs.trim() || 'Creación inicial'
      });

      // Clear new item form
      setNewProductName('');
      setNewProductUnit('unidad');
      setNewProductQty(0);
      setNewProductMinStock(5);
      setNewProductCategory(categories.length > 0 ? categories[0].id : -1);
      setNewProductNewCatName('');
      setNewProductObs('');
      setShowAddModal(false);

      showToast('Nuevo insumo registrado y catalogado exitosamente', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error al catalogar nuevo bien.', 'error');
    } finally {
      setIsAddingNewItem(false);
    }
  };

  return (
    <div className="movements-tab-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="panel-header">
        <h3>Gestión de Movimientos de Almacén</h3>
      </div>

      <div className="movement-layout" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Formulario de registro (Estilizado, compacto y claro) */}
        <div className="settings-card" style={{ padding: '24px', maxWidth: '650px', width: '100%', margin: '0 auto' }}>
          <h4 style={{ borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px', marginBottom: '16px' }}>
            Registrar Operación ({type === 'entrada' ? '🟢 Ingreso' : '🔴 Egreso'})
          </h4>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

            {/* Buscador de Autocompletado */}
            <div className="form-group" style={{ gridColumn: 'span 2', position: 'relative' }} ref={suggestionsRef}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Buscar Bien / Artículo (por Nombre o Código) *
              </label>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Escriba el nombre o código del bien..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowSuggestions(true);
                      if (selectedItem && e.target.value !== selectedItem.name) {
                        setSelectedItem(null);
                        setBarcode('');
                      }
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    style={{ paddingLeft: '35px' }}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      style={{ position: 'absolute', right: '12px', top: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Casilla de Stock Separada a la derecha */}
                <Tooltip content="Existencias físicas reales en almacén actualizadas en tiempo real." position="left">
                  <div style={{ width: '140px', height: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color, #334155)', borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px 8px' }}>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Stock Disponible</span>
                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: selectedItem ? (selectedItem.stock < selectedItem.min_stock ? '#f59e0b' : '#10b981') : 'var(--text-muted)' }}>
                      {selectedItem ? `${selectedItem.stock} ${selectedItem.unit || 'uds'}` : '--'}
                    </span>
                  </div>
                </Tooltip>
              </div>

              {/* Suggestions Panel */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 150, zIndex: 100, background: 'var(--bg-main, #1e293b)', border: '1px solid var(--border-color, #334155)', borderRadius: '4px', marginTop: '4px', maxHeight: '220px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                  {filteredSuggestions.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectSuggestion(item)}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      className="suggestion-item"
                    >
                      <div>
                        <strong>{item.name}</strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '11px' }}>({item.code})</span>
                      </div>
                      <span className="badge" style={{ backgroundColor: item.stock < item.min_stock ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)', color: item.stock < item.min_stock ? '#f59e0b' : '#10b981' }}>
                        Stock: {item.stock} {item.unit || 'uds'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {selectedItem && (
                <div style={{ fontSize: '12px', color: '#60a5fa', marginTop: '8px', fontWeight: 'bold', background: 'rgba(96, 165, 250, 0.1)', padding: '6px 10px', borderRadius: '4px' }}>
                  📦 {selectedItem.name} (Código: {selectedItem.code} | Stock Actual: {selectedItem.stock} {selectedItem.unit || 'unidades'})
                </div>
              )}
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px dashed var(--border-color, #334155)' }}>
              <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                ¿El artículo no está registrado en el catálogo central?
              </span>
              <Tooltip content="Permite crear y registrar un insumo nuevo que aún no existe en el catálogo central sin salir del formulario." position="bottom">
                <button
                  type="button"
                  className="scan-btn"
                  onClick={() => setShowAddModal(true)}
                  disabled={!isOnline}
                  style={{ backgroundColor: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '12.5px' }}
                >
                  <Plus size={14} /> Catalogar Nuevo Insumo
                </button>
              </Tooltip>
            </div>

            {/* Si NO se ha seleccionado ningún producto del catálogo, mostrar mensaje orientador */}
            {!selectedItem ? (
              <div style={{ gridColumn: 'span 2', padding: '20px', background: 'rgba(255, 255, 255, 0.02)', border: '1px dashed var(--border-color, #334155)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13.5px', marginTop: '10px' }}>
                🔍 <strong>Busque y seleccione un bien del catálogo</strong> para habilitar el formulario de registro de operación.
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Tipo de Operación</label>
                  <Tooltip content="Seleccione INGRESO para recepcionar compras/donaciones o EGRESO para despachar materiales a dependencias." position="right" style={{ width: '100%' }}>
                    <select
                      className="form-input"
                      value={type}
                      onChange={(e) => setType(e.target.value as 'entrada' | 'salida')}
                      style={{ background: 'var(--bg-main, #1e293b)', padding: '8px', width: '100%' }}
                    >
                      <option value="entrada">🟢 INGRESO (Entrada)</option>
                      <option value="salida">🔴 EGRESO (Salida)</option>
                    </select>
                  </Tooltip>
                </div>

                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Cantidad *</label>
                  <Tooltip content="Cantidad de unidades físicas para este movimiento." position="top" style={{ width: '100%' }}>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      value={quantity}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') setQuantity('');
                        else {
                          const parsed = parseInt(val, 10);
                          setQuantity(isNaN(parsed) ? '' : parsed);
                        }
                      }}
                      style={{ width: '100%' }}
                      required
                    />
                  </Tooltip>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', color: '#60a5fa' }}>
                    📅 Fecha/Hora de Registro de Operación
                  </label>
                  <Tooltip content="Fecha efectiva de la transacción física. Permite regularizar operaciones realizadas fuera de turno." position="top" style={{ width: '100%' }}>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={operationDate}
                      onChange={(e) => setOperationDate(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </Tooltip>
                </div>

                {/* Campos de Destinatario y Entregador SOLO cuando el Tipo de Operación es EGRESO (Salida) */}
                {type === 'salida' && (
                  <>
                    <div className="form-group">
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Área Destino *</label>
                      <Tooltip content="Dependencia universitaria que recibe los materiales y asume la custodia del bien." position="right" style={{ width: '100%' }}>
                        <select
                          className="form-input"
                          value={selectedAreaId}
                          onChange={(e) => handleAreaChange(e.target.value)}
                          style={{ background: 'var(--bg-main, #1e293b)', padding: '8px', width: '100%' }}
                          required
                        >
                          <option value="">-- Seleccione una Área --</option>
                          {areas.map(a => (
                            <option key={a.id} value={a.id.toString()}>{a.name}</option>
                          ))}
                          <option value="nueva">➕ Crear nueva área de destino...</option>
                        </select>
                      </Tooltip>

                      {(selectedAreaId === 'nueva' || selectedAreaId === 'otro' || areas.length === 0) && (
                        <div style={{ marginTop: '8px' }}>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Nombre de la nueva área (Ej. Decanato / Laboratorio de Cómputo)"
                            value={newAreaName}
                            onChange={(e) => {
                              setNewAreaName(e.target.value);
                              setCustomDestinatario(e.target.value);
                            }}
                            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #3b82f6' }}
                            required
                          />
                        </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                        Persona Destinataria (¿A quién se le entrega?) *
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Ej. Jose Salcedo / Marlene Atamari"
                        value={destinatarioPerson}
                        onChange={(e) => setDestinatarioPerson(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                        Entregado Por (Operador de Almacén) *
                      </label>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <select
                          className="form-input"
                          value={selectedOperator}
                          onChange={(e) => setSelectedOperator(e.target.value)}
                          style={{ background: 'var(--bg-main, #1e293b)', padding: '8px', flex: 1 }}
                        >
                          <option value={getStoredUser()?.username || 'admin'}>
                            👤 {getStoredUser()?.full_name || getStoredUser()?.username || 'admin'} (Usuario en sesión)
                          </option>
                          {usersList.map((u: MovementUser) => (
                            <option key={u.id} value={u.username}>
                              👤 {u.full_name || u.username} ({u.role || 'operador'})
                            </option>
                          ))}
                          <option value="custom">✍️ Escribir otro nombre de entregador...</option>
                        </select>

                        {selectedOperator === 'custom' && (
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Escriba nombre del entregador..."
                            value={customOperator}
                            onChange={(e) => setCustomOperator(e.target.value)}
                            style={{ flex: 1 }}
                            required
                          />
                        )}
                      </div>
                    </div>
                  </>
                )}

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Observaciones</label>
                  <textarea
                    className="form-input"
                    placeholder="Detalle o justificación de la operación..."
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    style={{ resize: 'none', height: '60px' }}
                  />
                </div>

                {validationError && (
                  <div style={{ gridColumn: 'span 2', fontSize: '13px', color: '#ef4444', fontWeight: 'bold', marginTop: '4px' }}>
                    ⚠️ {validationError}
                  </div>
                )}

                <Tooltip content="Registrar la transacción en la base de datos local e iniciar sincronización." position="top" style={{ gridColumn: 'span 2' }}>
                  <button
                    type="submit"
                    className="sync-action-btn"
                    disabled={isSubmitting || isLoading || !!validationError || !selectedItem}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '10px', padding: '10px' }}
                  >
                    {isSubmitting || isLoading ? 'Registrando...' : 'Registrar Operación'}
                  </button>
                </Tooltip>
              </>
            )}
          </form>
        </div>

        {/* Historial de movimientos */}
        <div className="settings-card" style={{ padding: '24px', width: '100%' }}>
          <div style={{ borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <h4 style={{ margin: 0 }}>Historial Completo de Operaciones Recientes</h4>
            <Tooltip content="Envía las operaciones registradas offline y verifica la sincronización con el servidor central." position="left">
              <button
                type="button"
                className="sync-action-btn"
                disabled={!isOnline || isVerifying}
                onClick={async () => {
                  setIsVerifying(true);
                  try {
                    await onVerifySync();
                  } finally {
                    setIsVerifying(false);
                  }
                }}
              >
                <RefreshCw size={14} className={isVerifying ? 'spin' : ''} />
                {isVerifying ? 'Sincronizando...' : 'Sincronizar Operaciones'}
              </button>
            </Tooltip>
          </div>

          <div className="table-scroll" style={{ maxHeight: '500px' }}>
            <table className="crud-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Fecha/Hora</th>
                  <th style={{ width: '11%' }}>Tipo Operación</th>
                  <th style={{ width: '18%' }}>Bien / Artículo</th>
                  <th style={{ width: '8%' }}>Cantidad</th>
                  <th style={{ width: '13%' }}>Entregado Por</th>
                  <th style={{ width: '23%' }}>Destinatario & Observaciones</th>
                  <th style={{ width: '12%' }}>Estado servidor</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((mv) => (
                  <tr key={mv.id || mv.id_operacion_local}>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{new Date(mv.registered_at).toLocaleString('es-PE', { hour12: false })}</span>
                        <Tooltip content="Corregir la fecha y hora de la operación física para mantener la coherencia cronológica del Kardex." position="top">
                          <button
                            type="button"
                            onClick={() => handleOpenEditDate(mv)}
                            aria-label="Modificar fecha de operación"
                            style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '2px', borderRadius: '3px', display: 'inline-flex', alignItems: 'center' }}
                          >
                            <Calendar size={13} />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${mv.type === 'entrada' ? 'badge-success' : 'badge-danger'}`} style={{ backgroundColor: mv.type === 'salida' ? '#ef4444' : undefined, textTransform: 'uppercase' }}>
                        {mv.type === 'entrada' ? 'INGRESO' : 'EGRESO'}
                      </span>
                    </td>
                    <td>
                      <div className="table-cell-stack">
                        <strong>{mv.item_name || `Articulo ${mv.item_barcode}`}</strong>
                        <code style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{mv.item_barcode}</code>
                      </div>
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{mv.quantity}</td>
                    <td style={{ fontSize: '12.5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User size={13} style={{ color: 'var(--text-muted)' }} />
                        <span>{mv.operator_name || 'admin'}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: '12.5px' }}>
                      {mv.type === 'salida' && mv.destinatario_name ? (
                        <div style={{ fontWeight: 'bold', color: '#60a5fa', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <ArrowRight size={13} /> {mv.destinatario_name}
                        </div>
                      ) : null}
                      <span style={{ color: mv.observations ? 'inherit' : 'var(--text-muted)' }}>
                        {mv.observations || 'Sin observaciones'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {(() => {
                        const status = String(mv.sync_status || mv.status || 'pendiente').toLowerCase();
                        const synced = status === 'sincronizado';
                        const sending = status === 'sending' || status === 'enviando';
                        const failed = status === 'error' || status === 'fallido';
                        const Icon = synced ? Cloud : sending ? RefreshCw : failed ? AlertCircle : Clock;
                        const label = synced ? 'En servidor' : sending ? 'Enviando' : failed ? 'Error' : 'Pendiente';
                        const color = synced ? '#10b981' : sending ? '#60a5fa' : failed ? '#ef4444' : '#f59e0b';
                        const tooltipText = synced
                          ? 'Operación consolidada y confirmada en la base de datos PostgreSQL institucional.'
                          : sending
                          ? 'Transmitiendo operación al servidor central...'
                          : failed
                          ? 'Error al transmitir. Se reintentará automáticamente al restablecerse la red.'
                          : 'Operación almacenada localmente en SQLCipher. Se transmitirá en el próximo ciclo de sincronización.';

                        return (
                          <Tooltip content={tooltipText} position="left">
                            <div className="table-cell-stack">
                              <span style={{ color, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Icon size={13} /> {label}
                              </span>
                              <code style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                                {mv.id_operacion_local?.slice(0, 12)}
                              </code>
                            </div>
                          </Tooltip>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No se han registrado movimientos de inventario en el almacén local.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal - Registrar Nuevo Bien */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '500px' }}>
            <h4>Registrar y Catalogar Nuevo Bien</h4>
            <p className="modal-subtitle">
              Agregue un artículo de inventario al catálogo central y genere su código automático
            </p>

            <form onSubmit={handleCreateNewItemSubmit}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Nombre del Bien *</label>
                <input
                  type="text"
                  required
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="form-input"
                  placeholder="Ej: Archivador de Metal Oficio"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Cantidad Inicial</label>
                  <input
                    type="number"
                    value={newProductQty}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') setNewProductQty('');
                      else {
                        const parsed = parseInt(val, 10);
                        setNewProductQty(isNaN(parsed) ? '' : parsed);
                      }
                    }}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Stock Mínimo</label>
                  <input
                    type="number"
                    value={newProductMinStock}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') setNewProductMinStock('');
                      else {
                        const parsed = parseInt(val, 10);
                        setNewProductMinStock(isNaN(parsed) ? '' : parsed);
                      }
                    }}
                    className="form-input"
                  />
                </div>
                {newProductQty !== '' && newProductMinStock !== '' && Number(newProductQty) < Number(newProductMinStock) && (
                  <div style={{ gridColumn: 'span 2', color: '#f59e0b', fontSize: '12.5px', fontWeight: 'bold', marginTop: '4px', background: 'rgba(245, 158, 11, 0.1)', padding: '6px 10px', borderRadius: '4px' }}>
                    ⚠️ Advertencia: La cantidad inicial es menor al stock mínimo. El estado inicial del producto será Crítico.
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Medida (Unidad)</label>
                  <select
                    value={newProductUnit}
                    onChange={(e) => setNewProductUnit(e.target.value)}
                    className="form-input"
                    style={{ background: 'var(--bg-input)', color: 'var(--text-main)' }}
                  >
                    <option value="unidad">Unidad</option>
                    <option value="millar">Millar</option>
                    <option value="galon">Galón</option>
                    <option value="caja">Caja</option>
                    <option value="paquete">Paquete</option>
                  </select>
                </div>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Categoría *</label>
                  <select
                    value={newProductCategory}
                    onChange={(e) => setNewProductCategory(Number(e.target.value))}
                    className="form-input"
                    required
                    style={{ background: 'var(--bg-input)', color: 'var(--text-main)' }}
                  >
                    {categories.length === 0 && (
                      <option value={-1}>➕ Crear nueva categoría...</option>
                    )}
                    {categories.length > 0 && <option value={0}>Seleccionar...</option>}
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                    <option value={-1} style={{ color: '#10b981', fontWeight: 'bold' }}>
                      ➕ Crear nueva categoría...
                    </option>
                  </select>
                </div>
              </div>

              {newProductCategory === -1 && (
                <div className="form-group" style={{ marginBottom: '14px', background: 'rgba(16, 185, 129, 0.08)', padding: '10px 12px', borderRadius: '6px', border: '1px dashed #10b981' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12.5px', color: '#10b981', fontWeight: 'bold' }}>
                    Nombre de la Nueva Categoría *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: Insumos de Limpieza, Material de Escritorio..."
                    value={newProductNewCatName}
                    onChange={(e) => setNewProductNewCatName(e.target.value)}
                    required
                    autoFocus
                    style={{ background: 'var(--bg-input)', color: 'var(--text-main)', borderColor: '#10b981' }}
                  />
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Observación Inicial *</label>
                <textarea
                  required
                  value={newProductObs}
                  onChange={(e) => setNewProductObs(e.target.value)}
                  className="form-input"
                  placeholder="Escriba la observación de creación (ej: Stock inicial según inventario)"
                  style={{ height: '60px', resize: 'none' }}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowAddModal(false)}
                  disabled={isAddingNewItem}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={
                    isAddingNewItem ||
                    !newProductName.trim() ||
                    !newProductObs.trim() ||
                    (newProductCategory <= 0 && newProductCategory !== -1) ||
                    (newProductCategory === -1 && !newProductNewCatName.trim())
                  }
                >
                  {isAddingNewItem ? 'Guardando...' : 'Guardar y Catalogar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingMovement && (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="modal-box" style={{ maxWidth: '450px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="#60a5fa" /> Modificar Fecha de Operación
              </h4>
              <button
                type="button"
                onClick={() => setEditingMovement(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <p className="modal-subtitle" style={{ marginBottom: '16px' }}>
              Operación: <strong style={{ color: editingMovement.type === 'entrada' ? '#22c55e' : '#ef4444' }}>{editingMovement.type.toUpperCase()}</strong> ({editingMovement.quantity} uds de {editingMovement.item_name || `Artículo ${editingMovement.item_barcode}`})
            </p>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold' }}>
                Nueva Fecha y Hora de Registro *
              </label>
              <input
                type="datetime-local"
                className="form-input"
                value={editingDateValue}
                onChange={(e) => setEditingDateValue(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setEditingMovement(null)}
                disabled={isUpdatingDate}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-submit"
                onClick={handleSaveEditedDate}
                disabled={isUpdatingDate || !editingDateValue}
              >
                {isUpdatingDate ? 'Guardando...' : 'Guardar Fecha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
