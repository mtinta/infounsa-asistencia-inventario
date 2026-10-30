import { Test, TestingModule } from '@nestjs/testing';
import { SedesController } from './sedes.controller';
import { SedesService } from './sedes.service';

describe('Pruebas Unitarias: SedesController', () => {
  let controller: SedesController;
  let service: SedesService;

  // Creamos el simulador (mock) de las funciones del servicio
  const mockSedesService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SedesController],
      providers: [
        {
          provide: SedesService,
          useValue: mockSedesService,
        },
      ],
    }).compile();

    controller = module.get<SedesController>(SedesController);
    service = module.get<SedesService>(SedesService);

    // Limpiamos los mocks antes de cada prueba individual
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  // --- 1. ENDPOINT: GET /sedes ---
  describe('findAll', () => {
    it('debería retornar un arreglo de sedes delegando la petición al servicio', async () => {
      const mockResult = [
        { id: 1, name: 'Sede Central', code: 'SD-CENTRAL', address: 'Av. Venezuela' },
        { id: 2, name: 'Sede Ingenierías', code: 'SD-ING', address: 'Av. Independencia' },
      ];
      mockSedesService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll();

      expect(result).toEqual(mockResult);
      expect(mockSedesService.findAll).toHaveBeenCalledTimes(1);
    });
  });

  // --- 2. ENDPOINT: GET /sedes/:id ---
  describe('findOne', () => {
    it('debería retornar una sola sede basándose en el ID numérico proporcionado', async () => {
      const mockResult = { id: 1, name: 'Sede Central', code: 'SD-CENTRAL' };
      mockSedesService.findOne.mockResolvedValue(mockResult);

      const result = await controller.findOne(1);

      expect(result).toEqual(mockResult);
      expect(mockSedesService.findOne).toHaveBeenCalledWith(1);
    });
  });

  // --- 3. ENDPOINT: POST /sedes ---
  describe('create', () => {
    it('debería enviar el cuerpo de la petición al servicio para crear una sede', async () => {
      const bodyDto = { name: 'Sede Biomédicas', code: 'SD-BIO', address: 'Av. Alcides Carrión' };
      const mockResult = { id: 3, ...bodyDto };
      mockSedesService.create.mockResolvedValue(mockResult);

      const result = await controller.create(bodyDto);

      expect(result).toEqual(mockResult);
      expect(mockSedesService.create).toHaveBeenCalledWith(bodyDto);
    });
  });

  // --- 4. ENDPOINT: PUT /sedes/:id ---
  describe('update', () => {
    it('debería enviar el ID y el cuerpo parcial al servicio para actualizar la sede', async () => {
      const updateDto = { name: 'Sede Central Modificada' };
      const mockResult = { id: 1, name: 'Sede Central Modificada', code: 'SD-CENTRAL' };
      mockSedesService.update.mockResolvedValue(mockResult);

      const result = await controller.update(1, updateDto);

      expect(result).toEqual(mockResult);
      expect(mockSedesService.update).toHaveBeenCalledWith(1, updateDto);
    });
  });

  // --- 5. ENDPOINT: DELETE /sedes/:id ---
  describe('remove', () => {
    it('debería solicitar al servicio la eliminación de la sede por su ID', async () => {
      const mockResult = { deleted: true, id: 1 };
      mockSedesService.remove.mockResolvedValue(mockResult);

      const result = await controller.remove(1);

      expect(result).toEqual(mockResult);
      expect(mockSedesService.remove).toHaveBeenCalledWith(1);
    });
  });
});