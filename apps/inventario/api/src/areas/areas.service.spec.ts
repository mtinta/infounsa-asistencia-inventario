import { Test, TestingModule } from '@nestjs/testing';
import { AreasService } from './areas.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('Pruebas Unitarias: AreasService', () => {
  let service: AreasService;
  let prisma: PrismaService;

  // Mock estructurado para el modelo 'area' de Prisma
  const mockPrismaService = {
    client: {
      area: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AreasService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AreasService>(AreasService);
    prisma = module.get<PrismaService>(PrismaService);

    // Limpiamos el historial de ejecuciones antes de cada prueba
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  // --- 1. MÉTODO: findAll ---
  describe('findAll', () => {
    it('debería retornar todas las áreas ordenadas alfabéticamente por nombre', async () => {
      const mockAreas = [
        { id: 1, name: 'Almacén A', responsable: 'Juan Pérez' },
        { id: 2, name: 'Almacén B', responsable: 'Ana Gómez' },
      ];
      mockPrismaService.client.area.findMany.mockResolvedValue(mockAreas);

      const result = await service.findAll();

      expect(result).toEqual(mockAreas);
      expect(mockPrismaService.client.area.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });
  });

  // --- 2. MÉTODO: findOne ---
  describe('findOne', () => {
    it('debería retornar el área encontrada si el ID existe', async () => {
      const mockArea = { id: 5, name: 'Sistemas', responsable: 'Carlos D.' };
      mockPrismaService.client.area.findUnique.mockResolvedValue(mockArea);

      const result = await service.findOne(5);

      expect(result).toEqual(mockArea);
      expect(mockPrismaService.client.area.findUnique).toHaveBeenCalledWith({
        where: { id: 5 },
      });
    });

    it('debería lanzar un NotFoundException si el área no existe', async () => {
      mockPrismaService.client.area.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(
        new NotFoundException('Área con ID 999 no encontrada'),
      );
    });
  });

  // --- 3. MÉTODO: create ---
  describe('create', () => {
    it('debería registrar una nueva área en la base de datos', async () => {
      const inputData = { name: 'Logística', responsable: 'María R.' };
      const mockCreated = { id: 3, ...inputData };
      mockPrismaService.client.area.create.mockResolvedValue(mockCreated);

      const result = await service.create(inputData);

      expect(result).toEqual(mockCreated);
      expect(mockPrismaService.client.area.create).toHaveBeenCalledWith({
        data: {
          name: inputData.name,
          responsable: inputData.responsable,
        },
      });
    });
  });

  // --- 4. MÉTODO: update ---
  describe('update', () => {
    it('debería actualizar los campos del área si esta existe', async () => {
      const existingArea = { id: 1, name: 'Antiguo Nombre', responsable: 'Responsable A' };
      const updateData = { name: 'Nuevo Nombre', responsable: 'Responsable B' };
      
      // Simular la validación interna de findOne y posterior actualización
      mockPrismaService.client.area.findUnique.mockResolvedValue(existingArea);
      mockPrismaService.client.area.update.mockResolvedValue({ id: 1, ...updateData });

      const result = await service.update(1, updateData);

      expect(result.name).toBe('Nuevo Nombre');
      expect(mockPrismaService.client.area.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updateData,
      });
    });
  });

  // --- 5. MÉTODO: remove ---
  describe('remove', () => {
    it('debería eliminar el área de forma definitiva si supera la validación de existencia', async () => {
      const existingArea = { id: 2, name: 'Área Temporal', responsable: 'Nadie' };
      
      // Simular verificación y posterior borrado
      mockPrismaService.client.area.findUnique.mockResolvedValue(existingArea);
      mockPrismaService.client.area.delete.mockResolvedValue(existingArea);

      const result = await service.remove(2);

      expect(result).toEqual(existingArea);
      expect(mockPrismaService.client.area.delete).toHaveBeenCalledWith({
        where: { id: 2 },
      });
    });
  });
});