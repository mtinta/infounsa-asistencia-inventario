import { Test, TestingModule } from '@nestjs/testing';
import { SedesService } from './sedes.service';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('Pruebas Unitarias: SedesService', () => {
  let service: SedesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    client: {
      sede: {
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
        SedesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SedesService>(SedesService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  // --- 1. MÉTODO: findAll ---
  describe('findAll', () => {
    it('debería retornar una lista de sedes ordenada por ID', async () => {
      const mockSedes = [
        { id: '1', nombre: 'Sede A', name: 'Sede A' },
        { id: '2', nombre: 'Sede B', name: 'Sede B' },
      ];
      mockPrismaService.client.sede.findMany.mockResolvedValue(mockSedes);

      const result = await service.findAll();

      expect(result).toEqual(mockSedes);
      expect(mockPrismaService.client.sede.findMany).toHaveBeenCalledWith({
        orderBy: { id: 'asc' },
      });
    });
  });

  // --- 2. MÉTODO: findOne ---
  describe('findOne', () => {
    it('debería retornar la sede si existe', async () => {
      const mockSede = { id: 10, nombre: 'Sede Central', name: 'Sede Central', code: 'SD-CEN' };
      mockPrismaService.client.sede.findUnique.mockResolvedValue(mockSede);

      const result = await service.findOne(10);

      expect(result).toEqual(mockSede);
      expect(mockPrismaService.client.sede.findUnique).toHaveBeenCalledWith({
        where: { id: 10 },
      });
    });

    it('debería lanzar un NotFoundException si la sede no existe', async () => {
      mockPrismaService.client.sede.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(
        new NotFoundException('Sede con ID 999 no encontrada'),
      );
    });
  });

  // --- 3. MÉTODO: create ---
  describe('create', () => {
    it('debería insertar una nueva sede con los datos provistos', async () => {
      const dto = { name: 'Sede Norte', code: 'SD-NOR', address: 'Av. Aviación' };
      const mockCreated = { id: 3, nombre: 'Sede Norte', name: 'Sede Norte', code: 'SD-NOR', direccion: 'Av. Aviación', address: 'Av. Aviación' };
      mockPrismaService.client.sede.create.mockResolvedValue(mockCreated);

      const result = await service.create(dto);

      expect(result).toEqual(mockCreated);
      expect(mockPrismaService.client.sede.create).toHaveBeenCalled();
    });
  });

  // --- 4. MÉTODO: update ---
  describe('update', () => {
    it('debería actualizar los datos y rellenar con los existentes si se envían nulos', async () => {
      const currentSede = { id: 1, nombre: 'Sede Antigua', name: 'Sede Antigua', code: 'OLD', direccion: 'Calle 1', address: 'Calle 1' };
      const updateDto = { name: 'Sede Renovada' };
      
      mockPrismaService.client.sede.findUnique.mockResolvedValue(currentSede);
      mockPrismaService.client.sede.update.mockResolvedValue({
        ...currentSede,
        nombre: 'Sede Renovada',
        name: 'Sede Renovada',
      });

      const result = await service.update(1, updateDto);

      expect((result as any).name).toBe('Sede Renovada');
      expect(mockPrismaService.client.sede.update).toHaveBeenCalled();
    });
  });

  // --- 5. MÉTODO: remove ---
  describe('remove', () => {
    it('debería eliminar la sede si pasa la validación de existencia', async () => {
      const currentSede = { id: 5, nombre: 'Sede a Borrar', name: 'Sede a Borrar' };
      mockPrismaService.client.sede.findUnique.mockResolvedValue(currentSede);
      mockPrismaService.client.sede.delete.mockResolvedValue(currentSede);

      const result = await service.remove(5);

      expect(result).toEqual({ deleted: true });
      expect(mockPrismaService.client.sede.delete).toHaveBeenCalledWith({
        where: { id: 5 },
      });
    });
  });
});
