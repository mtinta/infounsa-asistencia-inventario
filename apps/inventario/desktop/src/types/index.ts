export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  category: string;
  category_id?: number;
  stock: number;
  min_stock: number;
  unit?: string;
  status: 'Activo' | 'Baja';
}

export interface InventoryMovement {
  id?: number | string;
  id_operacion_local: string;
  item_id: number;
  item_name: string;
  item_barcode: string;
  type: 'entrada' | 'salida';
  quantity: number;
  operator_name?: string;
  destinatario_name?: string | null;
  observations?: string | null;
  registered_at: string;
  sync_status?: string;
  status?: string;
  user_id?: number | null;
  area_id?: number | null;
  item_category?: string;
  item_stock?: number;
  [key: string]: unknown;
}

export interface MovementFormData {
  barcode: string;
  type: 'entrada' | 'salida';
  quantity: number;
  destinatario: string;
  operator_name?: string;
  observations: string;
  area_id?: number | null;
  registered_at?: string;
}

export interface ReportHistoryItem {
  id: string;
  name: string;
  date: string;
  user: string;
  status: string;
  url?: string;
  format?: 'pdf' | 'xlsx';
}

export type InventoryActiveTab =
  | 'dashboard'
  | 'catalog'
  | 'alerts'
  | 'movements'
  | 'excel-upload'
  | 'reports'
  | 'settings'
  | 'operators';

