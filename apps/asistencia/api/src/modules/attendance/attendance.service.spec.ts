import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SyncAttendanceDto } from './dto/sync-attendance.dto';

describe('Pruebas Unitarias: AttendanceService', () => {
  let service: AttendanceService;
  let prisma: PrismaService;

  // Mock profundo para simular la estructura de Prisma Client
  const mockPrismaService = {
    client: {
      asistencia: {
        findUnique: jest.fn(),
        create: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      sede: {
        findUnique: jest.fn(),
      },
      terminal: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      usuario: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrismaService.client)),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  // --- 1. MÉTODO: parseReportRange (Validaciones de Fechas) ---
  describe('parseReportRange (Reglas de negocio de fechas)', () => {
    it('debería lanzar BadRequestException si faltan las fechas', () => {
      expect(() => (service as any).parseReportRange('', '')).toThrow(BadRequestException);
    });

    it('debería lanzar BadRequestException si las fechas son inválidas', () => {
      expect(() => (service as any).parseReportRange('fecha-invalida', '2026-07-05')).toThrow(BadRequestException);
    });

    it('debería lanzar BadRequestException si startDate es posterior a endDate', () => {
      expect(() => (service as any).parseReportRange('2026-07-10', '2026-07-05')).toThrow(BadRequestException);
    });

    it('debería lanzar BadRequestException si el rango excede los 90 días', () => {
      expect(() => (service as any).parseReportRange('2026-01-01', '2026-05-01')).toThrow(BadRequestException);
    });

    it('debería retornar objetos Date válidos si pasa los filtros', () => {
      const result = (service as any).parseReportRange('2026-07-01', '2026-07-05');
      expect(result.start).toBeInstanceOf(Date);
      expect(result.end).toBeInstanceOf(Date);
    });
  });

  // --- 2. MÉTODO: register ---
  describe('register (Registro Individual)', () => {
    const mockData = {
      usuario_id: 'USR-1',
      terminal_id: 'TERM-1',
      sede_id: 'SEDE-1',
      fecha_hora_marca: '2026-07-05T12:00:00Z',
      id_operacion_local: 'OP-100',
    };

    it('debería retornar el registro existente con la bandera duplicated si ya existe el ID operacional', async () => {
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue({ id: 'ASIS-9', id_operacion_local: 'OP-100' });

      const result = await service.register(mockData);

      expect(result).toHaveProperty('duplicated', true);
      expect(mockPrismaService.client.asistencia.create).not.toHaveBeenCalled();
    });

    it('debería lanzar BadRequestException si la sede no existe', async () => {
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue(null);
      mockPrismaService.client.sede.findUnique.mockResolvedValue(null);

      await expect(service.register(mockData)).rejects.toThrow(
        new BadRequestException('La sede con ID SEDE-1 no existe.'),
      );
    });

    it('debería lanzar BadRequestException si el terminal no pertenece a la sede', async () => {
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue(null);
      mockPrismaService.client.sede.findUnique.mockResolvedValue({ id: 'SEDE-1' });
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'TERM-1', sede_id: 'OTRA-SEDE' });

      await expect(service.register(mockData)).rejects.toThrow(BadRequestException);
    });

    it('debería crear la asistencia exitosamente si todo es válido', async () => {
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue(null);
      mockPrismaService.client.sede.findUnique.mockResolvedValue({ id: 'SEDE-1' });
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'TERM-1', sede_id: 'SEDE-1' });
      mockPrismaService.client.usuario.findUnique.mockResolvedValue({ id: 'USR-1' });
      mockPrismaService.client.asistencia.create.mockResolvedValue({ id: 'NUEVA-ASISTENCIA' });

      const result = await service.register(mockData);

      expect(result).toEqual({ id: 'NUEVA-ASISTENCIA' });
      expect(mockPrismaService.client.asistencia.create).toHaveBeenCalled();
    });
  });

  // --- 3. MÉTODO: getReports ---
  describe('getReports', () => {
    it('debería mapear correctamente los conteos de entradas y salidas ordenados', async () => {
      mockPrismaService.client.usuario.findMany.mockResolvedValue([
        {
          id: 'U1',
          nombre_completo: 'Alba Juan',
          asistencias: [{ tipo: 'entrada' }, { tipo: 'entrada' }, { tipo: 'salida' }],
        },
      ]);

      const result = await service.getReports('2026-07-01', '2026-07-05');

      expect(result[0]).toEqual({
        user_id: 'U1',
        full_name: 'Alba Juan',
        total_entradas: 2,
        total_salidas: 1,
      });
    });
  });

  // --- 4. MÉTODO: generatePdfStream / exportDailyReportPdf / generateExcelReport / generateAuditExcelReport ---
  describe('Reportes desacoplados (PDF y Excel)', () => {
    const mockAsistencias = [
      {
        id: 'A1',
        fecha_hora_marca: new Date('2026-07-05T08:00:00Z'),
        tipo: 'entrada',
        observacion: 'ninguna',
        estado_auditoria: 'nuevo',
        usuario: {
          id: 'U1',
          dni: '12345678',
          nombre_completo: 'Test, User',
          apellido_paterno: 'Test',
          apellido_materno: 'User',
          nombres: 'Prueba',
          condicion: 'Personal',
          cargo: 'Docente',
        }
      }
    ];

    it('debería generar un buffer PDF con su respectivo contentType', async () => {
      mockPrismaService.client.asistencia.findMany.mockResolvedValue(mockAsistencias);

      const result = await service.generatePdfStream({ startDate: '2026-07-01', endDate: '2026-07-05' });

      expect(result.contentType).toBe('application/pdf');
      expect(result.data).toBeInstanceOf(Buffer);
    });

    it('debería exportar PDF directamente en un Buffer con exportDailyReportPdf', async () => {
      mockPrismaService.client.asistencia.findMany.mockResolvedValue(mockAsistencias);

      const buffer = await service.exportDailyReportPdf({ startDate: '2026-07-01', endDate: '2026-07-05' });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('debería generar el reporte Excel directamente como Buffer sin depender de Response', async () => {
      mockPrismaService.client.asistencia.findMany.mockResolvedValue(mockAsistencias);

      const buffer = await service.generateExcelReport({ startDate: '2026-07-01', endDate: '2026-07-05' });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('debería generar el reporte de auditoría Excel directamente como Buffer sin depender de Response', async () => {
      mockPrismaService.client.asistencia.findMany.mockResolvedValue(mockAsistencias);

      const buffer = await service.generateAuditExcelReport({ startDate: '2026-07-01', endDate: '2026-07-05' });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  // --- 5. MÉTODO: syncLote (Sincronización Masiva) ---
  describe('syncLote', () => {
    const mockPayload: SyncAttendanceDto = {
      terminal_id: 'T1',
      sede_id: 'S1',
      registros: [
        {
          id_operacion_local: 'LOTE-1',
          usuario_id: 'U1',
          tipo: 'entrada',
          fecha_hora_marca: '2026-07-05T08:00:00Z',
          es_menor_manual: false,
        },
      ],
    };

    it('debería lanzar BadRequestException si es menor manual y el nombre tiene menos de 3 caracteres', async () => {
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'T1', sede_id: 'S1' });
      mockPrismaService.client.usuario.findUnique.mockResolvedValue({ id: 'USR-MENOR-GENERICO' }); // mock usuarioMenor

      const payloadConMenorInvalido: SyncAttendanceDto = {
        ...mockPayload,
        registros: [
          {
            id_operacion_local: 'LOTE-2',
            usuario_id: null,
            tipo: 'entrada',
            fecha_hora_marca: '2026-07-05T08:00:00Z',
            es_menor_manual: true,
            datos_menor: { nombre_completo: 'Ab' }, // < 3 caracteres
          },
        ],
      };

      await expect(service.syncLote(payloadConMenorInvalido)).rejects.toThrow(BadRequestException);
    });

    it('debería procesar y contar las inserciones y duplicados de forma correcta', async () => {
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'T1', sede_id: 'S1' });
      mockPrismaService.client.usuario.findUnique.mockResolvedValue({ id: 'USR-OK' });
      
      // Simular que el registro ya existe en el bucle para verificar la lógica de duplicados
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue({ id: 'EXISTE' });

      const result = await service.syncLote(mockPayload);

      expect(result.success).toBe(true);
      expect(result.stats.omitidosPorDuplicado).toBe(1);
      expect(result.stats.insertados).toBe(0);
    });

    it('debería recuperarse y completar la sincronización ante un deadlock transaccional (1213 / P2034)', async () => {
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'T1', sede_id: 'S1' });
      mockPrismaService.client.usuario.findUnique.mockResolvedValue({ id: 'USR-OK' });
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue(null);
      mockPrismaService.client.asistencia.create.mockResolvedValue({ id: 'ASIS-NUEVA' });

      const deadlockError = Object.assign(new Error('Deadlock found when trying to get lock'), {
        errno: 1213,
        code: 'ER_LOCK_DEADLOCK',
      });

      const txMock = mockPrismaService.client.$transaction as jest.Mock;
      txMock
        .mockRejectedValueOnce(deadlockError)
        .mockImplementationOnce((callback) => callback(mockPrismaService.client));

      const result = await service.syncLote(mockPayload, { baseDelayMs: 1 });

      expect(txMock).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.stats.insertados).toBe(1);
      expect(result.stats.omitidosPorDuplicado).toBe(0);
      expect(result.processed_local_ids).toEqual(['LOTE-1']);
    });

    it('debería ejecutar syncAttendances como alias transaccional de syncLote', async () => {
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'T1', sede_id: 'S1' });
      mockPrismaService.client.usuario.findUnique.mockResolvedValue({ id: 'USR-OK' });
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue({ id: 'EXISTE' });

      const result = await service.syncAttendances(mockPayload);

      expect(result.success).toBe(true);
      expect(result.stats.omitidosPorDuplicado).toBe(1);
    });

    it('debería ejecutar registerMarksBatch como alias transaccional de syncLote', async () => {
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'T1', sede_id: 'S1' });
      mockPrismaService.client.usuario.findUnique.mockResolvedValue({ id: 'USR-OK' });
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue({ id: 'EXISTE' });

      const result = await service.registerMarksBatch(mockPayload);

      expect(result.success).toBe(true);
      expect(result.stats.omitidosPorDuplicado).toBe(1);
    });
  });

  // --- 6. MÉTODO: executeTransaction y Resiliencia ante Deadlocks (ARQ-06) ---
  describe('executeTransaction y Resiliencia ante Deadlocks (ARQ-06)', () => {
    it('debería reintentar exitosamente una transacción ante error P2034 de Prisma', async () => {
      const p2034Error = Object.assign(new Error('write conflict'), { code: 'P2034' });
      const txMock = mockPrismaService.client.$transaction as jest.Mock;
      txMock
        .mockRejectedValueOnce(p2034Error)
        .mockImplementationOnce((callback) => callback(mockPrismaService.client));

      const mockOperation = jest.fn().mockResolvedValue('ok-tras-p2034');

      const result = await service.executeTransaction(mockOperation, { baseDelayMs: 1 });

      expect(txMock).toHaveBeenCalledTimes(2);
      expect(result).toBe('ok-tras-p2034');
    });

    it('debería reintentar exitosamente ante error MySQL 1213 (ER_LOCK_DEADLOCK)', async () => {
      const deadlockError = Object.assign(new Error('Deadlock found'), {
        errno: 1213,
        code: 'ER_LOCK_DEADLOCK',
      });
      const txMock = mockPrismaService.client.$transaction as jest.Mock;
      txMock
        .mockRejectedValueOnce(deadlockError)
        .mockImplementationOnce((callback) => callback(mockPrismaService.client));

      const mockOperation = jest.fn().mockResolvedValue('ok-tras-deadlock');

      const result = await service.executeTransaction(mockOperation, { baseDelayMs: 1 });

      expect(txMock).toHaveBeenCalledTimes(2);
      expect(result).toBe('ok-tras-deadlock');
    });

    it('debería reintentar exitosamente ante error MySQL 1205 (ER_LOCK_WAIT_TIMEOUT)', async () => {
      const lockTimeoutError = Object.assign(new Error('Lock wait timeout exceeded'), {
        errno: 1205,
        code: 'ER_LOCK_WAIT_TIMEOUT',
      });
      const txMock = mockPrismaService.client.$transaction as jest.Mock;
      txMock
        .mockRejectedValueOnce(lockTimeoutError)
        .mockImplementationOnce((callback) => callback(mockPrismaService.client));

      const mockOperation = jest.fn().mockResolvedValue('ok-tras-timeout');

      const result = await service.executeTransaction(mockOperation, { baseDelayMs: 1 });

      expect(txMock).toHaveBeenCalledTimes(2);
      expect(result).toBe('ok-tras-timeout');
    });

    it('no debería reintentar ante errores no recuperables (ej. P2002)', async () => {
      const uniqueConstraintError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      const txMock = mockPrismaService.client.$transaction as jest.Mock;
      txMock.mockRejectedValue(uniqueConstraintError);

      const mockOperation = jest.fn();

      await expect(
        service.executeTransaction(mockOperation, { baseDelayMs: 1 }),
      ).rejects.toThrow('Unique constraint failed');

      expect(txMock).toHaveBeenCalledTimes(1);
    });

    it('debería agotar los reintentos y lanzar el error si el deadlock persiste', async () => {
      const persistentDeadlock = Object.assign(new Error('Deadlock persistente'), {
        code: '1213',
      });
      const txMock = mockPrismaService.client.$transaction as jest.Mock;
      txMock.mockRejectedValue(persistentDeadlock);

      const mockOperation = jest.fn();

      await expect(
        service.executeTransaction(mockOperation, { maxRetries: 3, baseDelayMs: 1 }),
      ).rejects.toThrow('Deadlock persistente');

      expect(txMock).toHaveBeenCalledTimes(3);
    });

    it('debería identificar correctamente errores recuperables con isRetryableTransactionError', () => {
      expect(service.isRetryableTransactionError({ code: 'P2034' })).toBe(true);
      expect(service.isRetryableTransactionError({ errno: 1213 })).toBe(true);
      expect(service.isRetryableTransactionError({ errno: 1205 })).toBe(true);
      expect(service.isRetryableTransactionError({ code: 'ER_LOCK_DEADLOCK' })).toBe(true);
      expect(service.isRetryableTransactionError({ message: 'Deadlock found when trying to get lock' })).toBe(true);
      expect(service.isRetryableTransactionError({ code: 'P2002' })).toBe(false);
      expect(service.isRetryableTransactionError(null)).toBe(false);
    });
  });
});
