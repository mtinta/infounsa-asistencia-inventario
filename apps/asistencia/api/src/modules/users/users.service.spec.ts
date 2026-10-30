import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('Pruebas Unitarias: UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    client: {
      usuario: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debería retornar la lista de usuarios administrativos ordenados por id', async () => {
      const mockUsers = [
        { id: 1, username: 'admin', email: 'admin@unsa.edu.pe', full_name: 'Admin', status: 'activo' },
      ];
      mockPrismaService.client.usuario.findMany.mockResolvedValue(mockUsers);

      const result = await service.findAll();

      expect(result).toEqual(mockUsers);
      expect(mockPrismaService.client.usuario.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAttendanceUsers', () => {
    it('debería retornar usuarios activos del padrón para sincronización de asistencia', async () => {
      const mockAttendanceUsers = [
        { id: '1', dni: '12345678', nombres: 'Juan', apellido_paterno: 'Perez', apellido_materno: 'Gomez', estado: true },
      ];
      mockPrismaService.client.usuario.findMany.mockResolvedValue(mockAttendanceUsers);

      const result = await service.findAttendanceUsers();

      expect(result).toEqual(mockAttendanceUsers);
      expect(mockPrismaService.client.usuario.findMany).toHaveBeenCalledWith({
        where: { estado: true },
        orderBy: [
          { apellido_paterno: 'asc' },
          { apellido_materno: 'asc' },
          { nombres: 'asc' },
        ],
      });
    });
  });

  describe('findOne', () => {
    it('debería retornar los detalles del usuario con su rol mapeado', async () => {
      const mockUser = {
        id: 1,
        username: 'operador1',
        email: 'op@unsa.edu.pe',
        full_name: 'Operador Uno',
        status: 'activo',
        role_id: 2,
        sede_id: 1,
        created_at: new Date(),
        role: { name: 'operador' },
      };
      mockPrismaService.client.usuario.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne(1);

      expect(result).toEqual({
        id: 1,
        username: 'operador1',
        email: 'op@unsa.edu.pe',
        full_name: 'Operador Uno',
        status: 'activo',
        role_id: 2,
        sede_id: 1,
        role: 'operador',
      });
    });

    it('debería lanzar NotFoundException si el usuario no existe', async () => {
      mockPrismaService.client.usuario.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('debería requerir contraseña de al menos 8 caracteres', async () => {
      await expect(
        service.create({ username: 'nuevo', email: 'n@unsa.edu.pe', password: '123' })
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create({ username: 'nuevo', email: 'n@unsa.edu.pe', password: '' })
      ).rejects.toThrow(BadRequestException);
    });

    it('debería encriptar la contraseña con bcrypt y crear el usuario', async () => {
      const input = {
        username: 'nuevo_op',
        email: 'nuevo@unsa.edu.pe',
        password: 'PasswordSeguro123',
        full_name: 'Nuevo Operador',
      };
      const created = {
        id: 3,
        username: 'nuevo_op',
        email: 'nuevo@unsa.edu.pe',
        full_name: 'Nuevo Operador',
        status: 'activo',
        role_id: 2,
        sede_id: 1,
      };
      mockPrismaService.client.usuario.create.mockResolvedValue(created);

      const result = await service.create(input);

      expect(result).toEqual(created);
      expect(mockPrismaService.client.usuario.create).toHaveBeenCalled();
      const createCall = mockPrismaService.client.usuario.create.mock.calls[0][0];
      expect(createCall.data.username).toBe('nuevo_op');
      // Verify password was hashed (bcrypt hash format starts with $2)
      expect(createCall.data.password).toMatch(/^\$2[aby]\$/);
    });
  });

  describe('update', () => {
    it('debería lanzar NotFoundException si el usuario a actualizar no existe', async () => {
      mockPrismaService.client.usuario.findUnique.mockResolvedValue(null);

      await expect(service.update(999, { full_name: 'Otro' })).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar BadRequestException si se provee una contraseña de menos de 8 caracteres', async () => {
      mockPrismaService.client.usuario.findUnique.mockResolvedValue({ id: 1, password: 'hash_anterior' });

      await expect(service.update(1, { password: 'corta' })).rejects.toThrow(BadRequestException);
    });

    it('debería actualizar campos sin modificar contraseña si password es undefined', async () => {
      const current = { id: 1, username: 'user1', email: 'u1@unsa.pe', password: 'old_hashed_password', full_name: 'Nombre Antiguo', status: 'activo', role_id: 2, sede_id: 1 };
      const updated = { id: 1, username: 'user1', email: 'u1@unsa.pe', full_name: 'Nombre Nuevo', status: 'activo', role_id: 2, sede_id: 1 };
      mockPrismaService.client.usuario.findUnique.mockResolvedValue(current);
      mockPrismaService.client.usuario.update.mockResolvedValue(updated);

      const result = await service.update(1, { full_name: 'Nombre Nuevo' });

      expect(result).toEqual(updated);
      const updateCall = mockPrismaService.client.usuario.update.mock.calls[0][0];
      expect(updateCall.data.password).toBe('old_hashed_password');
      expect(updateCall.data.full_name).toBe('Nombre Nuevo');
    });
  });

  describe('remove', () => {
    it('debería aplicar borrado lógico actualizando el estado a "eliminado"', async () => {
      const user = { id: 1, username: 'user_delete', email: 'd@unsa.pe', role: { name: 'operador' } };
      mockPrismaService.client.usuario.findUnique.mockResolvedValue(user);
      mockPrismaService.client.usuario.update.mockResolvedValue({ ...user, status: 'eliminado' });

      const result = await service.remove(1);

      expect(result).toEqual({ deleted: true, id: 1 });
      expect(mockPrismaService.client.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'eliminado', estado: false },
      });
    });
  });
});
