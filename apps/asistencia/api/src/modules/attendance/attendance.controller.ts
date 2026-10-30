import { Controller, Post, Get, Put, Delete, Body, Param, Query, Res, HttpCode, HttpStatus, Inject, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AttendanceService } from './attendance.service';
import { SyncAttendanceDto } from './dto/sync-attendance.dto';
import { RegisterAttendanceDto } from './dto/register-attendance.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { Roles } from '../../common/auth/roles.decorator';
import { ManualLogInput, UpdateAttendanceLogInput } from './attendance-registration.service';
import { AttendanceClientRecord } from './attendance-report.service';

@Controller('attendance')
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendanceService: AttendanceService) {}

  /**
   * Registra una marcación individual desde un cliente autorizado.
   *
   * @see apps/asistencia/desktop/main.js#registerMark
   */
  @Post('register')
  @Roles('administrador', 'operador')
  async register(@Body() body: RegisterAttendanceDto) {
    return this.attendanceService.register(body);
  }

  /**
   * Recibe el lote producido por la cola offline del Desktop.
   *
   * @see apps/asistencia/desktop/src/main/sync/remote-client.js#sendSyncRequest
   */
  @HttpCode(HttpStatus.OK)
  @Post('sync')
  @Roles('administrador', 'operador')
  async sync(@Body() syncData: SyncAttendanceDto) {
    return this.attendanceService.syncLote(syncData);
  }

  /**
   * Devuelve marcaciones para la actualización de la caché local.
   *
   * @see apps/asistencia/desktop/src/main/sync/remote-client.js#pullAttendanceFromServer
   */
  @Get('synced-marks')
  @Roles('administrador', 'operador')
  async getSyncedMarks() {
    return this.attendanceService.pullSyncedMarks();
  }

  @Get('report')
  @Roles('administrador')
  async getReport(@Query() query: ReportQueryDto) {
    return this.attendanceService.getReports(query.startDate, query.endDate);
  }

  @Get('stats')
  @Roles('administrador')
  async getStats(@Query() query: ReportQueryDto) {
    return this.attendanceService.getAttendanceStats(query.startDate, query.endDate);
  }

  @Get('report/pdf')
  @Roles('administrador')
  async getReportPdf(
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const pdf = await this.attendanceService.generatePdfDocument(query);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-asistencia.pdf');
    pdf.pipe(res);
    pdf.end();
  }

  @Post('report/pdf')
  @Roles('administrador')
  async postReportPdf(
    @Query() query: ReportQueryDto,
    @Body() body: { records?: AttendanceClientRecord[] },
    @Res() res: Response,
  ) {
    const pdf = await this.attendanceService.generatePdfDocument(query, body?.records);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-asistencia.pdf');
    pdf.pipe(res);
    pdf.end();
  }

  @Get('report/excel')
  @Roles('administrador')
  async getReportExcel(
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const buffer = await this.attendanceService.generateExcelReport(query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-asistencia.xlsx');
    res.send(buffer);
  }

  @Post('report/excel')
  @Roles('administrador')
  async postReportExcel(
    @Query() query: ReportQueryDto,
    @Body() body: { records?: AttendanceClientRecord[] },
    @Res() res: Response,
  ) {
    const buffer = await this.attendanceService.generateExcelReport(query, body?.records);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-asistencia.xlsx');
    res.send(buffer);
  }

  @Put(':id')
  @Roles('administrador')
  async updateLog(
    @Param('id') id: string,
    @Body() body: UpdateAttendanceLogInput,
  ) {
    return this.attendanceService.updateLog(id, body);
  }

  @Delete(':id')
  @Roles('administrador')
  async deleteLog(
    @Param('id') id: string,
  ) {
    return this.attendanceService.deleteLog(id);
  }

  @Post('create-manual')
  @Roles('administrador')
  async createManual(
    @Body() body: ManualLogInput,
  ) {
    return this.attendanceService.createManualLog(body);
  }

  @Get('report/audit')
  @Roles('administrador')
  async getReportAudit(
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const buffer = await this.attendanceService.generateAuditExcelReport(query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-auditoria-asistencia.xlsx');
    res.send(buffer);
  }
}
