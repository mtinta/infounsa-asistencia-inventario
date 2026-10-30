import { Test, TestingModule } from '@nestjs/testing';
import { InventoryMovementsController } from './inventory-movements.controller';
import { InventoryMovementsService } from './inventory-movements.service';

describe('Pruebas Unitarias: InventoryMovementsController', () => {
  let controller: InventoryMovementsController;

  const mockService = {
    register: jest.fn(),
    transfer: jest.fn(),
    sync: jest.fn(),
    findAll: jest.fn(),
    getReports: jest.fn(),
    getKardex: jest.fn(),
    updateMovementDate: jest.fn(),
    generatePdfStream: jest.fn(),
    generateExcelReport: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryMovementsController],
      providers: [
        {
          provide: InventoryMovementsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<InventoryMovementsController>(InventoryMovementsController);
    jest.clearAllMocks();
  });

  it('debería estar definido el controlador', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('debería registrar un movimiento individual', async () => {
      const dto = {
        item_id: 1,
        type: 'entrada' as const,
        quantity: 10,
        registered_at: '2026-10-29T10:00:00.000Z',
      };
      mockService.register.mockResolvedValue({ id: 100, ...dto });

      const result = await controller.register(dto as any);

      expect(mockService.register).toHaveBeenCalledWith(dto);
      expect(result.id).toBe(100);
    });
  });

  describe('sync', () => {
    it('debería procesar lotes de sincronización offline-first', async () => {
      const batchData = {
        batch: [
          {
            item_id: 1,
            type: 'salida' as const,
            quantity: 2,
            registered_at: '2026-10-29T10:00:00.000Z',
            id_operacion_local: 'uuid-1',
          },
        ],
      };
      mockService.sync.mockResolvedValue({
        synced_count: 1,
        processed_local_ids: ['uuid-1'],
      });

      const result = await controller.sync(batchData as any);

      expect(mockService.sync).toHaveBeenCalledWith(batchData.batch);
      expect(result.synced_count).toBe(1);
    });

    it('debería pasar un arreglo vacío si no se proporciona lote', async () => {
      mockService.sync.mockResolvedValue({ synced_count: 0, processed_local_ids: [] });

      await controller.sync({ batch: [] } as any);

      expect(mockService.sync).toHaveBeenCalledWith([]);
    });
  });

  describe('findAll', () => {
    it('debería listar los movimientos históricos', async () => {
      mockService.findAll.mockResolvedValue([{ id: 1 }]);

      const result = await controller.findAll();

      expect(mockService.findAll).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('updateDatePatch / updateDatePut', () => {
    it('debería actualizar la fecha de un movimiento con PATCH', async () => {
      mockService.updateMovementDate.mockResolvedValue({ id: 5, registered_at: '2026-10-25' });

      const result = await controller.updateDatePatch('5', { registered_at: '2026-10-25' });

      expect(mockService.updateMovementDate).toHaveBeenCalledWith(5, '2026-10-25');
      expect(result.id).toBe(5);
    });

    it('debería actualizar la fecha de un movimiento con PUT', async () => {
      mockService.updateMovementDate.mockResolvedValue({ id: 5, registered_at: '2026-10-25' });

      const result = await controller.updateDatePut('5', { registered_at: '2026-10-25' });

      expect(mockService.updateMovementDate).toHaveBeenCalledWith(5, '2026-10-25');
      expect(result.id).toBe(5);
    });
  });

  describe('getReportPdf', () => {
    it('debería configurar headers y enviar el PDF obtenido desde el servicio desacoplado', async () => {
      const query = { startDate: '2026-10-01', endDate: '2026-10-31', type: 'detallado' } as any;
      const fakePdf = {
        contentType: 'application/pdf',
        data: Buffer.from('pdf-content'),
      };
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;
      mockService.generatePdfStream.mockResolvedValue(fakePdf);

      await controller.getReportPdf(query, mockRes);

      expect(mockService.generatePdfStream).toHaveBeenCalledWith(query.startDate, query.endDate, query.type);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename=reporte-movimientos.pdf');
      expect(mockRes.send).toHaveBeenCalledWith(fakePdf.data);
    });
  });

  describe('getReportExcel', () => {
    it('debería delegar la generación del buffer Excel al servicio sin pasar Response', async () => {
      const query = { startDate: '2026-10-01', endDate: '2026-10-31', type: 'resumido' } as any;
      const fakeBuffer = Buffer.from('excel-movement-data');
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;
      mockService.generateExcelReport.mockResolvedValue(fakeBuffer);

      await controller.getReportExcel(query, mockRes);

      expect(mockService.generateExcelReport).toHaveBeenCalledWith(query.startDate, query.endDate, 'resumido');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=reporte-movimientos.xlsx',
      );
      expect(mockRes.send).toHaveBeenCalledWith(fakeBuffer);
    });
  });

  describe('transfer', () => {
    it('debería registrar una transferencia entre áreas a través del servicio', async () => {
      const dto = {
        item_id: 1,
        quantity: 5,
        to_area_id: 2,
        registered_at: '2026-10-29T10:00:00Z',
      };
      mockService.transfer.mockResolvedValue({ id: 101, ...dto });

      const result = await controller.transfer(dto);

      expect(mockService.transfer).toHaveBeenCalledWith(dto);
      expect(result.id).toBe(101);
    });
  });

  describe('getKardex', () => {
    it('debería solicitar el kardex consolidado con los filtros indicados', async () => {
      mockService.getKardex.mockResolvedValue([
        { id: 1, item_id: 1, running_balance: 10 },
      ]);

      const result = await controller.getKardex('1', '2026-10-01', '2026-10-31');

      expect(mockService.getKardex).toHaveBeenCalledWith(1, '2026-10-01', '2026-10-31');
      expect(result).toHaveLength(1);
    });
  });

  describe('getAlerts & getLowStockAlerts', () => {
    it('debería retornar array vacío si no se inyectó alertService opcional', async () => {
      const alerts = await controller.getAlerts();
      const lowStock = await controller.getLowStockAlerts();

      expect(alerts).toEqual([]);
      expect(lowStock).toEqual([]);
    });
  });
});
