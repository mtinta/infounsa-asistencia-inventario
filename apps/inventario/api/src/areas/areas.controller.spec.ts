import { Test, TestingModule } from '@nestjs/testing';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';

describe('Pruebas Unitarias: AreasController', () => {
  let controller: AreasController;
  let service: AreasService;

  // Mock de los métodos del servicio de Áreas
  const mockAreasService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AreasController],
      providers: [
        {
          provide: AreasService,
          useValue: mockAreasService,
        },
      ],
    }).compile();

    controller = module.get<AreasController>(AreasController);
    service = module.get<AreasService>(AreasService);

    // Limpiamos los mocks antes de cada test unitario
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  // --- 1. ENDPOINT: GET /areas ---
  describe('findAll', () => {
    it('debería retornar un arreglo de áreas llamando al servicio', async () => {
      const mockResult = [
        { id: 1, name: 'Almacén Central', description: 'Inventario general' },
        { id: 2, name: 'Sistemas', description: 'Equipos tecnológicos' },
      ];
      mockAreasService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll();

      expect(result).toEqual(mockResult);
      expect(mockAreasService.findAll).toHaveBeenCalledTimes(1);
    });
  });

  // --- 2. ENDPOINT: GET /areas/:id ---
  describe('findOne', () => {
    it('debería retornar una sola área según el ID provisto', async () => {
      const mockResult = { id: 1, name: 'Almacén Central', description: 'Inventario general' };
      mockAreasService.findOne.mockResolvedValue(mockResult);

      const result = await controller.findOne(1);

      expect(result).toEqual(mockResult);
      expect(mockAreasService.findOne).toHaveBeenCalledWith(1);
    });
  });

  // --- 3. ENDPOINT: POST /areas ---
  describe('create', () => {
    it('debería enviar el cuerpo de la petición al servicio para registrar una nueva área', async () => {
      const bodyDto = { name: 'Laboratorio Química', description: 'Reactivos e insumos' };
      const mockResult = { id: 3, ...bodyDto };
      mockAreasService.create.mockResolvedValue(mockResult);

      const result = await controller.create(bodyDto);

      expect(result).toEqual(mockResult);
      expect(mockAreasService.create).toHaveBeenCalledWith(bodyDto);
    });
  });

  // --- 4. ENDPOINT: PUT /areas/:id ---
  describe('update', () => {
    it('debería pasar el ID y los datos correspondientes al servicio para su actualización', async () => {
      const updateDto = { description: 'Descripción de almacén actualizada' };
      const mockResult = { id: 1, name: 'Almacén Central', description: 'Descripción de almacén actualizada' };
      mockAreasService.update.mockResolvedValue(mockResult);

      const result = await controller.update(1, updateDto);

      expect(result).toEqual(mockResult);
      expect(mockAreasService.update).toHaveBeenCalledWith(1, updateDto);
    });
  });

  // --- 5. ENDPOINT: DELETE /areas/:id ---
  describe('remove', () => {
    it('debería solicitar al servicio la remoción o baja del área por su ID', async () => {
      const mockResult = { deleted: true, id: 2 };
      mockAreasService.remove.mockResolvedValue(mockResult);

      const result = await controller.remove(2);

      expect(result).toEqual(mockResult);
      expect(mockAreasService.remove).toHaveBeenCalledWith(2);
    });
  });
});