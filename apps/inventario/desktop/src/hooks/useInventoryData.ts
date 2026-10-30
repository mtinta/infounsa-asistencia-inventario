import { useState, useEffect, useCallback } from 'react';
import { apiFetch, getStoredUser } from '../utils/api';
import {
  InventoryItem,
  InventoryMovement,
  MovementFormData,
  ReportHistoryItem,
} from '../types';
import { InventarioElectronAPI, ToastType } from '@infounsa/shared-types';

export interface UseInventoryDataParams {
  electron?: InventarioElectronAPI;
  isAuthenticated: boolean;
  isOnline: boolean;
  handleLogout: () => void;
  showToast: (msg: string, type: ToastType) => void;
  syncOutbox?: () => Promise<void>;
}

export function useInventoryData({
  electron,
  isAuthenticated,
  isOnline,
  handleLogout,
  showToast,
  syncOutbox,
}: UseInventoryDataParams) {
  const [items, setItems] = useState<InventoryItem[]>(() => {
    const cached = localStorage.getItem('inv_cached_items');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return [
      {
        id: '1',
        code: '7501055310884',
        name: 'Monitor Dell 24',
        category: 'Material de Oficina',
        stock: 10,
        min_stock: 3,
        status: 'Activo',
      },
      {
        id: '2',
        code: '7501055310990',
        name: 'Folder Manila A4',
        category: 'Escritorio',
        stock: 25,
        min_stock: 5,
        status: 'Activo',
      },
    ];
  });

  const [movements, setMovements] = useState<InventoryMovement[]>(() => {
    const cached = localStorage.getItem('inv_cached_movements');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return [];
  });

  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchCode, setSearchCode] = useState<string>('');

  // Modal de Contingencia (Teclado Numérico Táctil)
  const [showContingencyModal, setShowContingencyModal] = useState<boolean>(false);
  const [touchCode, setTouchCode] = useState<string>('');

  // Reportes y Análisis
  const [reportType, setReportType] = useState('almacen');
  const [reportStart, setReportStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [reportEnd, setReportEnd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [reportFormat, setReportFormat] = useState<'resumido' | 'detallado'>('resumido');
  const [reportDept, setReportDept] = useState('Todos los departamentos');
  const [reportCategory, setReportCategory] = useState('Equipos Informáticos');
  const [reportHistory, setReportHistory] = useState<ReportHistoryItem[]>([]);

  // 1. Cargar Categorías
  const fetchCategories = useCallback(async () => {
    try {
      const catsRes = await apiFetch('/categories', {}, handleLogout);
      if (catsRes.ok) {
        const catsData = await catsRes.json();
        setCategories(catsData);
        return catsData;
      }
    } catch (err) {
      console.warn('Error al cargar categorías:', err);
    }
  }, [handleLogout]);

  // 2. Cargar Catálogo y Movimientos desde la API central
  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    try {
      await fetchCategories();

      const itemsRes = await apiFetch('/inventory-items?limit=10000', {}, handleLogout);
      if (!itemsRes.ok) throw new Error('Error al cargar bienes');
      const itemsData = await itemsRes.json();

      const mappedItems: InventoryItem[] = (itemsData.data || []).map((ii: { id: number | string; barcode: string; name: string; description?: string; category_name?: string; category_id?: number; quantity: number; min_stock: number; unit?: string; status?: string }) => ({
        id: ii.id.toString(),
        code: ii.barcode,
        name: ii.name,
        description: ii.description || '',
        category: ii.category_name || 'Sin Categoría',
        category_id: ii.category_id || undefined,
        stock: ii.quantity,
        min_stock: ii.min_stock,
        unit: ii.unit || 'unidad',
        status: ii.status === 'activo' ? 'Activo' : 'Baja',
      }));

      setItems(mappedItems);
      localStorage.setItem('inv_cached_items', JSON.stringify(mappedItems));

      const movementsRes = await apiFetch('/inventory-movements', {}, handleLogout);
      if (!movementsRes.ok) throw new Error('Error al cargar movimientos');
      const movementsData = await movementsRes.json();

      setMovements(movementsData);
      localStorage.setItem('inv_cached_movements', JSON.stringify(movementsData));
    } catch (err) {
      console.warn('Error fetching data from server, using local cache:', err);
      const cachedItems = localStorage.getItem('inv_cached_items');
      if (cachedItems) {
        try {
          setItems(JSON.parse(cachedItems));
        } catch {}
      }
      const cachedMvs = localStorage.getItem('inv_cached_movements');
      if (cachedMvs) {
        try {
          setMovements(JSON.parse(cachedMvs));
        } catch {}
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, handleLogout, fetchCategories]);

  // Ejecutar carga inicial al autenticar
  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  // 3. Crear Bien
  const handleAddItem = async (data: {
    barcode: string;
    name: string;
    description: string;
    quantity: number;
    min_stock: number;
    unit: string;
    category_id: number;
    observation?: string;
  }) => {
    setIsLoading(true);
    try {
      const res = await apiFetch(
        '/inventory-items',
        {
          method: 'POST',
          body: JSON.stringify({
            ...data,
            sede_id: 1,
          }),
        },
        handleLogout,
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al agregar el bien al servidor central.');
      }

      const created = await res.json();
      const catName = categories.find((c) => c.id === data.category_id)?.name || 'Sin Categoría';
      const newItem: InventoryItem = {
        id: (created.id || Date.now()).toString(),
        code: created.barcode || data.barcode || '---',
        name: created.name || data.name,
        description: created.description || data.description || '',
        category: created.category_name || catName,
        category_id: created.category_id || data.category_id,
        stock: created.quantity ?? data.quantity ?? 0,
        min_stock: created.min_stock ?? data.min_stock ?? 5,
        unit: created.unit || data.unit || 'unidad',
        status: 'Activo',
      };

      setItems((prev) => [newItem, ...prev.filter((i) => i.code !== newItem.code && i.id !== newItem.id)]);
      showToast('Bien agregado exitosamente al catálogo', 'success');
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de red al agregar bien.';
      showToast(msg, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Modificar Bien
  const handleEditItem = async (
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
    },
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch(
        `/inventory-items/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...data,
            sede_id: 1,
            user_id: getStoredUser()?.id || null,
            operator_name: getStoredUser()?.username || 'admin',
          }),
        },
        handleLogout,
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al actualizar el bien en el servidor central.');
      }

      showToast('Bien actualizado exitosamente en el catálogo', 'success');
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de red al actualizar el bien.';
      showToast(msg, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Eliminar Bien
  const handleDeleteItem = async (id: string | number) => {
    setIsLoading(true);
    try {
      const res = await apiFetch(
        `/inventory-items/${id}`,
        {
          method: 'DELETE',
        },
        handleLogout,
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al eliminar el bien del servidor central.');
      }

      setItems((prev) => prev.filter((i) => i.id !== String(id)));
      showToast('Bien eliminado exitosamente del catálogo', 'success');
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar el bien.';
      showToast(msg, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // 6. Registrar Movimiento (Entrada / Salida con fallback offline)
  const handleAddMovement = async (data: MovementFormData) => {
    const barcode = data.barcode.trim();
    const destinatario = data.destinatario.trim();
    const observations = data.observations.trim();
    const foundItem = items.find((i) => i.code === barcode);
    if (!foundItem) throw new Error('El bien no existe en el catálogo local.');

    const updatedStock = data.type === 'entrada' ? foundItem.stock + data.quantity : foundItem.stock - data.quantity;
    if (updatedStock < 0) throw new Error('Stock insuficiente para esta salida.');

    const newMv: InventoryMovement = {
      id: 0,
      item_id: parseInt(foundItem.id, 10),
      type: data.type,
      quantity: data.quantity,
      user_id: getStoredUser()?.id ? Number(getStoredUser()?.id) : null,
      area_id: data.area_id || null,
      destinatario_name: destinatario || null,
      registered_at: data.registered_at || new Date().toISOString(),
      id_operacion_local: crypto.randomUUID(),
      observations,
      item_name: foundItem.name,
      item_barcode: barcode,
      item_category: foundItem.category || '',
      item_stock: updatedStock,
      operator_name: data.operator_name || getStoredUser()?.username || 'admin',
      sync_status: 'pendiente',
    };

    const updatedItems = items.map((i) => (i.id === foundItem.id ? { ...i, stock: updatedStock } : i));
    setItems(updatedItems);
    localStorage.setItem('inv_cached_items', JSON.stringify(updatedItems));

    if (electron?.registerMovement) {
      try {
        const state = await electron.registerMovement(newMv);
        if (state && typeof state === 'object' && 'movements' in state && Array.isArray((state as { movements: unknown }).movements)) {
          setMovements((state as { movements: InventoryMovement[] }).movements);
        }
        showToast('Movimiento registrado localmente', 'success');
      } catch (err: unknown) {
        setItems(items);
        localStorage.setItem('inv_cached_items', JSON.stringify(items));
        const msg = err instanceof Error ? err.message : 'Error al registrar movimiento localmente';
        showToast(`Error al guardar localmente: ${msg}`, 'error');
        throw err;
      }
    } else {
      const updatedMovements = [newMv, ...movements];
      setMovements(updatedMovements);
      localStorage.setItem('inv_cached_movements', JSON.stringify(updatedMovements));

      const outbox = JSON.parse(localStorage.getItem('inv_outbox') || '[]');
      outbox.push(newMv);
      localStorage.setItem('inv_outbox', JSON.stringify(outbox));
    }

    if (isOnline && syncOutbox) {
      try {
        await syncOutbox();
      } catch (err) {
        console.warn('Fallo al sincronizar inmediatamente:', err);
      }
    }
  };

  // 7. Modificar fecha de movimiento
  const handleUpdateMovementDate = async (id: number | string, newDate: string) => {
    try {
      const numericId = typeof id === 'number' ? id : parseInt(id, 10);
      if (!isNaN(numericId) && isOnline) {
        await apiFetch(
          `/inventory-movements/${numericId}/date`,
          {
            method: 'PATCH',
            body: JSON.stringify({ registered_at: newDate }),
          },
          handleLogout,
        );
      }
      const updated = movements.map((m) =>
        m.id === id || m.id_operacion_local === String(id) ? { ...m, registered_at: newDate } : m,
      );
      setMovements(updated);
      localStorage.setItem('inv_cached_movements', JSON.stringify(updated));
      showToast('Fecha de operación actualizada exitosamente', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Error al actualizar fecha: ${msg}`, 'error');
      throw err;
    }
  };

  // 8. Búsquedas y Filtros
  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCode.trim()) return;
    const term = searchCode.trim().toLowerCase();
    const matches = items.filter(
      (i) => i.code.toLowerCase().includes(term) || i.name.toLowerCase().includes(term),
    );
    if (matches.length > 0) {
      showToast(`Se encontraron ${matches.length} coincidencia(s) en el catálogo.`, 'success');
    } else {
      showToast('No se encontraron bienes con ese código o nombre.', 'error');
    }
  };

  const handleContingencySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!touchCode.trim()) return;
    const found = items.find((i) => i.code === touchCode || i.id === touchCode);
    if (found) {
      showToast(`Encontrado táctil: ${found.name}`, 'success');
    } else {
      showToast('Código ingresado no registrado', 'error');
    }
    setShowContingencyModal(false);
    setTouchCode('');
  };

  const getFilteredItems = () => {
    if (!searchCode.trim()) return items;
    const term = searchCode.trim().toLowerCase();
    return items.filter(
      (i) => i.code.toLowerCase().includes(term) || i.name.toLowerCase().includes(term),
    );
  };

  // 9. Reportes
  const handleGenerateReportLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      let endpoint = '';
      let reportName = '';

      if (reportType === 'almacen') {
        endpoint = `/inventory-items/report/almacen-pdf?startDate=${reportStart}&endDate=${reportEnd}`;
        reportName = `Reporte_Almacen_INFOUNSA_${reportStart}_al_${reportEnd}.pdf`;
      } else if (reportType === 'cargo') {
        endpoint = '/inventory-items/report/cargo-pdf';
        reportName = `Cargo_Estado_Inventario_${new Date().toISOString().split('T')[0]}.pdf`;
      } else {
        endpoint = `/inventory-movements/report/pdf?startDate=${reportStart}&endDate=${reportEnd}&type=${reportFormat}`;
        reportName = `Inventario_${reportFormat}_${reportStart}_al_${reportEnd}.pdf`;
      }

      const response = await apiFetch(
        endpoint,
        { method: 'GET', headers: { Accept: 'application/pdf' } },
        handleLogout,
      );
      if (!response.ok) {
        throw new Error('La API no pudo generar el reporte PDF.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const newReport: ReportHistoryItem = {
        id: `INV-${Date.now()}`,
        name: reportName,
        date: new Date().toLocaleString('es-PE'),
        user: getStoredUser()?.username || 'Sistema',
        status: 'Completado',
        url,
        format: 'pdf',
      };
      setReportHistory((prev) => [newReport, ...prev]);
      showToast('Reporte PDF generado con éxito.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar el reporte PDF.';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportExcel = async () => {
    setIsLoading(true);
    try {
      let endpoint = '';
      let fileName = '';

      if (reportType === 'almacen') {
        endpoint = `/inventory-items/report/almacen-excel?startDate=${reportStart}&endDate=${reportEnd}`;
        fileName = `Reporte_Almacen_INFOUNSA_${reportStart}_al_${reportEnd}.xlsx`;
      } else if (reportType === 'cargo') {
        endpoint = '/inventory-items/report/cargo-excel';
        fileName = `Cargo_Estado_Inventario_${new Date().toISOString().split('T')[0]}.xlsx`;
      } else {
        endpoint = `/inventory-movements/report/excel?startDate=${reportStart}&endDate=${reportEnd}&type=${reportFormat}`;
        fileName = `Reporte_Movimientos_${reportFormat}_${reportStart}_al_${reportEnd}.xlsx`;
      }

      const response = await apiFetch(
        endpoint,
        { method: 'GET', headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } },
        handleLogout,
      );
      if (!response.ok) {
        throw new Error('La API no pudo generar el reporte Excel.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      showToast('Reporte Excel exportado con éxito.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo exportar el reporte Excel.';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewReport = (report: ReportHistoryItem) => {
    if (!report.url) {
      showToast('Este reporte no tiene un archivo local disponible.', 'error');
      return;
    }
    window.open(report.url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadReport = (report: ReportHistoryItem) => {
    if (!report.url) {
      showToast('Este reporte no tiene un archivo local disponible.', 'error');
      return;
    }

    const link = document.createElement('a');
    link.href = report.url;
    link.download = report.name;
    link.click();
  };

  return {
    items,
    setItems,
    movements,
    setMovements,
    categories,
    setCategories,
    isLoading,
    setIsLoading,
    searchCode,
    setSearchCode,
    showContingencyModal,
    setShowContingencyModal,
    touchCode,
    setTouchCode,
    reportType,
    setReportType,
    reportStart,
    setReportStart,
    reportEnd,
    setReportEnd,
    reportFormat,
    setReportFormat,
    reportDept,
    setReportDept,
    reportCategory,
    setReportCategory,
    reportHistory,
    setReportHistory,
    fetchCategories,
    fetchData,
    handleAddItem,
    handleEditItem,
    handleDeleteItem,
    handleAddMovement,
    handleUpdateMovementDate,
    handleManualSearch,
    handleContingencySubmit,
    getFilteredItems,
    handleGenerateReportLocal,
    handleExportExcel,
    handleViewReport,
    handleDownloadReport,
  };
}
