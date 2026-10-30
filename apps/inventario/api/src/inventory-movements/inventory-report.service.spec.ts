import { InventoryReportService } from './inventory-report.service';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

describe('InventoryReportService', () => {
  let service: InventoryReportService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      client: {
        inventoryMovement: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 1,
              item_id: 10,
              type: 'entrada',
              quantity: 20,
              registered_at: new Date('2026-10-01T10:00:00Z'),
              destinatario_name: 'Almacén Central',
              observations: 'Compra inicial',
              item: { id: 10, name: 'Engrapadora', barcode: 'ENG-01' },
              user: { username: 'carlos' },
              area: null,
            },
            {
              id: 2,
              item_id: 10,
              type: 'salida',
              quantity: 5,
              registered_at: new Date('2026-10-02T11:00:00Z'),
              destinatario_name: null,
              observations: 'Entrega a laboratorio',
              item: { id: 10, name: 'Engrapadora', barcode: 'ENG-01' },
              user: { username: 'maria' },
              area: { name: 'Laboratorio 1', responsable: 'Ing. Perez' },
            },
          ]),
          groupBy: jest.fn().mockResolvedValue([
            {
              type: 'entrada',
              _count: { _all: 5 },
              _sum: { quantity: 100 },
            },
            {
              type: 'salida',
              _count: { _all: 3 },
              _sum: { quantity: 45 },
            },
          ]),
        },
      },
    };

    service = new InventoryReportService(mockPrisma);
  });

  describe('parseReportRange', () => {
    it('debería retornar fechas válidas para un rango correcto dentro de los 90 días', () => {
      const { start, end } = service.parseReportRange('2026-10-01', '2026-10-15');
      expect(start).toBeInstanceOf(Date);
      expect(end).toBeInstanceOf(Date);
      expect(start.toISOString()).toContain('2026-10-01');
    });

    it('debería lanzar error si falta startDate o endDate', () => {
      expect(() => service.parseReportRange('', '2026-10-15')).toThrow(BadRequestException);
      expect(() => service.parseReportRange('2026-10-01', '')).toThrow(BadRequestException);
    });

    it('debería lanzar error si startDate es posterior a endDate', () => {
      expect(() => service.parseReportRange('2026-10-20', '2026-10-10')).toThrow(BadRequestException);
    });

    it('debería lanzar error si el rango excede los 90 días', () => {
      expect(() => service.parseReportRange('2026-01-01', '2026-06-01')).toThrow(
        /El rango de fecha no puede exceder los 90 dias/,
      );
    });
  });

  describe('findAll', () => {
    it('debería retornar el listado histórico formateando área y usuario', async () => {
      const result = await service.findAll(50);

      expect(mockPrisma.client.inventoryMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, orderBy: { registered_at: 'desc' } }),
      );
      expect(result).toHaveLength(2);
      expect(result[0].item_name).toBe('Engrapadora');
      expect(result[0].operator_name).toBe('carlos');
      expect(result[1].destinatario_name).toBe('Laboratorio 1 - Ing. Perez');
    });
  });

  describe('getReports', () => {
    it('debería calcular el resumen agrupado por tipo de movimiento', async () => {
      const summary = await service.getReports('2026-10-01', '2026-10-30');

      expect(summary).toEqual([
        { type: 'entrada', total_movimientos: 5, cantidad_total: 100 },
        { type: 'salida', total_movimientos: 3, cantidad_total: 45 },
      ]);
    });
  });

  describe('getKardex', () => {
    it('debería calcular el balance acumulado (running balance) cronológico', async () => {
      const kardex = await service.getKardex(10, '2026-10-01', '2026-10-30');

      expect(kardex).toHaveLength(2);
      expect(kardex[0].running_balance).toBe(20); // +20
      expect(kardex[1].running_balance).toBe(15); // 20 - 5 = 15
      expect(kardex[1].destinatario).toBe('Laboratorio 1 - Ing. Perez');
    });
  });

  describe('generateExcelReport & exportMovementsExcel', () => {
    it('debería generar y retornar el buffer Excel', async () => {
      const buffer = await service.exportMovementsExcel('2026-10-01', '2026-10-30', 'resumido');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('generatePdfStream & exportMovementsPdf', () => {
    it('debería generar el reporte PDF resumido', async () => {
      const result = await service.exportMovementsPdf('2026-10-01', '2026-10-30');

      expect(result.contentType).toBe('application/pdf');
      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('debería generar el reporte PDF detallado', async () => {
      const result = await service.exportMovementsPdf('2026-10-01', '2026-10-30', 'detallado');

      expect(result.contentType).toBe('application/pdf');
      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.data.length).toBeGreaterThan(0);
    });
  });
});
