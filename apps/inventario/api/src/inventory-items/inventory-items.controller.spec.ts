import { Test, TestingModule } from '@nestjs/testing';
import { InventoryItemsController } from './inventory-items.controller';
import { InventoryItemsService } from './inventory-items.service';

describe('Pruebas Unitarias: InventoryItemsController', () => {
  let controller: InventoryItemsController;

  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByBarcode: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    importBulk: jest.fn(),
    previewImportExcel: jest.fn(),
    generateImportTemplate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryItemsController],
      providers: [
        {
          provide: InventoryItemsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<InventoryItemsController>(InventoryItemsController);
    jest.clearAllMocks();
  });

  it('debería estar definido el controlador', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('debería invocar findAll del servicio con parámetros parseados', async () => {
      const mockResult = { data: [], total: 0, page: 2, limit: 15, totalPages: 0 };
      mockService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll('2', '15', 'laptop', '5');

      expect(mockService.findAll).toHaveBeenCalledWith(2, 15, 'laptop', 5);
      expect(result).toBe(mockResult);
    });

    it('debería usar valores por defecto para page=1 y limit=50 si no se envían', async () => {
      mockService.findAll.mockResolvedValue({ data: [], total: 0 });

      await controller.findAll();

      expect(mockService.findAll).toHaveBeenCalledWith(1, 50, undefined, undefined);
    });
  });

  describe('findOne', () => {
    it('debería retornar el bien por id', async () => {
      const item = { id: 10, name: 'Proyector Epson' };
      mockService.findOne.mockResolvedValue(item);

      const result = await controller.findOne(10);

      expect(mockService.findOne).toHaveBeenCalledWith(10);
      expect(result).toBe(item);
    });
  });

  describe('findByBarcode', () => {
    it('debería invocar findByBarcode con el código recibido', async () => {
      const item = { id: 11, barcode: 'EAN-9999' };
      mockService.findByBarcode.mockResolvedValue(item);

      const result = await controller.findByBarcode('EAN-9999');

      expect(mockService.findByBarcode).toHaveBeenCalledWith('EAN-9999');
      expect(result).toBe(item);
    });
  });

  describe('create', () => {
    it('debería delegar la creación al servicio', async () => {
      const payload = { name: 'Pizarra Acrílica', quantity: 2 };
      mockService.create.mockResolvedValue({ id: 12, ...payload });

      const result = await controller.create(payload);

      expect(mockService.create).toHaveBeenCalledWith(payload);
      expect(result.id).toBe(12);
    });
  });

  describe('update', () => {
    it('debería delegar la actualización al servicio con id numérico', async () => {
      const payload = { name: 'Pizarra Acrílica Grande' };
      mockService.update.mockResolvedValue({ id: 12, ...payload });

      const result = await controller.update(12, payload);

      expect(mockService.update).toHaveBeenCalledWith(12, payload);
      expect(result.name).toBe('Pizarra Acrílica Grande');
    });
  });

  describe('remove', () => {
    it('debería delegar la eliminación al servicio', async () => {
      mockService.remove.mockResolvedValue({ deleted: true, id: 12 });

      const result = await controller.remove(12);

      expect(mockService.remove).toHaveBeenCalledWith(12);
      expect(result).toEqual({ deleted: true, id: 12 });
    });
  });

  describe('Importación masiva Excel', () => {
    describe('downloadTemplate', () => {
      it('debería configurar headers y delegar en generateImportTemplate', async () => {
        const mockRes = {
          setHeader: jest.fn(),
        } as any;

        await controller.downloadTemplate(mockRes);

        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Content-Disposition',
          'attachment; filename=Plantilla_Inventario_InfoUNSA.xlsx',
        );
        expect(mockService.generateImportTemplate).toHaveBeenCalledWith(mockRes);
      });
    });

    describe('previewImport', () => {
      it('debería rechazar si no se envía archivo o buffer', async () => {
        await expect(controller.previewImport(null)).rejects.toThrow(
          'El archivo Excel es requerido.',
        );
        await expect(controller.previewImport({} as any)).rejects.toThrow(
          'El archivo Excel es requerido.',
        );
      });

      it('debería invocar previewImportExcel con el buffer', async () => {
        const mockBuffer = Buffer.from('excel-bytes');
        const mockPreviewResult = {
          stockItems: [],
          ingresoMovements: [],
          salidaMovements: [],
          summary: { totalItems: 0 },
        };
        mockService.previewImportExcel.mockResolvedValue(mockPreviewResult);

        const result = await controller.previewImport({ buffer: mockBuffer } as any);

        expect(mockService.previewImportExcel).toHaveBeenCalledWith(mockBuffer);
        expect(result).toBe(mockPreviewResult);
      });
    });

    describe('importConfirm e importBulk', () => {
      it('importConfirm debería delegar en importBulk del servicio', async () => {
        const payload = { items: [{ name: 'Test' }], movements: [] };
        const mockRes = { importedItemsCount: 1, importedMovementsCount: 0 };
        mockService.importBulk.mockResolvedValue(mockRes);

        const result = await controller.importConfirm(payload);

        expect(mockService.importBulk).toHaveBeenCalledWith(payload);
        expect(result).toBe(mockRes);
      });

      it('importBulk debería delegar en importBulk del servicio', async () => {
        const payload = { items: [{ name: 'Test 2' }], movements: [] };
        const mockRes = { importedItemsCount: 1, importedMovementsCount: 0 };
        mockService.importBulk.mockResolvedValue(mockRes);

        const result = await controller.importBulk(payload);

        expect(mockService.importBulk).toHaveBeenCalledWith(payload);
        expect(result).toBe(mockRes);
      });
    });
  });
});
