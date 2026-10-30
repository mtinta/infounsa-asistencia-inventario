import { Test, TestingModule } from '@nestjs/testing';
import { InventoryItemsService } from './inventory-items.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

describe('Pruebas Unitarias: InventoryItemsService', () => {
  let service: InventoryItemsService;

  const mockPrismaService = {
    client: {
      inventoryItem: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      inventoryMovement: {
        create: jest.fn(),
      },
      category: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryItemsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<InventoryItemsService>(InventoryItemsService);
    jest.clearAllMocks();
  });

  it('debería estar definido el servicio', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debería retornar datos paginados y mapear category_name', async () => {
      const mockItems = [
        {
          id: 1,
          name: 'Papel Bond A4',
          barcode: '0000001',
          quantity: 20,
          category: { id: 1, name: 'Papelería' },
        },
        {
          id: 2,
          name: 'Tóner HP',
          barcode: '0000002',
          quantity: 5,
          category: null,
        },
      ];

      mockPrismaService.client.inventoryItem.findMany.mockResolvedValue(mockItems);
      mockPrismaService.client.inventoryItem.count.mockResolvedValue(2);

      const result = await service.findAll(1, 10);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].category_name).toBe('Papelería');
      expect(result.data[1].category_name).toBeNull();
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('debería aplicar filtros de búsqueda por texto y categoría', async () => {
      mockPrismaService.client.inventoryItem.findMany.mockResolvedValue([]);
      mockPrismaService.client.inventoryItem.count.mockResolvedValue(0);

      await service.findAll(2, 20, 'impresora', 3);

      expect(mockPrismaService.client.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'impresora' } },
              { barcode: { contains: 'impresora' } },
              { description: { contains: 'impresora' } },
            ],
            category_id: 3,
          },
          take: 20,
          skip: 20,
        }),
      );
      expect(mockPrismaService.client.inventoryItem.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'impresora' } },
            { barcode: { contains: 'impresora' } },
            { description: { contains: 'impresora' } },
          ],
          category_id: 3,
        },
      });
    });

    it('debería soportar consulta ilimitada si limit >= 10000', async () => {
      mockPrismaService.client.inventoryItem.findMany.mockResolvedValue([]);
      mockPrismaService.client.inventoryItem.count.mockResolvedValue(150);

      const result = await service.findAll(1, 10000);

      expect(result.totalPages).toBe(1);
      expect(mockPrismaService.client.inventoryItem.findMany).toHaveBeenCalledWith({
        where: {},
        include: { category: true },
        orderBy: { id: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('debería retornar el bien con category_name si existe', async () => {
      const mockItem = {
        id: 5,
        name: 'Teclado USB',
        barcode: '0000005',
        category: { id: 2, name: 'Informática' },
      };
      mockPrismaService.client.inventoryItem.findUnique.mockResolvedValue(mockItem);

      const result = await service.findOne(5);

      expect(result.id).toBe(5);
      expect(result.category_name).toBe('Informática');
    });

    it('debería lanzar NotFoundException si el bien no existe', async () => {
      mockPrismaService.client.inventoryItem.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(
        new NotFoundException('Bien con ID 999 no encontrado'),
      );
    });
  });

  describe('findByBarcode', () => {
    it('debería retornar el bien encontrado por código de barras', async () => {
      const mockItem = {
        id: 7,
        name: 'Mouse Óptico',
        barcode: 'BAR-12345',
        category: null,
      };
      mockPrismaService.client.inventoryItem.findUnique.mockResolvedValue(mockItem);

      const result = await service.findByBarcode('BAR-12345');

      expect(result.barcode).toBe('BAR-12345');
      expect(result.category_name).toBeNull();
    });

    it('debería lanzar NotFoundException si no se encuentra el código de barras', async () => {
      mockPrismaService.client.inventoryItem.findUnique.mockResolvedValue(null);

      await expect(service.findByBarcode('NO-EXISTE')).rejects.toThrow(
        new NotFoundException('Bien con codigo de barras NO-EXISTE no encontrado'),
      );
    });
  });

  describe('create', () => {
    it('debería crear un bien con código provisto', async () => {
      const input = {
        barcode: '0000010',
        name: 'Monitor 24',
        quantity: 10,
        min_stock: 2,
        category_id: 1,
      };
      const createdItem = { id: 10, ...input, unit: 'unidad', sede_id: 1 };
      mockPrismaService.client.inventoryItem.create.mockResolvedValue(createdItem);

      const result = await service.create(input);

      expect(result).toEqual(createdItem);
      expect(mockPrismaService.client.inventoryItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            barcode: '0000010',
            name: 'Monitor 24',
            quantity: 10,
          }),
        }),
      );
    });

    it('debería autogenerar código correlativo de 7 dígitos si no se especifica', async () => {
      mockPrismaService.client.inventoryItem.count.mockResolvedValue(3);
      mockPrismaService.client.inventoryItem.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.client.inventoryItem.create.mockResolvedValue({
        id: 4,
        barcode: '0000004',
        name: 'Nuevo Bien',
      });

      const result = await service.create({ name: 'Nuevo Bien', quantity: 5 });

      expect(result.barcode).toBe('0000004');
    });

    it('debería rechazar cantidad negativa con BadRequestException', async () => {
      await expect(
        service.create({ name: 'Bien Inválido', quantity: -3 }),
      ).rejects.toThrow(new BadRequestException('La cantidad no puede ser negativa'));
    });

    it('debería mapear error de clave única P2002 a ConflictException', async () => {
      mockPrismaService.client.inventoryItem.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.create({ barcode: 'DUPLICADO', name: 'Duplicado', quantity: 1 }),
      ).rejects.toThrow(ConflictException);
    });

    it('debería registrar movimiento inicial si se especifica observación', async () => {
      mockPrismaService.client.inventoryItem.create.mockResolvedValue({
        id: 15,
        barcode: '0000015',
        name: 'Silla Ergonómica',
        quantity: 8,
      });

      await service.create({
        barcode: '0000015',
        name: 'Silla Ergonómica',
        quantity: 8,
        observation: 'Lote donado por decanato',
        user_id: 2,
      });

      expect(mockPrismaService.client.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            item_id: 15,
            type: 'entrada',
            quantity: 8,
            user_id: 2,
            observations: '[Creación] Lote donado por decanato',
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('debería actualizar campos respetando valores existentes', async () => {
      const existing = {
        id: 20,
        barcode: '0000020',
        name: 'Escritorio L',
        description: 'Madera cedro',
        quantity: 3,
        min_stock: 1,
        unit: 'unidad',
        category_id: 1,
        sede_id: 1,
        status: 'activo',
      };
      mockPrismaService.client.inventoryItem.findUnique.mockResolvedValue(existing);
      mockPrismaService.client.inventoryItem.update.mockResolvedValue({
        ...existing,
        name: 'Escritorio L Modificado',
        quantity: 5,
      });

      const result = await service.update(20, {
        name: 'Escritorio L Modificado',
        quantity: 5,
      });

      expect(result.name).toBe('Escritorio L Modificado');
      expect(result.quantity).toBe(5);
    });

    it('debería rechazar cantidad negativa en actualización', async () => {
      mockPrismaService.client.inventoryItem.findUnique.mockResolvedValue({
        id: 21,
        quantity: 10,
      });

      await expect(
        service.update(21, { quantity: -1 }),
      ).rejects.toThrow(new BadRequestException('La cantidad no puede ser negativa'));
    });
  });

  describe('remove', () => {
    it('debería verificar existencia previa y eliminar el bien', async () => {
      mockPrismaService.client.inventoryItem.findUnique.mockResolvedValue({ id: 30 });
      mockPrismaService.client.inventoryItem.delete.mockResolvedValue({ id: 30 });

      const result = await service.remove(30);

      expect(result).toEqual({ deleted: true, id: 30 });
      expect(mockPrismaService.client.inventoryItem.delete).toHaveBeenCalledWith({
        where: { id: 30 },
      });
    });

    it('debería fallar si el bien a eliminar no existe', async () => {
      mockPrismaService.client.inventoryItem.findUnique.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('previewImportExcel', () => {
    it('debería rechazar si el buffer está vacío', async () => {
      await expect(service.previewImportExcel(Buffer.alloc(0))).rejects.toThrow(BadRequestException);
    });

    it('debería rechazar si el buffer no es un archivo Excel válido', async () => {
      await expect(service.previewImportExcel(Buffer.from('archivo corrupto'))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debería procesar correctamente hojas STOCK, INGRESO y SALIDA calculando relaciones y métricas', async () => {
      mockPrismaService.client.inventoryItem.findMany.mockResolvedValue([
        { id: 1, name: 'Papel Bond A4', barcode: '0000001' },
      ]);
      mockPrismaService.client.category.findMany.mockResolvedValue([
        { id: 10, name: 'Material de oficina' },
        { id: 20, name: 'Artículos de limpieza' },
      ]);

      const wb = new ExcelJS.Workbook();
      const wsStock = wb.addWorksheet('STOCK');
      wsStock.addRow(['Titulo']);
      wsStock.addRow(['Subtitulo']);
      wsStock.addRow([]);
      wsStock.addRow(['N°', 'CÓDIGO', 'PRODUCTO', 'MEDIDA', 'CANTIDAD', 'STOCK MÍNIMO']);
      wsStock.addRow([1, 'MAT-001', 'Papel Bond A4', 'PAQUETE', 50, 10]);
      wsStock.addRow([2, 'LIM-001', 'Jabón Líquido Antiséptico', 'FRASCO', 20, 5]);
      wsStock.addRow([3, 'MAT-001', 'Papel Bond A4', 'PAQUETE', 5, 2]);

      const wsIngreso = wb.addWorksheet('INGRESO');
      wsIngreso.addRow(['Titulo']);
      wsIngreso.addRow(['Header', '', 'Descripción', 'UNIDAD', 'Cantidad', 'Fecha', 'Origen', 'Obs']);
      wsIngreso.addRow(['1', '', 'Papel Bond A4', 'PAQUETE', 15, '2026-08-01', 'Proveedor Central', 'Lote 1']);

      const wsSalida = wb.addWorksheet('SALIDA');
      wsSalida.addRow(['Titulo']);
      wsSalida.addRow(['Header', 'Fecha', 'Material', 'Cantidad', 'Destino', 'Entrega', 'Obs']);
      wsSalida.addRow(['1', '2026-08-02', 'Papel Bond A4', 3, 'Oficina Registro', 'Admin User', 'Despacho']);

      const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());

      const result = await service.previewImportExcel(excelBuffer);

      expect(result).toBeDefined();
      expect(result.stockItems).toHaveLength(3);
      expect(result.stockItems[0].name).toBe('Papel Bond A4');
      expect(result.stockItems[0].isDbMatch).toBe(true);
      expect(result.stockItems[0].isExcelDuplicate).toBe(true);
      expect(result.stockItems[1].name).toBe('Jabón Líquido Antiséptico');
      expect(result.stockItems[1].category_id).toBe(20);

      expect(result.ingresoMovements).toHaveLength(1);
      expect(result.ingresoMovements[0].type).toBe('entrada');
      expect(result.ingresoMovements[0].quantity).toBe(15);

      expect(result.salidaMovements).toHaveLength(1);
      expect(result.salidaMovements[0].type).toBe('salida');
      expect(result.salidaMovements[0].quantity).toBe(3);

      expect(result.summary.totalItems).toBe(3);
      expect(result.summary.totalMovements).toBe(2);
      expect(result.summary.dbMatchCount).toBe(2);
      expect(result.summary.excelDuplicateCount).toBe(2);
    });
  });

  describe('generateImportTemplate', () => {
    it('debería generar una plantilla Excel y enviarla a través de la respuesta HTTP', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      } as any;

      await service.generateImportTemplate(mockRes);

      expect(mockRes.end).toHaveBeenCalled();
    });
  });
});
