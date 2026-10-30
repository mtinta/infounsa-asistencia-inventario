import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LowStockAlertItem {
  itemId: number;
  itemName: string;
  barcode: string;
  currentStock: number;
  minStock: number;
  deficiency: number;
}

export interface PrismaAlertTransactionClient {
  alert: {
    upsert(args: {
      where: { item_id: number };
      update: { resolved_at: null; triggered_at: Date };
      create: { item_id: number; triggered_at: Date };
    }): Promise<unknown>;
    updateMany(args: {
      where: { item_id: number; resolved_at: null };
      data: { resolved_at: Date };
    }): Promise<unknown>;
  };
}

@Injectable()
export class StockAlertService {
  private readonly logger = new Logger(StockAlertService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Monitorea y actualiza el estado de alerta dentro de una transacción activa o contexto Prisma.
   * Si newQuantity < minStock, dispara una alerta (upsert con resolved_at = null).
   * Si newQuantity >= minStock, resuelve las alertas pendientes (resolved_at = now).
   */
  async applyAlert(
    tx: PrismaAlertTransactionClient,
    itemId: number,
    newQuantity: number,
    minStock: number,
  ): Promise<void> {
    if (newQuantity < minStock) {
      this.logger.warn(`Alerta de stock mínimo alcanzada para el ítem ${itemId}: stock actual ${newQuantity}, mínimo ${minStock}`);
      await tx.alert.upsert({
        where: { item_id: itemId },
        update: { resolved_at: null, triggered_at: new Date() },
        create: { item_id: itemId, triggered_at: new Date() },
      });
      return;
    }

    await tx.alert.updateMany({
      where: { item_id: itemId, resolved_at: null },
      data: { resolved_at: new Date() },
    });
  }

  /**
   * Obtiene todas las alertas activas con los datos del ítem correspondiente.
   */
  async getActiveAlerts() {
    return this.prisma.client.alert.findMany({
      where: { resolved_at: null },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            barcode: true,
            quantity: true,
            min_stock: true,
            unit: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { triggered_at: 'desc' },
    });
  }

  /**
   * Monitorea todos los ítems activos y retorna la lista de aquellos con stock por debajo del mínimo.
   */
  async checkLowStockProducts(): Promise<LowStockAlertItem[]> {
    const rawItems = await this.prisma.client.inventoryItem.findMany({
      where: { status: 'activo' },
      select: {
        id: true,
        name: true,
        barcode: true,
        quantity: true,
        min_stock: true,
      },
    });

    const lowStockItems = rawItems.filter((item) => item.quantity < item.min_stock);

    return lowStockItems.map((item) => ({
      itemId: item.id,
      itemName: item.name,
      barcode: item.barcode,
      currentStock: item.quantity,
      minStock: item.min_stock,
      deficiency: item.min_stock - item.quantity,
    }));
  }

  /**
   * Sincroniza y evalúa todos los umbrales de stock en lote.
   */
  async monitorAndSyncThresholds(): Promise<{ triggered: number; resolved: number }> {
    const items = await this.prisma.client.inventoryItem.findMany({
      select: { id: true, quantity: true, min_stock: true },
    });

    let triggered = 0;
    let resolved = 0;

    for (const item of items) {
      if (item.quantity < item.min_stock) {
        await this.prisma.client.alert.upsert({
          where: { item_id: item.id },
          update: { resolved_at: null, triggered_at: new Date() },
          create: { item_id: item.id, triggered_at: new Date() },
        });
        triggered++;
      } else {
        const result = await this.prisma.client.alert.updateMany({
          where: { item_id: item.id, resolved_at: null },
          data: { resolved_at: new Date() },
        });
        if (result.count > 0) {
          resolved += result.count;
        }
      }
    }

    return { triggered, resolved };
  }

  /**
   * Marca como resuelta la alerta de un ítem de forma explícita.
   */
  async resolveAlert(itemId: number) {
    return this.prisma.client.alert.updateMany({
      where: { item_id: itemId, resolved_at: null },
      data: { resolved_at: new Date() },
    });
  }
}
