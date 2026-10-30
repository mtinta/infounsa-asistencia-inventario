import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('Pruebas Unitarias: CategoriesService', () => {
  let service: CategoriesService;
  let prisma: PrismaService;

  // Mock estructurado para el modelo 'category' de Prisma
  const mockPrismaService = {
    client: {
      category: {
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
        CategoriesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    prisma = module.get<PrismaService>(PrismaService);

    // Limpiamos los mocks antes de cada test unitario
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  // --- 1. MÉTODO: findAll ---
  describe('findAll', () => {
    it('debería retornar una lista de categorías ordenadas por ID de forma ascendente', async () => {
      const mockCategories = [
        { id: 1, name: 'Tecnología', description: 'Gadgets' },
        { id: 2, name: 'Hogar', description: 'Muebles' },
      ];
      mockPrismaService.client.category.findMany.mockResolvedValue(mockCategories);

      const result = await service.findAll();

      expect(result).toEqual(mockCategories);
      expect(mockPrismaService.client.category.findMany).toHaveBeenCalledWith({
        orderBy: { id: 'asc' },
      });
    });
  });

  // --- 2. MÉTODO: findOne ---
  describe('findOne', () => {
    it('debería retornar el registro completo de la categoría si el ID existe', async () => {
      const mockCategory = { id: 1, name: 'Tecnología', description: 'Gadgets' };
      mockPrismaService.client.category.findUnique.mockResolvedValue(mockCategory);

      const result = await service.findOne(1);

      expect(result).toEqual(mockCategory);
      expect(mockPrismaService.client.category.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('debería lanzar un NotFoundException si el ID provisto no existe', async () => {
      mockPrismaService.client.category.findUnique.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(
        new NotFoundException('Categoria con ID 99 no encontrada'),
      );
    });
  });

  // --- 3. MÉTODO: create ---
  describe('create', () => {
    it('debería registrar una nueva categoría mapeando sus propiedades', async () => {
      const inputData = { name: 'Ferretería', description: 'Herramientas manuales' };
      const mockCreated = { id: 3, ...inputData };
      mockPrismaService.client.category.create.mockResolvedValue(mockCreated);

      const result = await service.create(inputData);

      expect(result).toEqual(mockCreated);
      expect(mockPrismaService.client.category.create).toHaveBeenCalledWith({
        data: inputData,
      });
    });
  });

  // --- 4. MÉTODO: update ---
  describe('update', () => {
    it('debería actualizar los campos provistos y mantener el resto usando coalescencia', async () => {
      const existingCategory = { id: 1, name: 'Tecnología Antigua', description: 'Descripción vieja' };
      const updateData = { name: 'Tecnología Avanzada' }; // No enviamos description
      
      mockPrismaService.client.category.findUnique.mockResolvedValue(existingCategory);
      mockPrismaService.client.category.update.mockResolvedValue({
        id: 1,
        name: 'Tecnología Avanzada',
        description: 'Descripción vieja',
      });

      const result = await service.update(1, updateData);

      expect(result.name).toBe('Tecnología Avanzada');
      expect(mockPrismaService.client.category.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          name: 'Tecnología Avanzada',
          description: 'Descripción vieja', // Se mantuvo la descripción original
        },
      });
    });
  });

  // --- 5. MÉTODO: remove ---
  describe('remove', () => {
    it('debería verificar la existencia de la categoría y retornar un objeto con el estado deleted', async () => {
      const existingCategory = { id: 2, name: 'Categoría Inútil', description: 'A borrar' };
      
      mockPrismaService.client.category.findUnique.mockResolvedValue(existingCategory);
      mockPrismaService.client.category.delete.mockResolvedValue(existingCategory);

      const result = await service.remove(2);

      expect(result).toEqual({ deleted: true, id: 2 });
      expect(mockPrismaService.client.category.delete).toHaveBeenCalledWith({
        where: { id: 2 },
      });
    });
  });
});