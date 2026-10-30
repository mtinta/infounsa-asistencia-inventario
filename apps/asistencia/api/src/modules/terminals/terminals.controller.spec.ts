import { Test, TestingModule } from '@nestjs/testing';
import { TerminalsController } from './terminals.controller';
import { TerminalsService } from './terminals.service';

describe('Pruebas Unitarias: TerminalsController', () => {
  let controller: TerminalsController;
  let service: TerminalsService;

  const mockTerminalsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TerminalsController],
      providers: [
        {
          provide: TerminalsService,
          useValue: mockTerminalsService,
        },
      ],
    }).compile();

    controller = module.get<TerminalsController>(TerminalsController);
    service = module.get<TerminalsService>(TerminalsService);

    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('debería delegar la consulta de terminales al servicio', async () => {
      const mockResult = [{ id: 'TERM-01', name: 'Terminal 1', ip: '127.0.0.1', status: 'ACTIVE' }];
      mockTerminalsService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll();

      expect(result).toEqual(mockResult);
      expect(service.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('debería buscar un terminal por ID numérico', async () => {
      const mockResult = { id: 1, name: 'Terminal 1', code: 'TERM-01' };
      mockTerminalsService.findOne.mockResolvedValue(mockResult);

      const result = await controller.findOne(1);

      expect(result).toEqual(mockResult);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('debería crear un nuevo terminal a través del servicio', async () => {
      const body = { name: 'Terminal 2', code: 'TERM-02' };
      const mockResult = { id: 2, ...body, status: 'activo' };
      mockTerminalsService.create.mockResolvedValue(mockResult);

      const result = await controller.create(body);

      expect(result).toEqual(mockResult);
      expect(service.create).toHaveBeenCalledWith(body);
    });
  });

  describe('update', () => {
    it('debería actualizar un terminal existente', async () => {
      const body = { name: 'Terminal Modificado' };
      const mockResult = { id: 1, name: 'Terminal Modificado', code: 'TERM-01' };
      mockTerminalsService.update.mockResolvedValue(mockResult);

      const result = await controller.update(1, body);

      expect(result).toEqual(mockResult);
      expect(service.update).toHaveBeenCalledWith(1, body);
    });
  });

  describe('remove', () => {
    it('debería eliminar un terminal y devolver confirmación', async () => {
      const mockResult = { deleted: true, id: 1 };
      mockTerminalsService.remove.mockResolvedValue(mockResult);

      const result = await controller.remove(1);

      expect(result).toEqual(mockResult);
      expect(service.remove).toHaveBeenCalledWith(1);
    });
  });
});
