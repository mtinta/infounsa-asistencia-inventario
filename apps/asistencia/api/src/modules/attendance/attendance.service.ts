import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import { TransactionRetryOptions } from '../../common/database/transaction-retry.helper';
import { SyncAttendanceDto } from './dto/sync-attendance.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { Response } from 'express';
import {
  AttendanceRegistrationService,
  RegisterAttendanceInput,
  ManualLogInput,
  UpdateAttendanceLogInput,
} from './attendance-registration.service';
import { AttendanceSyncService } from './attendance-sync.service';
import { AttendanceReportService } from './attendance-report.service';

/**
 * Fachada orquestadora para el módulo de Asistencia.
 * Delega las operaciones a los servicios especializados de dominio:
 * - AttendanceRegistrationService: Registro individual y administración de logs.
 * - AttendanceSyncService: Sincronización batch resiliente offline-to-online.
 * - AttendanceReportService: Consultas analíticas y generación de reportes PDF/Excel.
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  public readonly registrationService: AttendanceRegistrationService;
  public readonly syncService: AttendanceSyncService;
  public readonly reportService: AttendanceReportService;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AttendanceRegistrationService) registrationService?: AttendanceRegistrationService,
    @Optional() @Inject(AttendanceSyncService) syncService?: AttendanceSyncService,
    @Optional() @Inject(AttendanceReportService) reportService?: AttendanceReportService,
  ) {
    this.registrationService = registrationService ?? new AttendanceRegistrationService(this.prisma);
    this.syncService = syncService ?? new AttendanceSyncService(this.prisma);
    this.reportService = reportService ?? new AttendanceReportService(this.prisma);
  }

  public get maxTransactionRetries(): number {
    return this.syncService.maxTransactionRetries;
  }

  /**
   * Determina si un error transaccional corresponde a una colisión temporal y es recuperable.
   */
  public isRetryableTransactionError(error: unknown): boolean {
    return this.syncService.isRetryableTransactionError(error);
  }

  /**
   * Ejecuta un callback dentro de una transacción con reintentos y retroceso exponencial con jitter.
   */
  public async executeTransaction<T>(
    callback: (tx: unknown) => Promise<T>,
    options?: TransactionRetryOptions,
  ): Promise<T> {
    return this.syncService.executeTransaction(callback, options);
  }

  /**
   * Helper delegado para compatibilidad con consumidores existentes y tests unitarios.
   */
  private parseReportRange(startDate: string, endDate: string) {
    return this.reportService.parseReportRange(startDate, endDate);
  }

  private buildVisitorObservation(registro: SyncAttendanceDto['registros'][number]) {
    return this.syncService.buildVisitorObservation(registro);
  }

  /**
   * Registra una marcación individual.
   */
  async register(data: RegisterAttendanceInput) {
    return this.registrationService.register(data);
  }

  /**
   * Obtiene el reporte agrupado de asistencias por usuario.
   */
  async getReports(
    startDate: string,
    endDate: string,
    search?: string,
    filterType?: string,
    filterRole?: string,
    applyDayFilter?: string,
    startDayOfWeek?: string,
    endDayOfWeek?: string,
  ) {
    return this.reportService.getReports(
      startDate,
      endDate,
      search,
      filterType,
      filterRole,
      applyDayFilter,
      startDayOfWeek,
      endDayOfWeek,
    );
  }

  /**
   * Obtiene estadísticas agregadas de marcación.
   */
  async getAttendanceStats(startDate: string, endDate: string) {
    return this.reportService.getAttendanceStats(startDate, endDate);
  }

  /**
   * Genera el documento PDFKit con las tablas de marcación.
   */
  async generatePdfDocument(query: ReportQueryDto, clientRecords?: Record<string, unknown>[]) {
    return this.reportService.generatePdfDocument(query, clientRecords);
  }

  /**
   * Genera stream y buffer para el reporte en PDF.
   */
  async generatePdfStream(query: ReportQueryDto, clientRecords?: Record<string, unknown>[]) {
    return this.reportService.generatePdfStream(query, clientRecords);
  }

  /**
   * Exporta reporte PDF directamente en un Buffer binario.
   */
  async exportDailyReportPdf(query: ReportQueryDto, clientRecords?: Record<string, unknown>[]): Promise<Buffer> {
    return this.reportService.exportDailyReportPdf(query, clientRecords);
  }

  /**
   * Sincroniza un lote de marcaciones offline-to-online de forma transaccional y resiliente.
   */
  async syncLote(payload: SyncAttendanceDto, options?: TransactionRetryOptions) {
    return this.syncService.syncLote(payload, options);
  }

  /**
   * Alias transaccional para sincronización masiva de asistencias.
   */
  async syncAttendances(payload: SyncAttendanceDto, options?: TransactionRetryOptions) {
    return this.syncService.syncAttendances(payload, options);
  }

  /**
   * Alias transaccional para registro batch de marcas.
   */
  async registerMarksBatch(payload: SyncAttendanceDto, options?: TransactionRetryOptions) {
    return this.syncService.registerMarksBatch(payload, options);
  }

  /**
   * Obtiene marcas para actualización de caché local.
   */
  async pullSyncedMarks(limit = 1000) {
    return this.syncService.pullSyncedMarks(limit);
  }

  /**
   * Genera reporte Excel desacoplado de Response.
   */
  async generateExcelReport(
    query: ReportQueryDto,
    resOrRecords?: Response | Record<string, unknown>[],
    clientRecords?: Record<string, unknown>[],
  ): Promise<Buffer> {
    return this.reportService.generateExcelReport(query, resOrRecords, clientRecords);
  }

  /**
   * Genera matriz pivotada en Excel.
   */
  async generatePivotedExcelReport(
    asistencias: Record<string, unknown>[],
    startDateStr: string,
    endDateStr: string,
    res?: Response,
  ): Promise<Buffer> {
    return this.reportService.generatePivotedExcelReport(asistencias, startDateStr, endDateStr, res);
  }

  /**
   * Actualiza una marcación de asistencia existente.
   */
  async updateLog(id: string, body: UpdateAttendanceLogInput) {
    return this.registrationService.updateLog(id, body);
  }

  /**
   * Realiza un soft delete de una marcación.
   */
  async deleteLog(id: string) {
    return this.registrationService.deleteLog(id);
  }

  /**
   * Registra una marcación manual por parte de un administrador.
   */
  async createManualLog(body: ManualLogInput) {
    return this.registrationService.createManualLog(body);
  }

  /**
   * Genera el reporte de auditoría en Excel.
   */
  async generateAuditExcelReport(query: ReportQueryDto, res?: Response): Promise<Buffer> {
    return this.reportService.generateAuditExcelReport(query, res);
  }
}
