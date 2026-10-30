import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockAlertService } from './stock-alert.service';
import { InventoryReportService } from './inventory-report.service';
import { CreateMovementDto } from './dto/sync-movements.dto';
import { Response } from 'express';

export interface SyncMovementItemInput {
  item_id: number;
  type: string;
  quantity: number;
  id_operacion_local?: string;
  user_id?: number | null;
  area_id?: number | null;
  destinatario_name?: string | null;
  registered_at: string;
  observations?: string | null;
}

@Injectable()
export class InventoryMovementsService {
  private readonly stockAlertService: StockAlertService;
  private readonly reportService: InventoryReportService;
  private readonly maxTransactionRetries = 3;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() stockAlertService?: StockAlertService,
    @Optional() reportService?: InventoryReportService,
  ) {
    this.stockAlertService = stockAlertService ?? new StockAlertService(prisma);
    this.reportService = reportService ?? new InventoryReportService(prisma);
  }

  private isRetryableTransactionError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const err = error as Record<string, unknown>;
    const meta = err.meta as Record<string, unknown> | undefined;
    const metaCause = meta?.cause as Record<string, unknown> | undefined;
    const cause = err.cause as Record<string, unknown> | undefined;

    const codes = [
      err.code,
      err.errno,
      meta?.code,
      metaCause?.code,
      cause?.code,
    ]
      .filter(Boolean)
      .map((value) => String(value).toUpperCase());

    if (codes.some((code) => ['P2034', '1213', '1205', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(code))) {
      return true;
    }

    return /deadlock|lock wait timeout/i.test(String(err.message || ''));
  }

  private async executeTransaction<T>(
    callback: (tx: Parameters<Parameters<PrismaService['client']['$transaction']>[0]>[0]) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxTransactionRetries; attempt++) {
      try {
        return await this.prisma.client.$transaction(callback, {
          maxWait: 5000,
          timeout: 10000,
        });
      } catch (error) {
        lastError = error;

        if (!this.isRetryableTransactionError(error) || attempt === this.maxTransactionRetries - 1) {
          throw error;
        }

        const backoffMs = 50 * 2 ** attempt + Math.floor(Math.random() * 50);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError;
  }

  /**
   * Registro atómico y transaccional de un movimiento individual de inventario.
   * Aplica bloqueo pesimista (SELECT ... FOR UPDATE) y valida stock antes del egreso.
   */
  async register(data: {
    item_id: number;
    type: 'entrada' | 'salida';
    quantity: number;
    user_id?: number;
    registered_at: string;
    id_operacion_local?: string;
    observations?: string;
    destinatario_name?: string;
    area_id?: number;
  }) {
    const { item_id, type, quantity, user_id, registered_at, id_operacion_local, observations, destinatario_name, area_id } = data;

    if (quantity <= 0) {
      throw new BadRequestException('La cantidad del movimiento debe ser mayor a cero');
    }

    try {
      return await this.executeTransaction(async (tx) => {
        /**
         * BLOQUEO PESIMISTA:
         * SELECT ... FOR UPDATE bloquea la fila del bien evitando carreras.
         */
        const result = await tx.$queryRaw<any[]>`
          SELECT id, name, quantity, min_stock FROM inventory_items WHERE id = ${item_id} FOR UPDATE
        `;

        const item = result[0];

        if (!item) {
          throw new BadRequestException('El bien especificado no existe');
        }

        const newQuantity = type === 'entrada' ? item.quantity + quantity : item.quantity - quantity;
        if (newQuantity < 0) {
          throw new BadRequestException(
            `Stock insuficiente para el bien "${item.name}". Stock actual: ${item.quantity}, solicitado: ${quantity}`,
          );
        }

        await tx.inventoryItem.update({
          where: { id: item_id },
          data: { quantity: newQuantity },
        });

        const movement = await tx.inventoryMovement.create({
          data: {
            item_id,
            type,
            quantity,
            user_id: user_id ?? null,
            area_id: area_id ?? null,
            destinatario_name: destinatario_name ?? null,
            registered_at: new Date(registered_at),
            id_operacion_local: id_operacion_local ?? null,
            observations: observations ?? null,
          },
        });

        await this.stockAlertService.applyAlert(tx, item_id, newQuantity, item.min_stock);
        return movement;
      });
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Error en la transaccion de movimiento: ${msg}`);
    }
  }

  /**
   * Transferencia atómica de stock entre áreas u orígenes/destinos.
   */
  async transfer(data: {
    item_id: number;
    quantity: number;
    from_area_id?: number;
    to_area_id?: number;
    destinatario_name?: string;
    user_id?: number;
    registered_at: string;
    observations?: string;
  }) {
    const { item_id, quantity, to_area_id, destinatario_name, user_id, registered_at, observations } = data;

    if (quantity <= 0) {
      throw new BadRequestException('La cantidad de transferencia debe ser mayor a cero');
    }

    try {
      return await this.executeTransaction(async (tx) => {
        const result = await tx.$queryRaw<any[]>`
          SELECT id, name, quantity, min_stock FROM inventory_items WHERE id = ${item_id} FOR UPDATE
        `;
        const item = result[0];

        if (!item) {
          throw new BadRequestException('El bien especificado no existe');
        }

        if (item.quantity < quantity) {
          throw new BadRequestException(
            `Stock insuficiente para transferir "${item.name}". Stock actual: ${item.quantity}, solicitado: ${quantity}`,
          );
        }

        const obs = observations
          ? `Transferencia a área ID ${to_area_id ?? 'N/A'}: ${observations}`
          : `Transferencia a área ID ${to_area_id ?? 'N/A'}`;

        const movement = await tx.inventoryMovement.create({
          data: {
            item_id,
            type: 'salida',
            quantity,
            user_id: user_id ?? null,
            area_id: to_area_id ?? null,
            destinatario_name: destinatario_name ?? null,
            registered_at: new Date(registered_at),
            observations: obs,
          },
        });

        const newQuantity = item.quantity - quantity;
        await tx.inventoryItem.update({
          where: { id: item_id },
          data: { quantity: newQuantity },
        });

        await this.stockAlertService.applyAlert(tx, item_id, newQuantity, item.min_stock);
        return movement;
      });
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Error en la transferencia de inventario: ${msg}`);
    }
  }

  /**
   * Sincronización transaccional por lotes para modo offline-first.
   * Garantiza idempotencia por id_operacion_local y ordena los ítems para prevenir deadlocks.
   */
  async sync(batch: SyncMovementItemInput[]) {
    if (!Array.isArray(batch) || batch.length > 500) {
      throw new BadRequestException('El lote debe ser un arreglo de hasta 500 registros');
    }

    const orderedBatch = [...batch].sort((left, right) => Number(left.item_id) - Number(right.item_id));
    const processedIds = new Set<string>();

    try {
      await this.executeTransaction(async (tx) => {
        for (const record of orderedBatch) {
          /**
           * IDEMPOTENCIA:
           * Si el movimiento ya fue procesado antes, se ignora para evitar doble descuento.
           */
          if (record.id_operacion_local) {
            const existing = await tx.inventoryMovement.findUnique({
              where: { id_operacion_local: record.id_operacion_local },
            });

            if (existing) {
              processedIds.add(record.id_operacion_local);
              continue;
            }
          }

          const { item_id, type, quantity, user_id, registered_at, id_operacion_local, observations, destinatario_name, area_id } = record;

          const normalizedItemId = Number(item_id);
          const normalizedQuantity = Number(quantity);

          if (!Number.isInteger(normalizedItemId) || normalizedItemId <= 0) {
            throw new BadRequestException('item_id debe ser un entero positivo');
          }

          if (!['entrada', 'salida'].includes(type) || !Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
            throw new BadRequestException('El tipo y la cantidad del movimiento no son validos');
          }

          const result = await tx.$queryRaw<any[]>`
            SELECT id, name, quantity, min_stock FROM inventory_items WHERE id = ${normalizedItemId} FOR UPDATE
          `;
          const item = result[0];

          if (!item) {
            throw new BadRequestException('El bien especificado no existe');
          }

          const currentQuantity = Number(item.quantity);
          const newQuantity = type === 'entrada' ? currentQuantity + normalizedQuantity : currentQuantity - normalizedQuantity;
          if (newQuantity < 0) {
            throw new BadRequestException(`Stock insuficiente para "${item.name}" durante la sincronizacion.`);
          }

          await tx.inventoryItem.update({
            where: { id: normalizedItemId },
            data: { quantity: newQuantity },
          });

          await tx.inventoryMovement.create({
            data: {
              item_id: normalizedItemId,
              type,
              quantity: normalizedQuantity,
              user_id: user_id ?? null,
              area_id: area_id ?? null,
              destinatario_name: destinatario_name ?? null,
              registered_at: new Date(registered_at),
              id_operacion_local: id_operacion_local ?? null,
              observations: observations ?? null,
            },
          });

          await this.stockAlertService.applyAlert(tx, normalizedItemId, newQuantity, Number(item.min_stock));

          if (id_operacion_local) {
            processedIds.add(id_operacion_local);
          }
        }
      });

      return { status: 'success', synced_count: processedIds.size, processed_local_ids: Array.from(processedIds) };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Fallo en sincronizacion de lote: ${msg}`);
    }
  }

  async updateMovementDate(id: number, registered_at: string) {
    if (!registered_at) {
      throw new BadRequestException('registered_at es requerido');
    }
    const dateObj = new Date(registered_at);
    if (isNaN(dateObj.getTime())) {
      throw new BadRequestException('Fecha inválida');
    }
    return this.prisma.client.inventoryMovement.update({
      where: { id },
      data: { registered_at: dateObj },
    });
  }

  // --- MÉTODOS DELEGADOS A INVENTORY_REPORT_SERVICE (FACADE PARA COMPATIBILIDAD) ---

  async findAll() {
    return this.reportService.findAll();
  }

  async getReports(startDate: string, endDate: string) {
    return this.reportService.getReports(startDate, endDate);
  }

  async getKardex(itemId?: number, startDate?: string, endDate?: string) {
    return this.reportService.getKardex(itemId, startDate, endDate);
  }

  async generateExcelReport(
    startDate: string,
    endDate: string,
    format: 'resumido' | 'detallado',
    res?: Response,
  ): Promise<Buffer> {
    return this.reportService.generateExcelReport(startDate, endDate, format, res);
  }

  async exportMovementsExcel(
    startDate: string,
    endDate: string,
    format: 'resumido' | 'detallado' = 'resumido',
  ): Promise<Buffer> {
    return this.reportService.exportMovementsExcel(startDate, endDate, format);
  }

  async exportMovementsPdf(
    startDate: string,
    endDate: string,
    type?: string,
  ): Promise<{ contentType: string; data: Buffer }> {
    return this.reportService.exportMovementsPdf(startDate, endDate, type);
  }

  async generatePdfStream(startDate: string, endDate: string, type?: string) {
    return this.reportService.generatePdfStream(startDate, endDate, type);
  }
}
