import { InventoryMovementsService } from './inventory-movements.service';
import { BadRequestException } from '@nestjs/common';

describe('InventoryMovementsService', () => {
  const movement = {
    id: 10,
    item_id: 7,
    type: 'salida' as const,
    quantity: 2,
    user_id: 3,
    registered_at: '2026-09-14T12:00:00.000Z',
    id_operacion_local: 'op-001',
  };

  function createFixture() {
    const tx = {
      $queryRaw: jest.fn(),
      inventoryItem: { update: jest.fn() },
      inventoryMovement: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue(movement),
      },
      alert: {
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const prisma = {
      client: {
        $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
        inventoryMovement: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 1,
              item_id: 7,
              type: 'salida',
              quantity: 2,
              registered_at: new Date('2026-09-14T12:00:00.000Z'),
              destinatario_name: 'Test',
              observations: 'Observacion',
              item: { name: 'Item Test', barcode: '12345' },
              user: { username: 'admin' },
              area: { name: 'Area 1', responsable: 'Responsable' },
            },
          ]),
          groupBy: jest.fn().mockResolvedValue([
            {
              type: 'salida',
              _count: { _all: 1 },
              _sum: { quantity: 2 },
            },
          ]),
        },
      },
    };

    return { tx, prisma, service: new InventoryMovementsService(prisma as any) };
  }

  it('usa el nombre fisico inventory_items al bloquear un movimiento', async () => {
    const { tx, service } = createFixture();
    tx.$queryRaw.mockResolvedValue([{ id: 7, name: 'Laptop QA', quantity: 10, min_stock: 2 }]);

    await service.register(movement);

    const sql = tx.$queryRaw.mock.calls[0][0].join('');
    expect(sql).toContain('inventory_items');
    expect(sql).toContain('FOR UPDATE');
  });

  it('ordena el lote y bloquea cada item antes de actualizarlo', async () => {
    const { tx, service } = createFixture();
    tx.inventoryMovement.findUnique.mockResolvedValue(null);
    tx.$queryRaw.mockImplementation(async (_parts: TemplateStringsArray, itemId: number) => [
      { id: itemId, name: `Item ${itemId}`, quantity: 10, min_stock: 2 },
    ]);

    const result = await service.sync([
      { ...movement, item_id: 9, id_operacion_local: 'op-009' },
      { ...movement, item_id: 2, id_operacion_local: 'op-002' },
    ]);

    expect(tx.$queryRaw.mock.calls.map((call: unknown[]) => call[1])).toEqual([2, 9]);
    expect(tx.inventoryItem.update).toHaveBeenCalledTimes(2);
    expect(result.synced_count).toBe(2);
    expect(result.processed_local_ids).toEqual(['op-002', 'op-009']);
  });

  it('reintenta una transaccion ante P2034', async () => {
    const { tx, prisma, service } = createFixture();
    tx.$queryRaw.mockResolvedValue([{ id: 7, name: 'Laptop QA', quantity: 10, min_stock: 2 }]);
    const transaction = prisma.client.$transaction as jest.Mock;
    transaction
      .mockRejectedValueOnce(Object.assign(new Error('write conflict'), { code: 'P2034' }))
      .mockImplementationOnce((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await service.register(movement);

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(result).toEqual(movement);
  });

  it('rechaza un movimiento con cantidad <= 0', async () => {
    const { service } = createFixture();

    await expect(
      service.register({ ...movement, quantity: 0 }),
    ).rejects.toThrow(new BadRequestException('La cantidad del movimiento debe ser mayor a cero'));

    await expect(
      service.register({ ...movement, quantity: -5 }),
    ).rejects.toThrow(new BadRequestException('La cantidad del movimiento debe ser mayor a cero'));
  });

  it('rechaza una salida que genera stock negativo', async () => {
    const { tx, service } = createFixture();
    tx.$queryRaw.mockResolvedValue([{ id: 7, name: 'Impresora Láser', quantity: 3, min_stock: 1 }]);

    await expect(
      service.register({ ...movement, quantity: 5, type: 'salida' }),
    ).rejects.toThrow(/Stock insuficiente/);
  });

  it('activa alerta cuando el stock final cae por debajo del stock mínimo', async () => {
    const { tx, service } = createFixture();
    tx.$queryRaw.mockResolvedValue([{ id: 7, name: 'Papel Bond', quantity: 5, min_stock: 4 }]);

    await service.register({ ...movement, quantity: 2, type: 'salida' });

    expect(tx.alert.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { item_id: 7 },
      }),
    );
  });

  it('resuelve alerta cuando el stock final se recupera igual o sobre el stock mínimo', async () => {
    const { tx, service } = createFixture();
    tx.$queryRaw.mockResolvedValue([{ id: 7, name: 'Papel Bond', quantity: 2, min_stock: 4 }]);

    await service.register({ ...movement, quantity: 5, type: 'entrada' });

    expect(tx.alert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { item_id: 7, resolved_at: null },
      }),
    );
  });

  it('mantiene idempotencia en sincronización ignorando movimientos con id_operacion_local repetido', async () => {
    const { tx, service } = createFixture();
    tx.inventoryMovement.findUnique.mockResolvedValue({ id: 99, id_operacion_local: 'op-repetida' });

    const result = await service.sync([
      { ...movement, id_operacion_local: 'op-repetida' },
    ]);

    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
    expect(result.synced_count).toBe(1);
    expect(result.processed_local_ids).toEqual(['op-repetida']);
  });

  it('registra destinatario y área correctamente en el movimiento', async () => {
    const { tx, service } = createFixture();
    tx.$queryRaw.mockResolvedValue([{ id: 7, name: 'Proyector', quantity: 10, min_stock: 1 }]);

    await service.register({
      ...movement,
      type: 'salida',
      quantity: 1,
      area_id: 3,
      destinatario_name: 'Laboratorio de Cómputo - Ing. Ramos',
      observations: 'Préstamo temporal de equipo',
    });

    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          area_id: 3,
          destinatario_name: 'Laboratorio de Cómputo - Ing. Ramos',
          observations: 'Préstamo temporal de equipo',
        }),
      }),
    );
  });

  describe('transfer', () => {
    it('debería realizar una transferencia transaccional entre áreas actualizando el stock', async () => {
      const { tx, service } = createFixture();
      tx.$queryRaw.mockResolvedValue([{ id: 7, name: 'Silla Ergonómica', quantity: 15, min_stock: 2 }]);

      await service.transfer({
        item_id: 7,
        quantity: 5,
        to_area_id: 4,
        destinatario_name: 'Oficina de Decanato',
        registered_at: '2026-10-29T10:00:00Z',
        observations: 'Reasignación de mobiliario',
      });

      expect(tx.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { quantity: 10 },
      });
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            item_id: 7,
            type: 'salida',
            quantity: 5,
            area_id: 4,
          }),
        }),
      );
    });

    it('debería rechazar transferencia si la cantidad es mayor al stock disponible', async () => {
      const { tx, service } = createFixture();
      tx.$queryRaw.mockResolvedValue([{ id: 7, name: 'Silla Ergonómica', quantity: 3, min_stock: 2 }]);

      await expect(
        service.transfer({
          item_id: 7,
          quantity: 10,
          to_area_id: 4,
          registered_at: '2026-10-29T10:00:00Z',
        }),
      ).rejects.toThrow(/Stock insuficiente para transferir/);
    });
  });

  describe('Reportes desacoplados de transporte (PDF y Excel)', () => {
    it('debería generar el reporte Excel como Buffer sin depender de Response', async () => {
      const { service } = createFixture();

      const buffer = await service.generateExcelReport('2026-09-01', '2026-09-30', 'resumido');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('debería exportar movimientos a Excel con exportMovementsExcel', async () => {
      const { service } = createFixture();

      const buffer = await service.exportMovementsExcel('2026-09-01', '2026-09-30', 'detallado');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('debería exportar movimientos a PDF con exportMovementsPdf', async () => {
      const { service } = createFixture();

      const result = await service.exportMovementsPdf('2026-09-01', '2026-09-30', 'detallado');

      expect(result.contentType).toBe('application/pdf');
      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.data.length).toBeGreaterThan(0);
    });
  });
});
