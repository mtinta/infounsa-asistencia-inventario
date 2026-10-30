import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceSyncService } from './attendance-sync.service';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { SyncAttendanceDto } from './dto/sync-attendance.dto';

describe('Pruebas Unitarias: AttendanceSyncService', () => {
  let service: AttendanceSyncService;

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
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      terminal: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      usuario: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrismaService.client)),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceSyncService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AttendanceSyncService>(AttendanceSyncService);
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('syncLote', () => {
    const mockPayload: SyncAttendanceDto = {
      terminal_id: 'T1',
      sede_id: '84c8a8ca-8ea4-41e9-add6-2b077bcd701a',
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

    it('debería rechazar menores si el nombre tiene menos de 3 caracteres', async () => {
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'T1', sede_id: mockPayload.sede_id, estado: true });
      mockPrismaService.client.sede.findUnique.mockResolvedValue({ id: mockPayload.sede_id });
      mockPrismaService.client.usuario.findUnique.mockResolvedValue({ id: 'USR-MENOR-GENERICO' });

      const invalidPayload: SyncAttendanceDto = {
        ...mockPayload,
        registros: [
          {
            id_operacion_local: 'LOTE-BAD',
            usuario_id: null,
            tipo: 'entrada',
            fecha_hora_marca: '2026-07-05T08:00:00Z',
            es_menor_manual: true,
            datos_menor: { nombre_completo: 'Jo' },
          },
        ],
      };

      await expect(service.syncLote(invalidPayload)).rejects.toThrow(BadRequestException);
    });

    it('debería procesar lotes insertando registros nuevos y omitiendo duplicados', async () => {
      mockPrismaService.client.sede.findUnique.mockResolvedValue({ id: mockPayload.sede_id });
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'T1', sede_id: mockPayload.sede_id, estado: true });
      mockPrismaService.client.usuario.findUnique.mockResolvedValue({ id: 'USR-OK' });
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue(null);
      mockPrismaService.client.asistencia.create.mockResolvedValue({ id: 'ASIS-1' });

      const result = await service.syncLote(mockPayload);

      expect(result.success).toBe(true);
      expect(result.stats.insertados).toBe(1);
      expect(result.stats.omitidosPorDuplicado).toBe(0);
      expect(result.processed_local_ids).toContain('LOTE-1');
    });

    it('debería recuperarse y reintentar transacciones ante contención de bloqueos', async () => {
      mockPrismaService.client.sede.findUnique.mockResolvedValue({ id: mockPayload.sede_id });
      mockPrismaService.client.terminal.findUnique.mockResolvedValue({ id: 'T1', sede_id: mockPayload.sede_id, estado: true });
      mockPrismaService.client.usuario.findUnique.mockResolvedValue({ id: 'USR-OK' });
      mockPrismaService.client.asistencia.findUnique.mockResolvedValue(null);
      mockPrismaService.client.asistencia.create.mockResolvedValue({ id: 'ASIS-RETRY' });

      const deadlockError = Object.assign(new Error('Deadlock'), { errno: 1213 });
      const txMock = mockPrismaService.client.$transaction as jest.Mock;
      txMock
        .mockRejectedValueOnce(deadlockError)
        .mockImplementationOnce((cb) => cb(mockPrismaService.client));

      const result = await service.syncLote(mockPayload, { baseDelayMs: 1 });

      expect(txMock).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });
  });

  describe('pullSyncedMarks', () => {
    it('debería retornar marcas ordenadas excluyendo borrados', async () => {
      mockPrismaService.client.asistencia.findMany.mockResolvedValue([
        {
          id_operacion_local: 'L-1',
          usuario_id: 'U1',
          tipo: 'entrada',
          fecha_hora_marca: new Date('2026-07-05T08:00:00Z'),
          terminal_id: 'TERM-1',
          sede_id: 'SEDE-1',
          observacion: 'ok',
          estado_auditoria: 'normal',
          usuario: { dni: '12345678', nombre_completo: 'Usuario Test' },
        },
      ]);

      const marks = await service.pullSyncedMarks(10);
      expect(marks).toHaveLength(1);
      expect(marks[0].local_id).toBe('L-1');
      expect(marks[0].sync_status).toBe('Sincronizado');
    });
  });
});
