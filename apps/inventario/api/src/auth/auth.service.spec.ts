import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';

// SOLUCIÓN BCRYPT: Simulación limpia a nivel de módulo antes de que se congele
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

// Importamos la librería mockeada para poder alterar sus respuestas en los tests
import * as bcrypt from 'bcrypt';

describe('Pruebas Unitarias: AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  const mockPrismaService = {
    client: {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);

    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  // --- 1. MÉTODO: login ---
  describe('login', () => {
    const loginDto = { username: 'admin', password: 'password123' };

    it('debería autenticar con éxito y retornar los tokens si las credenciales son válidas', async () => {
      const mockUser = {
        id: 1,
        username: 'admin',
        password: 'hashedPassword123',
        full_name: 'Administrador Base',
        role: 'administrador',
        status: 'activo',
      };

      mockPrismaService.client.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('mocked-token');

      const result = await service.login(loginDto as any);

      expect(result).toHaveProperty('access_token', 'mocked-token');
      expect(result.user.username).toBe('admin');
    });

    it('deberia rechazar un usuario inactivo aunque la contrasena sea correcta', async () => {
      const mockUser = {
        id: 1,
        username: 'admin',
        password: 'hashedPassword123',
        full_name: 'Administrador Base',
        role: 'administrador',
        status: 'inactivo',
      };

      mockPrismaService.client.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login(loginDto as any)).rejects.toThrow(
        new UnauthorizedException('El usuario esta inactivo o eliminado'),
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('debería lanzar UnauthorizedException si el usuario no existe', async () => {
      mockPrismaService.client.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto as any)).rejects.toThrow(
        new UnauthorizedException('Credenciales invalidas'),
      );
    });

    it('debería lanzar UnauthorizedException si la contraseña no coincide', async () => {
      const mockUser = { id: 1, username: 'admin', password: 'hashedPassword123', status: 'activo' };
      mockPrismaService.client.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto as any)).rejects.toThrow(
        new UnauthorizedException('Credenciales invalidas'),
      );
    });
  });

  // --- 2. MÉTODO: register ---
  describe('register', () => {
    const registerDto = {
      fullName: 'Juan Operador',
      email: 'juan@infounsa.com',
      username: 'juanop',
      password: 'passwordSecure',
    };

    it('debería registrar un nuevo operador exitosamente', async () => {
      mockPrismaService.client.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      
      const mockCreatedUser = {
        id: 2,
        username: 'juanop',
        email: 'juan@infounsa.com',
        full_name: 'Juan Operador',
        role: 'operador',
        status: 'activo',
      };
      mockPrismaService.client.user.create.mockResolvedValue(mockCreatedUser);

      const result = await service.register(registerDto as any);

      expect(result.message).toBe('Operador de almacen registrado exitosamente');
      expect(mockPrismaService.client.user.create).toHaveBeenCalled();
    });

    it('debería lanzar ConflictException si el username ya está en uso', async () => {
      mockPrismaService.client.user.findUnique.mockResolvedValueOnce({ id: 1, username: 'juanop' });

      await expect(service.register(registerDto as any)).rejects.toThrow(
        new ConflictException('El nombre de usuario ya esta en uso'),
      );
    });

    it('debería lanzar ConflictException si el correo electrónico ya está registrado', async () => {
      mockPrismaService.client.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, email: 'juan@infounsa.com' });

      await expect(service.register(registerDto as any)).rejects.toThrow(
        new ConflictException('El correo electronico ya esta registrado'),
      );
    });
  });

  // --- 3. MÉTODO: refresh ---
  describe('refresh', () => {
    it('debería emitir un nuevo access_token si el token de refresco es del subsistema correcto', async () => {
      const validPayload = { sub: 1, username: 'admin', role: 'administrador', subsystem: 'inventario' };
      mockJwtService.verify.mockReturnValue(validPayload);
      mockJwtService.sign.mockReturnValue('new-access-token');
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        username: 'admin',
        role: 'administrador',
        status: 'activo',
      });

      const result = await service.refresh('token-valido');

      expect(result).toEqual({ access_token: 'new-access-token' });
    });

    it('deberia rechazar el refresh de un usuario inactivo', async () => {
      const validPayload = { sub: 1, username: 'admin', role: 'administrador', subsystem: 'inventario' };
      mockJwtService.verify.mockReturnValue(validPayload);
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        username: 'admin',
        role: 'administrador',
        status: 'inactivo',
      });

      await expect(service.refresh('token-de-usuario-inactivo')).rejects.toThrow(
        new UnauthorizedException('Token de refresco invalido o expirado'),
      );
    });

    it('debería lanzar UnauthorizedException si pertenece a otro subsistema', async () => {
      const invalidPayload = { sub: 1, username: 'admin', role: 'administrador', subsystem: 'asistencia' };
      mockJwtService.verify.mockReturnValue(invalidPayload);

      // Corregido el String esperado por el catch de tu servicio real
      await expect(service.refresh('token-de-otro-sistema')).rejects.toThrow(
        new UnauthorizedException('Token de refresco invalido o expirado'),
      );
    });

    it('debería lanzar UnauthorizedException si el token está manipulado o expiró', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('JWT expired');
      });

      await expect(service.refresh('token-expirado')).rejects.toThrow(
        new UnauthorizedException('Token de refresco invalido o expirado'),
      );
    });
  });
});
