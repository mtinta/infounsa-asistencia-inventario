export interface CreateInventoryItemDto {
  name: string;
  description?: string;
  barcode?: string;
  quantity?: number;
  min_stock?: number;
  unit?: string;
  category_id?: number;
  sede_id?: number;
  observation?: string;
  user_id?: number;
  [key: string]: unknown;
}

export interface UpdateInventoryItemDto {
  name?: string;
  description?: string;
  barcode?: string;
  quantity?: number;
  min_stock?: number;
  unit?: string;
  category_id?: number;
  sede_id?: number;
  observation?: string;
  user_id?: number;
  [key: string]: unknown;
}

export interface BulkImportItemDto {
  name: string;
  barcode?: string;
  category_id?: number;
  category_name?: string;
  quantity?: number;
  min_stock?: number;
  unit?: string;
  description?: string;
  sede_id?: number;
  [key: string]: unknown;
}

export interface BulkImportMovementDto {
  type: string;
  quantity: number;
  item_id?: number;
  barcode?: string;
  item_name?: string;
  unit?: string;
  reason?: string;
  source?: string;
  destination?: string;
  user_id?: number;
  destinatario_name?: string;
  receiver_name?: string;
  receiver_dni?: string;
  operator_name?: string;
  observations?: string;
  registered_at?: string | number | Date;
  created_at?: string | Date;
  [key: string]: unknown;
}

export interface BulkImportPayloadDto {
  items: BulkImportItemDto[];
  movements: BulkImportMovementDto[];
}
