import { StockAlertService, PrismaAlertTransactionClient } from './stock-alert.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StockAlertService', () => {
  let service: StockAlertService;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      alert: {
        upsert: jest.fn().mockResolvedValue({ id: 1, item_id: 10 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockPrisma = {
      client: {
        alert: {
          findMany: jest.fn(),
          updateMany: jest.fn(),
          upsert: jest.fn(),
        },
        inventoryItem: {
          findMany: jest.fn(),
        },
      },
    };

    service = new StockAlertService(mockPrisma);
  });

  describe('applyAlert', () => {
    it('debería registrar una alerta activa cuando newQuantity < minStock', async () => {
      await service.applyAlert(mockTx, 5, 2, 10);

      expect(mockTx.alert.upsert).toHaveBeenCalledWith({
        where: { item_id: 5 },
        update: expect.objectContaining({ resolved_at: null }),
        create: expect.objectContaining({ item_id: 5 }),
      });
      expect(mockTx.alert.updateMany).not.toHaveBeenCalled();
    });

    it('debería resolver la alerta activa cuando newQuantity >= minStock', async () => {
      await service.applyAlert(mockTx, 5, 10, 10);

      expect(mockTx.alert.updateMany).toHaveBeenCalledWith({
        where: { item_id: 5, resolved_at: null },
        data: expect.objectContaining({ resolved_at: expect.any(Date) }),
      });
      expect(mockTx.alert.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getActiveAlerts', () => {
    it('debería retornar las alertas no resueltas con información de ítem y categoría', async () => {
      const mockAlerts = [
        {
          id: 1,
          item_id: 5,
          triggered_at: new Date('2026-10-28'),
          resolved_at: null,
          item: {
            id: 5,
            name: 'Papel Bond A4',
            barcode: 'PB-001',
            quantity: 2,
            min_stock: 10,
            unit: 'millar',
            category: { id: 1, name: 'Papelería' },
          },
        },
      ];
      mockPrisma.client.alert.findMany.mockResolvedValue(mockAlerts);

      const result = await service.getActiveAlerts();

      expect(mockPrisma.client.alert.findMany).toHaveBeenCalledWith({
        where: { resolved_at: null },
        include: expect.objectContaining({ item: expect.any(Object) }),
        orderBy: { triggered_at: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].item.name).toBe('Papel Bond A4');
    });
  });

  describe('checkLowStockProducts', () => {
    it('debería filtrar y notificar los ítems con stock por debajo del mínimo', async () => {
      const mockItems = [
        { id: 1, name: 'Toner HP', barcode: 'TON-01', quantity: 1, min_stock: 5 },
        { id: 2, name: 'Teclado USB', barcode: 'TEC-02', quantity: 15, min_stock: 5 },
        { id: 3, name: 'Mouse Óptico', barcode: 'MOU-03', quantity: 2, min_stock: 3 },
      ];
      mockPrisma.client.inventoryItem.findMany.mockResolvedValue(mockItems);

      const lowStock = await service.checkLowStockProducts();

      expect(lowStock).toHaveLength(2);
      expect(lowStock).toEqual([
        {
          itemId: 1,
          itemName: 'Toner HP',
          barcode: 'TON-01',
          currentStock: 1,
          minStock: 5,
          deficiency: 4,
        },
        {
          itemId: 3,
          itemName: 'Mouse Óptico',
          barcode: 'MOU-03',
          currentStock: 2,
          minStock: 3,
          deficiency: 1,
        },
      ]);
    });
  });

  describe('monitorAndSyncThresholds', () => {
    it('debería sincronizar umbrales activando y resolviendo alertas según corresponda', async () => {
      mockPrisma.client.inventoryItem.findMany.mockResolvedValue([
        { id: 1, quantity: 2, min_stock: 5 },
        { id: 2, quantity: 10, min_stock: 4 },
      ]);
      mockPrisma.client.alert.upsert.mockResolvedValue({ id: 1 });
      mockPrisma.client.alert.updateMany.mockResolvedValue({ count: 1 });

      const syncResult = await service.monitorAndSyncThresholds();

      expect(syncResult).toEqual({ triggered: 1, resolved: 1 });
      expect(mockPrisma.client.alert.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.client.alert.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveAlert', () => {
    it('debería marcar como resueltas las alertas de un ítem específico', async () => {
      mockPrisma.client.alert.updateMany.mockResolvedValue({ count: 1 });

      await service.resolveAlert(12);

      expect(mockPrisma.client.alert.updateMany).toHaveBeenCalledWith({
        where: { item_id: 12, resolved_at: null },
        data: expect.objectContaining({ resolved_at: expect.any(Date) }),
      });
    });
  });
});
