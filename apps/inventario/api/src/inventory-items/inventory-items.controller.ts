import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, Res, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { InventoryItemsService } from './inventory-items.service';
import { CreateInventoryItemDto, UpdateInventoryItemDto, BulkImportPayloadDto } from './dto/inventory-item.dto';

@Controller('inventory-items')
export class InventoryItemsController {
  constructor(private readonly itemsService: InventoryItemsService) { }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 50;
    const catId = categoryId ? parseInt(categoryId, 10) : undefined;
    return this.itemsService.findAll(p, l, search, catId);
  }

  @Get('report/cargo-pdf')
  async getCargoPdf(@Res() res: Response) {
    const pdf = await this.itemsService.generateCargoPdfStream();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=cargo-estado-inventario.pdf');
    res.send(pdf.data);
  }

  @Get('report/cargo-excel')
  async getCargoExcel(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=cargo-estado-inventario.xlsx');
    await this.itemsService.generateCargoExcelReport(res);
  }

  @Get('report/almacen-pdf')
  async getAlmacenPdf(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ) {
    const pdf = await this.itemsService.generateAlmacenPdfStream(startDate, endDate);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-almacen-${startDate}-al-${endDate}.pdf`);
    res.send(pdf.data);
  }

  @Get('report/almacen-excel')
  async getAlmacenExcel(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-almacen-${startDate}-al-${endDate}.xlsx`);
    await this.itemsService.generateAlmacenExcelReport(startDate, endDate, res);
  }

  @Get('import/template')
  async downloadTemplate(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Plantilla_Inventario_InfoUNSA.xlsx');
    await this.itemsService.generateImportTemplate(res);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.itemsService.findOne(id);
  }

  @Get('barcode/:barcode')
  async findByBarcode(@Param('barcode') barcode: string) {
    return this.itemsService.findByBarcode(barcode);
  }

  @Post()
  async create(@Body() body: CreateInventoryItemDto) {
    return this.itemsService.create(body);
  }

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewImport(@UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file || !file.buffer) {
      throw new BadRequestException('El archivo Excel es requerido.');
    }
    return this.itemsService.previewImportExcel(file.buffer);
  }

  @Post('import/confirm')
  async importConfirm(@Body() body: BulkImportPayloadDto) {
    return this.itemsService.importBulk(body);
  }

  @Post('import')
  async importBulk(@Body() body: BulkImportPayloadDto) {
    return this.itemsService.importBulk(body);
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateInventoryItemDto) {
    return this.itemsService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.itemsService.remove(id);
  }
}
