import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

describe('Pruebas Unitarias: CategoriesController', () => {
  let controller: CategoriesController;
  let service: CategoriesService;

  // Mock estructurado para el servicio de Categorías
  const mockCategoriesService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
          useValue: mockCategoriesService,
        },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
    service = module.get<CategoriesService>(CategoriesService);

    // Limpiamos el historial de los mocks en cada prueba
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  // --- 1. ENDPOINT: GET /categories ---
  describe('findAll', () => {
    it('debería obtener el listado completo de categorías', async () => {
      const mockResult = [
        { id: 1, name: 'Tecnología', description: 'Equipos electrónicos' },
        { id: 2, name: 'Oficina', description: 'Útiles de escritorio' },
      ];
      mockCategoriesService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll();

      expect(result).toEqual(mockResult);
      expect(mockCategoriesService.findAll).toHaveBeenCalledTimes(1);
    });
  });

  // --- 2. ENDPOINT: GET /categories/:id ---
  describe('findOne', () => {
    it('debería retornar una categoría específica según el ID', async () => {
      const mockResult = { id: 1, name: 'Tecnología', description: 'Equipos electrónicos' };
      mockCategoriesService.findOne.mockResolvedValue(mockResult);

      const result = await controller.findOne(1);

      expect(result).toEqual(mockResult);
      expect(mockCategoriesService.findOne).toHaveBeenCalledWith(1);
    });
  });

  // --- 3. ENDPOINT: POST /categories ---
  describe('create', () => {
    it('debería enviar los datos del body al servicio para registrar una nueva categoría', async () => {
      const body = { name: 'Herramientas', description: 'Equipo de mantenimiento' };
      const mockResult = { id: 3, ...body };
      mockCategoriesService.create.mockResolvedValue(mockResult);

      const result = await controller.create(body);

      expect(result).toEqual(mockResult);
      expect(mockCategoriesService.create).toHaveBeenCalledWith(body);
    });
  });

  // --- 4. ENDPOINT: PUT /categories/:id ---
  describe('update', () => {
    it('debería enviar el ID y el body modificado al servicio para su actualización', async () => {
      const body = { description: 'Descripción de tecnología actualizada' };
      const mockResult = { id: 1, name: 'Tecnología', description: 'Descripción de tecnología actualizada' };
      mockCategoriesService.update.mockResolvedValue(mockResult);

      const result = await controller.update(1, body);

      expect(result).toEqual(mockResult);
      expect(mockCategoriesService.update).toHaveBeenCalledWith(1, body);
    });
  });

  // --- 5. ENDPOINT: DELETE /categories/:id ---
  describe('remove', () => {
    it('debería invocar la eliminación de la categoría pasando su ID', async () => {
      const mockResult = { id: 2, name: 'Oficina', deleted: true };
      mockCategoriesService.remove.mockResolvedValue(mockResult);

      const result = await controller.remove(2);

      expect(result).toEqual(mockResult);
      expect(mockCategoriesService.remove).toHaveBeenCalledWith(2);
    });
  });
});
