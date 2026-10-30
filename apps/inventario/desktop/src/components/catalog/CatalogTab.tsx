import { useState, useEffect } from 'react';
import { InventoryItem, InventoryMovement } from '../../types';
import { MessageSquare, Trash2, Edit, X } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import Tooltip from '../ui/Tooltip';

interface CatalogTabProps {
  searchCode: string;
  setSearchCode: (v: string) => void;
  handleManualSearch: (e: React.FormEvent) => void;
  isLoading: boolean;
  getFilteredItems: () => InventoryItem[];
  categories: { id: number; name: string }[];
  onAddItem: (data: {
    barcode: string;
    name: string;
    description: string;
    quantity: number;
    min_stock: number;
    unit: string;
    category_id: number;
  }) => Promise<void>;
  onEditItem: (
    id: string | number,
    data: {
      barcode: string;
      name: string;
      description: string;
      quantity: number;
      min_stock: number;
      unit: string;
      category_id: number;
      status?: string;
    }
  ) => Promise<void>;
  onDeleteItem?: (id: string | number) => Promise<void>;
  isOnline: boolean;
  userRole?: string | null;
  movements: InventoryMovement[];
  onRefreshCategories?: () => Promise<any>;
}

export default function CatalogTab({
  searchCode,
  setSearchCode,
  handleManualSearch,
  isLoading,
  getFilteredItems,
  categories,
  onAddItem,
  onEditItem,
  onDeleteItem,
  isOnline,
  userRole: _userRole,
  movements = [],
  onRefreshCategories,
}: CatalogTabProps) {
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  
  // Item delete confirmation state
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add/Edit item form state
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState<number | ''>(0);
  const [minStock, setMinStock] = useState<number | ''>(5);
  const [unit, setUnit] = useState('unidad');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Category & Stock filter state
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'critical' | 'normal'>('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  // Observations log modal state
  const [selectedLogItem, setSelectedLogItem] = useState<InventoryItem | null>(null);

  const handleOpenAddModal = () => {
    setEditingItem(null);
    setBarcode('');
    setName('');
    setDescription('');
    setQuantity(0);
    setMinStock(5);
    setUnit('unidad');
    setCategoryId(categories.length > 0 ? categories[0].id : -1);
    setNewCategoryName('');
    setShowModal(true);
  };

  const handleOpenEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setBarcode(item.code || '');
    setName(item.name || '');
    setDescription(item.description || '');
    setQuantity(item.stock ?? 0);
    setMinStock(item.min_stock ?? 5);
    setUnit(item.unit || 'unidad');
    
    let catId = item.category_id || 0;
    if (!catId && item.category) {
      const match = categories.find(
        (c) => c.name.toLowerCase() === item.category.toLowerCase()
      );
      if (match) catId = match.id;
    }
    setCategoryId(catId || (categories.length > 0 ? categories[0].id : 0));
    setNewCategoryName('');
    setShowModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete || !onDeleteItem) return;
    setIsDeleting(true);
    try {
      await onDeleteItem(itemToDelete.id);
      setItemToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar el bien';
      alert(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Por favor complete el nombre del bien.');
      return;
    }

    const finalMinStock = Number(minStock) || 1;
    if (finalMinStock < 1) {
      alert('El stock mínimo debe ser de al menos 1 unidad.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalCategoryId = categoryId;
      if (categoryId === -1 || (categoryId === 0 && newCategoryName.trim())) {
        if (!newCategoryName.trim()) {
          alert('Por favor ingrese el nombre de la nueva categoría.');
          setIsSubmitting(false);
          return;
        }
        const catRes = await apiFetch('/categories', {
          method: 'POST',
          body: JSON.stringify({
            name: newCategoryName.trim(),
            description: `Categoría creada desde catálogo: ${newCategoryName.trim()}`
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
        setIsSubmitting(false);
        return;
      }

      if (editingItem) {
        // Modificar bien existente (mantiene el mismo id sin duplicar)
        await onEditItem(editingItem.id, {
          barcode: barcode.trim(),
          name: name.trim(),
          description: description.trim(),
          quantity: Number(quantity) || 0,
          min_stock: finalMinStock,
          unit,
          category_id: finalCategoryId,
          status: editingItem.status === 'Baja' ? 'inactivo' : 'activo'
        });
      } else {
        // Agregar nuevo bien
        await onAddItem({
          barcode: barcode.trim(),
          name: name.trim(),
          description: description.trim(),
          quantity: Number(quantity) || 0,
          min_stock: finalMinStock,
          unit,
          category_id: finalCategoryId,
        });
      }

      setShowModal(false);
      setEditingItem(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el bien';
      alert(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter movements for the selected log item
  const itemMovements = selectedLogItem
    ? movements.filter(
        (m) =>
          (m.item_id && m.item_id.toString() === selectedLogItem.id) ||
          (m.item_barcode && m.item_barcode.toLowerCase() === selectedLogItem.code.toLowerCase())
      ).sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime())
    : [];

  const isCriticalStock = (stock: number, minStock: number) => {
    return stock < minStock;
  };

  const filteredCatalogItems = getFilteredItems().filter((item) => {
    if (categoryFilter !== 'all') {
      const matchCat =
        item.category_id === categoryFilter ||
        (item.category && categories.find((c) => c.id === categoryFilter)?.name.toLowerCase() === item.category.toLowerCase());
      if (!matchCat) return false;
    }
    if (stockFilter === 'critical') {
      if (!isCriticalStock(item.stock, item.min_stock)) return false;
    } else if (stockFilter === 'normal') {
      if (isCriticalStock(item.stock, item.min_stock)) return false;
    }
    return true;
  });

  // Reset to first page when search filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchCode, categoryFilter, stockFilter]);

  const totalItems = filteredCatalogItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedCatalogItems = filteredCatalogItems.slice(startIndex, startIndex + pageSize);

  return (
    <div>
      <div className="panel-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <h3>Catálogo de Bienes</h3>
        <form className="barcode-form" onSubmit={handleManualSearch} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Tooltip content="Buscar insumos por denominación o código de barras." position="bottom">
            <input
              type="text"
              className="scan-input"
              placeholder="Escanear o buscar por código o nombre..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              style={{ minWidth: '220px' }}
            />
          </Tooltip>

          <Tooltip content="Filtrar el catálogo por categoría de insumos o materiales." position="bottom">
            <select
              className="form-input"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              style={{ padding: '8px 12px', fontSize: '13px', background: 'var(--bg-main)', minWidth: '150px' }}
            >
              <option value="all">Todas las categorías</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </Tooltip>

          <Tooltip content="Filtrar por nivel de existencias (todos, stock crítico o normal)." position="bottom">
            <select
              className="form-input"
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as 'all' | 'critical' | 'normal')}
              style={{ padding: '8px 12px', fontSize: '13px', background: 'var(--bg-main)', minWidth: '130px' }}
            >
              <option value="all">Todo el stock</option>
              <option value="critical">⚠️ Solo Crítico</option>
              <option value="normal">✅ Stock Normal</option>
            </select>
          </Tooltip>

          <Tooltip content="Ejecutar búsqueda manual por código o texto." position="bottom">
            <button type="submit" className="scan-btn">Buscar</button>
          </Tooltip>

          <Tooltip content="Restablecer los filtros de búsqueda y categoría." position="bottom">
            <button
              type="button"
              className="scan-btn"
              onClick={() => {
                setSearchCode('');
                setCategoryFilter('all');
                setStockFilter('all');
              }}
              style={{ backgroundColor: '#64748b' }}
            >
              Limpiar
            </button>
          </Tooltip>

          <Tooltip content="Registrar un nuevo artículo en el catálogo con su respectivo código, categoría y umbral mínimo." position="bottom">
            <button
              type="button"
              className="scan-btn"
              onClick={handleOpenAddModal}
              style={{ backgroundColor: '#10b981' }}
            >
              + Agregar Bien
            </button>
          </Tooltip>
        </form>
      </div>

      {isLoading ? (
        <div>
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : (
        <>
          <div className="table-scroll">
          <table className="crud-table">
            <thead>
              <tr>
                <th style={{ width: '12%' }}>Código EAN</th>
                <th style={{ width: '28%' }}>Producto</th>
                <th style={{ width: '15%' }}>Categoría</th>
                <th style={{ width: '10%' }}>Medida</th>
                <th style={{ width: '11%' }}>Stock</th>
                <th style={{ width: '9%' }}>Estado</th>
                <th style={{ width: '5%' }}>Obs.</th>
                <th style={{ width: '10%' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCatalogItems.map((item) => {
                const isCritical = isCriticalStock(item.stock, item.min_stock);

                return (
                  <tr key={item.id} style={{ background: isCritical ? 'rgba(245, 158, 11, 0.03)' : undefined }}>
                    <td>
                      <code>{item.code}</code>
                    </td>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>
                      {item.category || '--'}
                    </td>
                    <td>
                      {item.unit || 'unidad'}
                    </td>
                    <td>
                      <span style={{ fontWeight: 'bold', color: isCritical ? '#f59e0b' : 'inherit' }}>
                        {item.stock}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                        (Mín: {item.min_stock ?? 5})
                      </span>
                    </td>
                    <td>
                      <Tooltip
                        content={
                          isCritical
                            ? 'Nivel de existencias bajo el mínimo requerido. Requiere reposición urgente.'
                            : 'Nivel de existencias saludable dentro de los límites operativos.'
                        }
                        position="right"
                      >
                        <span
                          className={`badge ${isCritical ? 'badge-pending' : 'badge-success'}`}
                          style={{
                            backgroundColor: isCritical ? '#f59e0b' : undefined,
                            color: isCritical ? '#1e293b' : undefined,
                            fontWeight: 'bold',
                            cursor: 'default',
                          }}
                        >
                          {isCritical ? 'CRÍTICO' : 'ACTIVO'}
                        </span>
                      </Tooltip>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Tooltip content="Ver o agregar notas históricas, números de serie y observaciones del bien." position="top">
                        <button
                          className="action-btn"
                          onClick={() => setSelectedLogItem(item)}
                          style={{ padding: '6px 8px', background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                          aria-label="Ver comentarios y observaciones"
                        >
                          <MessageSquare size={14} />
                        </button>
                      </Tooltip>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <Tooltip content="Abrir ventana de modificación de denominación, categoría, unidad de medida y stock mínimo." position="top">
                          <button
                            className="action-btn"
                            onClick={() => handleOpenEditModal(item)}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px', width: '30px', height: '30px', borderRadius: '4px', background: 'rgba(96, 165, 250, 0.12)', color: '#60a5fa', border: 'none', cursor: 'pointer' }}
                            aria-label="Modificar bien completo"
                          >
                            <Edit size={14} />
                          </button>
                        </Tooltip>
                        {onDeleteItem && (
                          <Tooltip content="Dar de baja este artículo del catálogo (no se permitirá si posee movimientos asociados)." position="top">
                            <button
                              className="action-btn out"
                              onClick={() => setItemToDelete(item)}
                              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px', width: '30px', height: '30px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: 'none', cursor: 'pointer' }}
                              aria-label="Eliminar bien del catálogo"
                            >
                              <Trash2 size={14} />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredCatalogItems.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '20px' }}>
                    No se encontraron bienes con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalItems > 0 && (
          <div
            className="pagination-controls"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '12px 16px',
              borderTop: '1px solid var(--border-color, #334155)',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '0 0 8px 8px',
              fontSize: '13px',
              color: 'var(--text-muted)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>
                Mostrando{' '}
                <strong style={{ color: 'var(--text-main, #f8fafc)' }}>
                  {totalItems === 0 ? 0 : startIndex + 1}
                </strong>{' '}
                -{' '}
                <strong style={{ color: 'var(--text-main, #f8fafc)' }}>
                  {Math.min(startIndex + pageSize, totalItems)}
                </strong>{' '}
                de <strong style={{ color: 'var(--text-main, #f8fafc)' }}>{totalItems}</strong> bienes
              </span>
              <span style={{ margin: '0 4px', color: 'var(--border-color, #334155)' }}>|</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="form-input"
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    borderRadius: '4px',
                    background: 'var(--bg-main, #0f172a)',
                    border: '1px solid var(--border-color, #334155)',
                    color: 'inherit',
                  }}
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tooltip content="Ir a la página anterior de resultados" position="top">
                <button
                  type="button"
                  className="scan-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: safeCurrentPage <= 1 ? 'rgba(51, 65, 85, 0.4)' : '#334155',
                    color: safeCurrentPage <= 1 ? '#64748b' : '#f8fafc',
                    cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  ◀ Anterior
                </button>
              </Tooltip>

              <span style={{ fontSize: '12.5px', fontWeight: 500, padding: '0 4px' }}>
                Página <strong style={{ color: '#60a5fa' }}>{safeCurrentPage}</strong> de{' '}
                <strong>{totalPages}</strong>
              </span>

              <Tooltip content="Ir a la página siguiente de resultados" position="top">
                <button
                  type="button"
                  className="scan-btn"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: safeCurrentPage >= totalPages ? 'rgba(51, 65, 85, 0.4)' : '#334155',
                    color: safeCurrentPage >= totalPages ? '#64748b' : '#f8fafc',
                    cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Siguiente ▶
                </button>
              </Tooltip>
            </div>
          </div>
        )}
      </>
      )}

      {/* Modal - Registrar / Modificar Bien */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '500px' }}>
            <h4>{editingItem ? 'Modificar Bien del Catálogo' : 'Registrar Nuevo Bien'}</h4>
            <p className="modal-subtitle">
              {editingItem ? `Actualizando: ${editingItem.name}` : 'Agregue un artículo de inventario al catálogo central'}
            </p>
            
            {!isOnline && (
              <div style={{ padding: '10px', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '15px', fontSize: '13px' }}>
                ⚠️ <strong>Modo Offline:</strong> Debe estar conectado al servidor central para modificar bienes en el catálogo.
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Código de Barras (Opcional)</label>
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))}
                  className="form-input"
                  placeholder="Ej: 0000001 (dejar vacío para autogenerar)"
                  disabled={!isOnline}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Nombre del Bien *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-input"
                  placeholder="Ej: Teclado Mecánico RGB"
                  disabled={!isOnline}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Descripción</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="form-input"
                  placeholder="Breve descripción del bien..."
                  style={{ height: '60px', resize: 'none' }}
                  disabled={!isOnline}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>{editingItem ? 'Stock / Cantidad' : 'Cantidad Inicial'}</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') setQuantity('');
                      else {
                        const parsed = parseInt(val, 10);
                        setQuantity(isNaN(parsed) ? '' : parsed);
                      }
                    }}
                    className="form-input"
                    disabled={!isOnline}
                  />
                </div>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Stock Mínimo</label>
                  <input
                    type="number"
                    value={minStock}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') setMinStock('');
                      else {
                        const parsed = parseInt(val, 10);
                        setMinStock(isNaN(parsed) ? '' : parsed);
                      }
                    }}
                    className="form-input"
                    disabled={!isOnline}
                  />
                </div>
                {quantity !== '' && minStock !== '' && Number(quantity) < Number(minStock) && (
                  <div style={{ gridColumn: 'span 2', color: '#f59e0b', fontSize: '12.5px', fontWeight: 'bold', marginTop: '4px', background: 'rgba(245, 158, 11, 0.1)', padding: '6px 10px', borderRadius: '4px' }}>
                    ⚠️ Advertencia: La cantidad es menor al stock mínimo. El estado del producto será Crítico.
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Unidad de Medida</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="form-input"
                    disabled={!isOnline}
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
                    value={categoryId}
                    onChange={(e) => setCategoryId(Number(e.target.value))}
                    className="form-input"
                    required
                    disabled={!isOnline}
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

              {categoryId === -1 && (
                <div className="form-group" style={{ marginBottom: '14px', background: 'rgba(16, 185, 129, 0.08)', padding: '10px 12px', borderRadius: '6px', border: '1px dashed #10b981' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12.5px', color: '#10b981', fontWeight: 'bold' }}>
                    Nombre de la Nueva Categoría *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: Material de Limpieza, Equipos de Cómputo..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    required
                    autoFocus
                    disabled={!isOnline}
                    style={{ background: 'var(--bg-input)', color: 'var(--text-main)', borderColor: '#10b981' }}
                  />
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setShowModal(false);
                    setEditingItem(null);
                  }}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={
                    !isOnline ||
                    isSubmitting ||
                    !name.trim() ||
                    (categoryId <= 0 && categoryId !== -1) ||
                    (categoryId === -1 && !newCategoryName.trim())
                  }
                >
                  {isSubmitting ? 'Guardando...' : (editingItem ? 'Guardar Cambios' : 'Guardar Bien')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Confirmación de Eliminación */}
      {itemToDelete && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '440px', borderTop: '4px solid #ef4444' }}>
            <h4 style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 8px 0' }}>
              <Trash2 size={20} /> Eliminar Bien del Catálogo
            </h4>
            <p className="modal-subtitle" style={{ marginBottom: '12px' }}>
              ¿Está seguro que desea eliminar permanentemente este bien del catálogo central?
            </p>
            <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '16px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text-main)' }}>{itemToDelete.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Código: <code>{itemToDelete.code}</code> | Stock: {itemToDelete.stock} {itemToDelete.unit}</div>
            </div>
            <p style={{ fontSize: '12px', color: '#f87171', margin: '0 0 16px 0' }}>
              ⚠️ Esta acción eliminará el bien y sus registros asociados del sistema central.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setItemToDelete(null)}
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                style={{ backgroundColor: '#ef4444', color: '#ffffff', padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {isDeleting ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Historial de Observaciones */}
      {selectedLogItem && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '650px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>
              <h4 style={{ margin: 0 }}>Historial de Observaciones y Comentarios</h4>
              <button
                onClick={() => setSelectedLogItem(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <strong>Artículo: </strong>
              <span style={{ color: '#60a5fa' }}>{selectedLogItem.name}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: '10px', fontSize: '12px' }}>({selectedLogItem.code})</span>
            </div>

            <div className="table-scroll" style={{ maxHeight: '350px' }}>
              <table className="crud-table mini-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>Fecha / Hora</th>
                    <th style={{ width: '18%' }}>Operación</th>
                    <th style={{ width: '40%' }}>Comentario / Observación</th>
                    <th style={{ width: '20%' }}>Operador</th>
                  </tr>
                </thead>
                <tbody>
                  {itemMovements.map((m, idx) => {
                    const obsStr = m.observations ?? '';
                    const isCreation = obsStr.startsWith('[Creación]');
                    const isUpdate = obsStr.startsWith('[Actualización]');
                    
                    const cleanObs = isCreation 
                      ? obsStr.replace('[Creación]', '').trim() 
                      : isUpdate
                        ? obsStr.replace('[Actualización]', '').trim()
                        : obsStr || 'Sin observaciones';

                    let opText = 'INGRESO';
                    let opColor = '#10b981'; // green
                    let bgRgba = '16,185,129';
                    
                    if (isCreation) {
                      opText = 'CREACIÓN';
                      opColor = '#60a5fa'; // blue
                      bgRgba = '96,165,250';
                    } else if (isUpdate) {
                      opText = 'ACTUALIZACIÓN';
                      opColor = '#f59e0b'; // orange
                      bgRgba = '245,158,11';
                    } else if (m.type === 'salida') {
                      opText = 'SALIDA';
                      opColor = '#ef4444'; // red
                      bgRgba = '239,68,68';
                    }

                    let formattedObs = cleanObs;
                    if (!isCreation && !isUpdate && m.quantity) {
                      const prefix = m.type === 'salida' ? `(-${m.quantity})` : `(+${m.quantity})`;
                      formattedObs = cleanObs ? `${prefix} ${cleanObs}` : prefix;
                    }

                    return (
                      <tr key={m.id || idx}>
                        <td style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          {new Date(m.registered_at).toLocaleString('es-PE', { hour12: false })}
                        </td>
                        <td>
                          <span className="badge" style={{ backgroundColor: `rgba(${bgRgba}, 0.2)`, color: opColor, fontWeight: 'bold', fontSize: '10.5px' }}>
                            {opText}
                          </span>
                        </td>
                        <td style={{ fontSize: '12.5px' }}>
                          {formattedObs}
                          {m.type === 'salida' && m.destinatario_name && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Destinatario: <strong>{m.destinatario_name}</strong>
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: '12px' }}>{m.operator_name || 'admin'}</td>
                      </tr>
                    );
                  })}
                  {itemMovements.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                        No se registran observaciones ni movimientos históricos para este artículo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '15px' }}>
              <button
                className="btn-cancel"
                onClick={() => setSelectedLogItem(null)}
                style={{ padding: '8px 16px' }}
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
