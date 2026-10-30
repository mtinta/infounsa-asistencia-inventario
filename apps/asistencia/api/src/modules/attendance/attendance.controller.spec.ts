import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { Response } from 'express';

describe('Pruebas Unitarias: AttendanceController', () => {
  let controller: AttendanceController;
  let service: AttendanceService;

  // Mock del Servicio (Simulador)
  const mockAttendanceService = {
    register: jest.fn(),
    syncLote: jest.fn(),
    pullSyncedMarks: jest.fn(),
    getReports: jest.fn(),
    getAttendanceStats: jest.fn(),
    generatePdfStream: jest.fn(),
    generatePdfDocument: jest.fn(),
    generateExcelReport: jest.fn(),
    generateAuditExcelReport: jest.fn(),
    updateLog: jest.fn(),
    deleteLog: jest.fn(),
    createManualLog: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        {
          provide: AttendanceService,
          useValue: mockAttendanceService,
        },
      ],
    }).compile();

    controller = module.get<AttendanceController>(AttendanceController);
    service = module.get<AttendanceService>(AttendanceService);

    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  // --- POST /attendance/register ---
  describe('register', () => {
    it('debería delegar el DTO de registro al servicio', async () => {
      const dto = {
        usuario_id: '123',
        terminal_id: 'T01',
        sede_id: 'S01',
        fecha_hora_marca: '2023-10-25T08:00:00Z',
        id_operacion_local: 'OP-001',
      };
      const expectedResult = { success: true };
      mockAttendanceService.register.mockResolvedValue(expectedResult);

      const result = await controller.register(dto);

      expect(service.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  // --- POST /attendance/sync ---
  describe('sync', () => {
    it('debería delegar el DTO de sincronización por lote al servicio', async () => {
      const syncDto = { records: [] };
      const expectedResult = { synced: 5 };
      mockAttendanceService.syncLote.mockResolvedValue(expectedResult);

      const result = await controller.sync(syncDto as any);

      expect(service.syncLote).toHaveBeenCalledWith(syncDto);
      expect(result).toEqual(expectedResult);
    });
  });

  // --- GET /attendance/synced-marks ---
  describe('getSyncedMarks', () => {
    it('debería retornar las marcaciones consolidadas', async () => {
      const marks = [{ local_id: 'loc-1', dni: '12345678' }];
      mockAttendanceService.pullSyncedMarks.mockResolvedValue(marks);

      const result = await controller.getSyncedMarks();

      expect(result).toEqual(marks);
      expect(service.pullSyncedMarks).toHaveBeenCalledTimes(1);
    });
  });

  // --- GET /attendance/report ---
  describe('getReport', () => {
    it('debería recibir el objeto query y extraer los parámetros para el servicio', async () => {
      const queryDto = { startDate: '2023-10-01', endDate: '2023-10-31' };
      const expectedReport = [{ id: 1, usuario_id: '123' }];
      mockAttendanceService.getReports.mockResolvedValue(expectedReport);

      const result = await controller.getReport(queryDto);

      expect(service.getReports).toHaveBeenCalledWith(queryDto.startDate, queryDto.endDate);
      expect(result).toEqual(expectedReport);
    });
  });

  // --- GET /attendance/stats ---
  describe('getStats', () => {
    it('debería llamar al servicio para obtener estadísticas de asistencia', async () => {
      const queryDto = { startDate: '2023-10-01', endDate: '2023-10-31' };
      const expectedStats = { porcentajeAsistencia: 92 };
      mockAttendanceService.getAttendanceStats.mockResolvedValue(expectedStats);

      const result = await controller.getStats(queryDto);

      expect(service.getAttendanceStats).toHaveBeenCalledWith(queryDto.startDate, queryDto.endDate);
      expect(result).toEqual(expectedStats);
    });
  });

  // --- GET /attendance/report/pdf ---
  describe('getReportPdf', () => {
    it('debería construir el archivo PDF configurando la respuesta HTTP', async () => {
      const queryDto = { startDate: '2023-10-01', endDate: '2023-10-31' } as any;
      const mockPdfDoc = {
        pipe: jest.fn().mockReturnThis(),
        end: jest.fn(),
      };
      mockAttendanceService.generatePdfDocument.mockResolvedValue(mockPdfDoc);

      const mockRes = {
        setHeader: jest.fn(),
      } as unknown as Response;

      await controller.getReportPdf(queryDto, mockRes);

      expect(service.generatePdfDocument).toHaveBeenCalledWith(queryDto);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename=reporte-asistencia.pdf');
      expect(mockPdfDoc.pipe).toHaveBeenCalledWith(mockRes);
      expect(mockPdfDoc.end).toHaveBeenCalled();
    });
  });

  // --- POST /attendance/report/pdf ---
  describe('postReportPdf', () => {
    it('debería construir el archivo PDF con los registros del cliente enviados en el body', async () => {
      const queryDto = { startDate: '2026-10-01', endDate: '2026-10-31' } as any;
      const body = { records: [{ dni: '12345678', name: 'Test' }] };
      const mockPdfDoc = {
        pipe: jest.fn().mockReturnThis(),
        end: jest.fn(),
      };
      mockAttendanceService.generatePdfDocument.mockResolvedValue(mockPdfDoc);

      const mockRes = {
        setHeader: jest.fn(),
      } as unknown as Response;

      await controller.postReportPdf(queryDto, body, mockRes);

      expect(service.generatePdfDocument).toHaveBeenCalledWith(queryDto, body.records);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename=reporte-asistencia.pdf');
      expect(mockPdfDoc.pipe).toHaveBeenCalledWith(mockRes);
      expect(mockPdfDoc.end).toHaveBeenCalled();
    });
  });

  // --- GET /attendance/report/excel ---
  describe('getReportExcel', () => {
    it('debería configurar headers y delegar la generación del Excel al servicio', async () => {
      const queryDto = { startDate: '2026-10-01', endDate: '2026-10-31' } as any;
      const fakeBuffer = Buffer.from('excel-content');
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;
      mockAttendanceService.generateExcelReport.mockResolvedValue(fakeBuffer);

      await controller.getReportExcel(queryDto, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=reporte-asistencia.xlsx',
      );
      expect(service.generateExcelReport).toHaveBeenCalledWith(queryDto);
      expect(mockRes.send).toHaveBeenCalledWith(fakeBuffer);
    });
  });

  // --- POST /attendance/report/excel ---
  describe('postReportExcel', () => {
    it('debería delegar la generación del Excel con registros locales del cliente', async () => {
      const queryDto = { startDate: '2026-10-01', endDate: '2026-10-31' } as any;
      const body = { records: [{ dni: '12345678', name: 'Local Test' }] };
      const fakeBuffer = Buffer.from('excel-content');
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;
      mockAttendanceService.generateExcelReport.mockResolvedValue(fakeBuffer);

      await controller.postReportExcel(queryDto, body, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(service.generateExcelReport).toHaveBeenCalledWith(queryDto, body.records);
      expect(mockRes.send).toHaveBeenCalledWith(fakeBuffer);
    });
  });

  // --- GET /attendance/report/audit ---
  describe('getReportAudit', () => {
    it('debería configurar headers y generar el reporte de auditoría Excel', async () => {
      const queryDto = { startDate: '2026-10-01', endDate: '2026-10-31' } as any;
      const fakeBuffer = Buffer.from('audit-content');
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;
      mockAttendanceService.generateAuditExcelReport.mockResolvedValue(fakeBuffer);

      await controller.getReportAudit(queryDto, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=reporte-auditoria-asistencia.xlsx',
      );
      expect(service.generateAuditExcelReport).toHaveBeenCalledWith(queryDto);
      expect(mockRes.send).toHaveBeenCalledWith(fakeBuffer);
    });
  });

  // --- PUT /attendance/:id ---
  describe('updateLog', () => {
    it('debería actualizar un registro de asistencia', async () => {
      const updateDto = { observacion: 'Corregido por admin', tipo_marca: 'entrada' };
      const expected = { id: 'log-1', ...updateDto };
      mockAttendanceService.updateLog.mockResolvedValue(expected);

      const result = await controller.updateLog('log-1', updateDto);

      expect(service.updateLog).toHaveBeenCalledWith('log-1', updateDto);
      expect(result).toEqual(expected);
    });
  });

  // --- DELETE /attendance/:id ---
  describe('deleteLog', () => {
    it('debería marcar el registro como borrado en auditoría', async () => {
      const expected = { id: 'log-1', estado_auditoria: 'borrado' };
      mockAttendanceService.deleteLog.mockResolvedValue(expected);

      const result = await controller.deleteLog('log-1');

      expect(service.deleteLog).toHaveBeenCalledWith('log-1');
      expect(result).toEqual(expected);
    });
  });

  // --- POST /attendance/create-manual ---
  describe('createManual', () => {
    it('debería crear un registro manual por administrador', async () => {
      const manualDto = { dni: '12345678', nombre: 'Admin User', tipo: 'entrada' };
      const expected = { id: 'new-log', ...manualDto };
      mockAttendanceService.createManualLog.mockResolvedValue(expected);

      const result = await controller.createManual(manualDto);

      expect(service.createManualLog).toHaveBeenCalledWith(manualDto);
      expect(result).toEqual(expected);
    });
  });
});
