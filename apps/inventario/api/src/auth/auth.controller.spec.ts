import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

describe('Pruebas Unitarias: AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  // Mock estructurado de las funciones de AuthService
  const mockAuthService = {
    login: jest.fn(),
    register: jest.fn(),
    refresh: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);

    // Limpiamos los mocks en cada ejecución
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('deberia dejar publicos login y refresh, pero exigir administrador para registrar', () => {
    const prototype = Object.getPrototypeOf(controller);

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, prototype.login)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, prototype.refresh)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, prototype.register)).not.toBe(true);
    expect(Reflect.getMetadata(ROLES_KEY, prototype.register)).toEqual(['administrador']);
  });

  // --- 1. ENDPOINT: POST /auth/login ---
  describe('login', () => {
    it('debería procesar las credenciales del usuario y retornar los tokens de acceso', async () => {
      const loginDto: LoginDto = { username: 'admin', password: 'password123' };
      const mockTokenResponse = {
        access_token: 'jwt-access-token-xyz',
        refresh_token: 'jwt-refresh-token-abc',
        user: { id: 1, username: 'admin', role: 'administrador' },
      };
      mockAuthService.login.mockResolvedValue(mockTokenResponse);

      const result = await controller.login(loginDto);

      expect(result).toEqual(mockTokenResponse);
      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto);
    });
  });

  // --- 2. ENDPOINT: POST /auth/register ---
  describe('register', () => {
    it('debería enviar los datos de registro al servicio y retornar el usuario creado con estatus 201', async () => {
      // Quitamos 'name' para cumplir estrictamente con tu RegisterDto
      const registerDto = {
        username: 'operador1',
        password: 'securePassword',
      };
      const mockCreatedResponse = {
        id: 2,
        username: 'operador1',
        message: 'Usuario registrado exitosamente',
      };
      mockAuthService.register.mockResolvedValue(mockCreatedResponse);

      const result = await controller.register(registerDto as any);

      expect(result).toEqual(mockCreatedResponse);
      expect(mockAuthService.register).toHaveBeenCalledWith(registerDto);
    });
  });

  // --- 3. ENDPOINT: POST /auth/refresh ---
  describe('refresh', () => {
    it('debería extraer el refresh_token del cuerpo de la petición y retornar un nuevo par de tokens', async () => {
      const currentRefreshToken = 'token-antiguo-de-refresco';
      const mockNewTokens = {
        access_token: 'nuevo-jwt-access-token',
        refresh_token: 'nuevo-jwt-refresh-token',
      };
      mockAuthService.refresh.mockResolvedValue(mockNewTokens);

      const result = await controller.refresh(currentRefreshToken);

      expect(result).toEqual(mockNewTokens);
      expect(mockAuthService.refresh).toHaveBeenCalledWith(currentRefreshToken);
    });
  });
});
