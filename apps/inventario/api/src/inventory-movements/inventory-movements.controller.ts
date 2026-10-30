import { Controller, Post, Get, Patch, Put, Param, Body, Query, Res, HttpCode, HttpStatus, Optional } from '@nestjs/common';
import { Response } from 'express';
import { InventoryMovementsService } from './inventory-movements.service';
import { StockAlertService } from './stock-alert.service';
import { InventoryReportService } from './inventory-report.service';
import { CreateMovementDto, SyncMovementsDto, ReportQueryDto, TransferMovementDto } from './dto/sync-movements.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('inventory-movements')
export class InventoryMovementsController {
  constructor(
    private readonly movementsService: InventoryMovementsService,
    @Optional() private readonly reportService?: InventoryReportService,
    @Optional() private readonly alertService?: StockAlertService,
  ) {}

  @Post()
  @Roles('administrador', 'operador')
  async register(@Body() body: CreateMovementDto) {
    return this.movementsService.register(body);
  }

  @Post('transfer')
  @Roles('administrador', 'operador')
  async transfer(@Body() body: TransferMovementDto) {
    return this.movementsService.transfer(body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('sync')
  @Roles('administrador', 'operador')
  async sync(@Body() syncData: SyncMovementsDto) {
    return this.movementsService.sync(syncData.batch || []);
  }

  @Get()
  @Roles('administrador', 'operador')
  async findAll() {
    const service = this.reportService ?? this.movementsService;
    return service.findAll();
  }

  @Get('kardex')
  @Roles('administrador', 'operador')
  async getKardex(
    @Query('itemId') itemId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const parsedId = itemId ? parseInt(itemId, 10) : undefined;
    const service = this.reportService ?? this.movementsService;
    return service.getKardex(parsedId, startDate, endDate);
  }

  @Get('report')
  @Roles('administrador')
  async getReport(@Query() query: ReportQueryDto) {
    const service = this.reportService ?? this.movementsService;
    return service.getReports(query.startDate, query.endDate);
  }

  @Get('report/pdf')
  @Roles('administrador')
  async getReportPdf(
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const service = this.reportService ?? this.movementsService;
    const pdf = await service.generatePdfStream(query.startDate, query.endDate, query.type);
    res.setHeader('Content-Type', pdf.contentType);
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=reporte-movimientos.pdf',
    );
    res.send(pdf.data);
  }

  @Get('report/excel')
  @Roles('administrador')
  async getReportExcel(
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const format = query.type === 'detallado' ? 'detallado' : 'resumido';
    const service = this.reportService ?? this.movementsService;
    const buffer = await service.generateExcelReport(query.startDate, query.endDate, format);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=reporte-movimientos.xlsx',
    );
    res.send(buffer);
  }

  @Get('alerts')
  @Roles('administrador', 'operador')
  async getAlerts() {
    if (this.alertService) {
      return this.alertService.getActiveAlerts();
    }
    return [];
  }

  @Get('alerts/low-stock')
  @Roles('administrador', 'operador')
  async getLowStockAlerts() {
    if (this.alertService) {
      return this.alertService.checkLowStockProducts();
    }
    return [];
  }

  @Patch(':id/date')
  @Roles('administrador', 'operador')
  async updateDatePatch(
    @Param('id') id: string,
    @Body() body: { registered_at: string },
  ) {
    return this.movementsService.updateMovementDate(parseInt(id, 10), body.registered_at);
  }

  @Put(':id/date')
  @Roles('administrador', 'operador')
  async updateDatePut(
    @Param('id') id: string,
    @Body() body: { registered_at: string },
  ) {
    return this.movementsService.updateMovementDate(parseInt(id, 10), body.registered_at);
  }
}
