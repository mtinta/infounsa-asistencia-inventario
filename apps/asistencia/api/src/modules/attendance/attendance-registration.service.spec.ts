import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceRegistrationService } from './attendance-registration.service';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('Pruebas Unitarias: AttendanceRegistrationService', () => {
  let service: AttendanceRegistrationService;

  const mockPrismaService = {
    client: {
      asistencia: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      sede: {
        findUnique: jest.fn(),
      },
      terminal: {
        findUnique: jest.fn(),
      },
      usuario: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceRegistrationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AttendanceRegistrationService>(AttendanceRegistrationService);
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('validateBarcodeOrDni', () => {
    it('debería validar DNI estándar de 8 dígitos', () => {
      const res = service.validateBarcodeOrDni('72345678');
      expect(res.isValid).toBe(true);
      expect(res.type).toBe('dni');
      expect(res.sanitized).toBe('72345678');
    });

    it('debería identificar DNI de menor (00000000)', () => {
      const res = service.validateBarcodeOrDni('00000000');
      expect(res.isValid).toBe(true);
      expect(res.type).toBe('minor');
    });

    it('debería identificar DNI o código de visitante (VISIT...)', () => {
      const res = service.validateBarcodeOrDni('VISIT001');
      expect(res.isValid).toBe(true);
      expect(res.type).toBe('visitor');
    });

    it('debería identificar código de barras alfanumérico', () => {
      const res = service.validateBarcodeOrDni('BARCODE-999');
      expect(res.isValid).toBe(true);
      expect(res.type).toBe('barcode');
    });

    it('debería rechazar formatos no reconocidos', () => {
      const res = service.validateBarcodeOrDni('123');
      expect(res.isValid).toBe(false);
      expect(res.type).toBe('invalid');
    });
  });

  describe('buildVisitorObservation', () => {
    it('debería concatenar los campos de visitante con formato limpio', () => {
      const obs = service.buildVisitorObservation({
        visitante_nombre: 'Juan Perez',
        visitante_motivo: 'Reunión',
        visitante_observacion: 'Entregó DNI',
      });
      expect(obs).toBe('Visitante: Juan Perez | Motivo: Reunión | Obs: Entregó DNI');
    });

    it('debería retornar observacion base si no hay campos de visitante', () => {
      const obs = service.buildVisitorObservation({
        observacion: 'Observación estándar',
      });
      expect(obs).toBe('Observación estándar');
    });
  });

  describe('register', () => {
    const mockData = {
      usuario_id: 'USR-1',
      terminal_id: 'TERM-1',
      sede_id: 'SEDE-1',
      fecha_hora_marca: '2026-07-05T12:00:00Z',
      id_operacion_local: 'OP-100',
    };

    it('debería retornar registro existente con duplicated: true', async () => {
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue({ id: 'ASIS-1' });

      const result = await service.register(mockData);

      expect(result).toHaveProperty('duplicated', true);
      expect(mockPrismaService.client.asistencia.create).not.toHaveBeenCalled();
    });

    it('debería lanzar error si la sede no existe', async () => {
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue(null);
      mockPrismaService.client.sede.findUnique.mockResolvedValue(null);

      await expect(service.register(mockData)).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar error si el terminal no existe o no corresponde a la sede', async () => {
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue(null);
      mockPrismaService.client.sede.findUnique.mockResolvedValue({ id: 'SEDE-1' });
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'TERM-1', sede_id: 'OTRA' });

      await expect(service.register(mockData)).rejects.toThrow(BadRequestException);
    });

    it('debería registrar exitosamente la marcación', async () => {
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue(null);
      mockPrismaService.client.sede.findUnique.mockResolvedValue({ id: 'SEDE-1' });
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'TERM-1', sede_id: 'SEDE-1' });
      mockPrismaService.client.usuario.findUnique.mockResolvedValue({ id: 'USR-1' });
      mockPrismaService.client.asistencia.create.mockResolvedValue({ id: 'ASIS-OK' });

      const result = await service.register(mockData);

      expect(result).toEqual({ id: 'ASIS-OK' });
      expect(mockPrismaService.client.asistencia.create).toHaveBeenCalled();
    });
  });

  describe('registerVisitor', () => {
    it('debería lanzar BadRequestException si el nombre del visitante tiene menos de 3 caracteres', async () => {
      await expect(
        service.registerVisitor({
          nombre: 'Al',
          terminal_id: 'TERM-1',
          sede_id: 'SEDE-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería registrar el visitante creando o asociando el usuario correspondiente', async () => {
      mockPrismaService.client.usuario.findFirst.mockResolvedValue(null);
      mockPrismaService.client.usuario.create.mockResolvedValue({ id: 'usr-VISIT000' });
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue(null);
      mockPrismaService.client.sede.findUnique.mockResolvedValue({ id: 'SEDE-1' });
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'TERM-1', sede_id: 'SEDE-1' });
      mockPrismaService.client.usuario.findUnique.mockResolvedValue({ id: 'usr-VISIT000' });
      mockPrismaService.client.asistencia.create.mockResolvedValue({ id: 'VISIT-OK' });

      const result = await service.registerVisitor({
        nombre: 'Carlos Santana',
        motivo: 'Auditoría',
        terminal_id: 'TERM-1',
        sede_id: 'SEDE-1',
      });

      expect(result).toEqual({ id: 'VISIT-OK' });
    });
  });

  describe('updateLog y deleteLog', () => {
    it('debería actualizar el registro si existe', async () => {
      mockPrismaService.client.asistencia.findFirst.mockResolvedValue({ id: 'A1', tipo: 'entrada' });
      mockPrismaService.client.asistencia.update.mockResolvedValue({ id: 'A1', tipo: 'salida', estado_auditoria: 'editado' });

      const result = await service.updateLog('A1', { tipo: 'salida' });

      expect(result.tipo).toBe('salida');
      expect(mockPrismaService.client.asistencia.update).toHaveBeenCalled();
    });

    it('debería marcar como borrado en deleteLog', async () => {
      mockPrismaService.client.asistencia.findFirst.mockResolvedValue({ id: 'A1' });
      mockPrismaService.client.asistencia.update.mockResolvedValue({ id: 'A1', estado_auditoria: 'borrado' });

      const result = await service.deleteLog('A1');

      expect(result.estado_auditoria).toBe('borrado');
    });
  });
});
