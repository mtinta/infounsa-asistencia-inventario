import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceReportService } from './attendance-report.service';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('Pruebas Unitarias: AttendanceReportService', () => {
  let service: AttendanceReportService;

  const mockPrismaService = {
    client: {
      asistencia: {
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
      usuario: {
        findMany: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceReportService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AttendanceReportService>(AttendanceReportService);
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('parseReportRange', () => {
    it('debería lanzar excepción si faltan fechas o son inválidas', () => {
      expect(() => service.parseReportRange('', '')).toThrow(BadRequestException);
      expect(() => service.parseReportRange('invalida', '2026-07-05')).toThrow(BadRequestException);
    });

    it('debería lanzar excepción si fecha de inicio es posterior a la final', () => {
      expect(() => service.parseReportRange('2026-07-10', '2026-07-01')).toThrow(BadRequestException);
    });

    it('debería rechazar rangos mayores a 90 días', () => {
      expect(() => service.parseReportRange('2026-01-01', '2026-05-01')).toThrow(BadRequestException);
    });

    it('debería calcular correctamente fechas válidas', () => {
      const { start, end } = service.parseReportRange('2026-07-01', '2026-07-05');
      expect(start).toBeInstanceOf(Date);
      expect(end).toBeInstanceOf(Date);
      expect(end.getHours()).toBe(23);
    });
  });

  describe('getReports', () => {
    it('debería totalizar marcas de entradas y salidas por usuario', async () => {
      mockPrismaService.client.usuario.findMany.mockResolvedValue([
        {
          id: 'U1',
          nombre_completo: 'Perez Gomez, Juan',
          asistencias: [
            { tipo: 'entrada', fecha_hora_marca: new Date('2026-07-01T08:00:00Z') },
            { tipo: 'salida', fecha_hora_marca: new Date('2026-07-01T17:00:00Z') },
          ],
        },
      ]);

      const result = await service.getReports('2026-07-01', '2026-07-05');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        user_id: 'U1',
        full_name: 'Perez Gomez, Juan',
        total_entradas: 1,
        total_salidas: 1,
      });
    });
  });

  describe('getAttendanceStats', () => {
    it('debería retornar métricas agregadas por tipo y sede', async () => {
      mockPrismaService.client.asistencia.groupBy
        .mockResolvedValueOnce([{ tipo: 'entrada', _count: { _all: 5 } }])
        .mockResolvedValueOnce([{ sede_id: 'SEDE-1', _count: { _all: 5 } }]);
      mockPrismaService.client.asistencia.findMany.mockResolvedValue([{ usuario_id: 'U1' }]);

      const stats = await service.getAttendanceStats('2026-07-01', '2026-07-05');

      expect(stats.total_marcas).toBe(5);
      expect(stats.usuarios_con_marcas).toBe(1);
      expect(stats.por_tipo).toHaveLength(1);
      expect(stats.por_sede).toHaveLength(1);
    });
  });

  describe('Generación de Buffers de reporte (PDF y Excel)', () => {
    const mockAsistencias = [
      {
        id: 'A1',
        fecha_hora_marca: new Date('2026-07-05T08:00:00Z'),
        tipo: 'entrada',
        observacion: 'ok',
        estado_auditoria: 'nuevo',
        usuario: {
          id: 'U1',
          dni: '12345678',
          nombre_completo: 'Test User',
          apellido_paterno: 'Test',
          apellido_materno: 'User',
          nombres: 'Tester',
          condicion: 'Personal',
          cargo: 'Docente',
        },
      },
    ];

    it('debería generar buffer PDF válido con exportDailyReportPdf', async () => {
      mockPrismaService.client.asistencia.findMany.mockResolvedValue(mockAsistencias);

      const buffer = await service.exportDailyReportPdf({ startDate: '2026-07-01', endDate: '2026-07-05' });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('debería generar buffer Excel válido con generateExcelReport', async () => {
      mockPrismaService.client.asistencia.findMany.mockResolvedValue(mockAsistencias);

      const buffer = await service.generateExcelReport({ startDate: '2026-07-01', endDate: '2026-07-05' });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('debería generar buffer Excel de auditoría con generateAuditExcelReport', async () => {
      mockPrismaService.client.asistencia.findMany.mockResolvedValue(mockAsistencias);

      const buffer = await service.generateAuditExcelReport({ startDate: '2026-07-01', endDate: '2026-07-05' });

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
