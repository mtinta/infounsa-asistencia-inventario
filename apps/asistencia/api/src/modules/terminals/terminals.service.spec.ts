import { Test, TestingModule } from '@nestjs/testing';
import { TerminalsService } from './terminals.service';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('Pruebas Unitarias: TerminalsService', () => {
  let service: TerminalsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    client: {
      terminal: {
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
        TerminalsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TerminalsService>(TerminalsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debería retornar terminales operacionales mapeados si existen en tabla terminal', async () => {
      const mockSyncTerminals = [
        {
          id: 'TERM-001',
          name: 'Kiosco Terminal (TERM-001)',
          sede: { nombre: 'Sede Central' },
          estado: true,
          status: 'activo',
          _count: { asistencias: 42 },
        },
      ];
      mockPrismaService.client.terminal.findMany.mockResolvedValue(mockSyncTerminals);

      const result = await service.findAll();

      expect(result).toEqual([
        {
          id: 'TERM-001',
          name: 'Kiosco Terminal (TERM-001)',
          ip: 'TERM-001',
          sede: 'Sede Central',
          status: 'ACTIVE',
          total_asistencias: 42,
        },
      ]);
      expect(mockPrismaService.client.terminal.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('debería retornar el terminal si existe', async () => {
      const mockTerminal = { id: 1, name: 'Kiosco 1', code: 'K1', status: 'activo' };
      mockPrismaService.client.terminal.findUnique.mockResolvedValue(mockTerminal);

      const result = await service.findOne(1);

      expect(result).toEqual(mockTerminal);
      expect(mockPrismaService.client.terminal.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('debería lanzar NotFoundException si no existe', async () => {
      mockPrismaService.client.terminal.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('debería crear un nuevo terminal con estado activo por defecto', async () => {
      const input = { name: 'Nuevo Terminal', code: 'TERM-NEW' };
      const created = { id: 'TERM-NEW', ...input, status: 'activo' };
      mockPrismaService.client.terminal.create.mockResolvedValue(created);

      const result = await service.create(input);

      expect(result).toEqual(created);
      expect(mockPrismaService.client.terminal.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('debería actualizar el terminal existente', async () => {
      const existing = { id: 1, name: 'Antiguo', code: 'OLD', status: 'activo' };
      const updated = { id: 1, name: 'Actualizado', code: 'OLD', status: 'inactivo' };
      mockPrismaService.client.terminal.findUnique.mockResolvedValue(existing);
      mockPrismaService.client.terminal.update.mockResolvedValue(updated);

      const result = await service.update(1, { name: 'Actualizado', status: 'inactivo' });

      expect(result).toEqual(updated);
      expect(mockPrismaService.client.terminal.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('debería eliminar el terminal y retornar confirmación', async () => {
      const existing = { id: 1, name: 'Terminal A Eliminar' };
      mockPrismaService.client.terminal.findUnique.mockResolvedValue(existing);
      mockPrismaService.client.terminal.delete.mockResolvedValue(existing);

      const result = await service.remove(1);

      expect(result).toEqual({ deleted: true, id: 1 });
      expect(mockPrismaService.client.terminal.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });
});
