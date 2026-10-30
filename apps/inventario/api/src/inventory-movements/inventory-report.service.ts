import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import { generateInventoryExcelReport } from './inventory-movements-report-excel.helper';
import { Response } from 'express';

@Injectable()
export class InventoryReportService {
  constructor(private readonly prisma: PrismaService) {}

  parseReportRange(startDate: string, endDate: string) {
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate y endDate son requeridos');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('startDate y endDate deben ser fechas validas');
    }

    if (start > end) {
      throw new BadRequestException('startDate no puede ser posterior a endDate');
    }

    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 90) {
      throw new BadRequestException('El rango de fecha no puede exceder los 90 dias');
    }

    return { start, end };
  }

  async findAll(limit = 100) {
    const rows = await this.prisma.client.inventoryMovement.findMany({
      include: {
        item: true,
        user: true,
        area: true,
      },
      orderBy: { registered_at: 'desc' },
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      item_id: row.item_id,
      type: row.type,
      quantity: row.quantity,
      user_id: row.user_id,
      area_id: row.area_id,
      destinatario_name: row.area ? `${row.area.name} - ${row.area.responsable}` : row.destinatario_name,
      registered_at: row.registered_at,
      id_operacion_local: row.id_operacion_local,
      observations: row.observations,
      item_name: row.item?.name ?? null,
      item_barcode: row.item?.barcode ?? null,
      operator_name: row.user?.username ?? null,
    }));
  }

  async getReports(startDate: string, endDate: string) {
    const { start, end } = this.parseReportRange(startDate, endDate);

    const rows = await this.prisma.client.inventoryMovement.groupBy({
      by: ['type'],
      where: {
        registered_at: {
          gte: start,
          lte: end,
        },
      },
      _count: { _all: true },
      _sum: { quantity: true },
    });

    return rows.map((row) => ({
      type: row.type,
      total_movimientos: row._count._all,
      cantidad_total: row._sum.quantity ?? 0,
    }));
  }

  async getKardex(itemId?: number, startDate?: string, endDate?: string) {
    const where: {
      item_id?: number;
      registered_at?: { gte: Date; lte: Date };
    } = {};
    if (itemId) {
      where.item_id = itemId;
    }
    if (startDate && endDate) {
      const { start, end } = this.parseReportRange(startDate, endDate);
      where.registered_at = { gte: start, lte: end };
    }

    const movements = await this.prisma.client.inventoryMovement.findMany({
      where,
      include: {
        item: true,
        user: true,
        area: true,
      },
      orderBy: { registered_at: 'asc' },
    });

    let runningBalance = 0;
    return movements.map((m) => {
      if (m.type === 'entrada') {
        runningBalance += m.quantity;
      } else if (m.type === 'salida') {
        runningBalance -= m.quantity;
      }

      return {
        id: m.id,
        registered_at: m.registered_at,
        item_id: m.item_id,
        item_name: m.item?.name ?? `Item ${m.item_id}`,
        barcode: m.item?.barcode ?? null,
        type: m.type,
        quantity: m.quantity,
        running_balance: runningBalance,
        operator: m.user?.username ?? null,
        destinatario: m.area ? `${m.area.name} - ${m.area.responsable}` : (m.destinatario_name ?? null),
        observations: m.observations ?? null,
        id_operacion_local: m.id_operacion_local ?? null,
      };
    });
  }

  async generateExcelReport(
    startDate: string,
    endDate: string,
    format: 'resumido' | 'detallado',
    res?: Response,
  ): Promise<Buffer> {
    const { start, end } = this.parseReportRange(startDate, endDate);

    const movements = await this.prisma.client.inventoryMovement.findMany({
      where: {
        registered_at: {
          gte: start,
          lte: end,
        },
      },
      include: {
        item: true,
        user: true,
        area: true,
      },
      orderBy: { registered_at: 'asc' },
    });

    return generateInventoryExcelReport(movements, startDate, endDate, format, res);
  }

  async exportMovementsExcel(
    startDate: string,
    endDate: string,
    format: 'resumido' | 'detallado' = 'resumido',
  ): Promise<Buffer> {
    return this.generateExcelReport(startDate, endDate, format);
  }

  async exportMovementsPdf(
    startDate: string,
    endDate: string,
    type?: string,
  ): Promise<{ contentType: string; data: Buffer }> {
    return this.generatePdfStream(startDate, endDate, type);
  }

  async generatePdfStream(startDate: string, endDate: string, type?: string) {
    const { start, end } = this.parseReportRange(startDate, endDate);
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    const candidates = [
      path.join(process.cwd(), 'src', 'assets', 'logo.png'),
      path.join(process.cwd(), 'apps', 'inventario', 'api', 'src', 'assets', 'logo.png'),
      path.join(process.cwd(), 'apps', 'asistencia', 'api', 'src', 'assets', 'logo.png'),
      path.join(__dirname, '..', '..', 'asistencia', 'api', 'src', 'assets', 'logo.png'),
    ];
    let logoPath = '';
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        logoPath = c;
        break;
      }
    }

    if (type === 'detallado') {
      const movements = await this.prisma.client.inventoryMovement.findMany({
        where: {
          registered_at: {
            gte: start,
            lte: end,
          },
        },
        include: {
          item: true,
          user: true,
          area: true,
        },
        orderBy: { registered_at: 'asc' },
      });

      if (logoPath) {
        doc.image(logoPath, 36, 15, { width: 90 });
      }
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(15).text('REPORTE DETALLADO DE MOVIMIENTOS DE INVENTARIO', 0, 18, { align: 'center' });
      doc.fontSize(8.5).font('Helvetica').fillColor('#64748B').text(`Rango: ${startDate} al ${endDate} | Generado: ${new Date().toLocaleString('es-PE')}`, 36, 42, { align: 'right', width: 766 });
      doc.moveTo(36, 58).lineTo(802, 58).strokeColor('#CBD5E1').stroke();

      const getWeekInfo = (d: Date) => {
        const date = new Date(d);
        const day = date.getDay();
        const diffToMonday = (day === 0 ? -6 : 1) - day;
        const monday = new Date(date);
        monday.setDate(date.getDate() + diffToMonday);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const monStr = monday.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' });
        const sunStr = sunday.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' });

        const key = monday.toISOString().split('T')[0];
        const label = `Semana: Del ${monStr} al ${sunStr}`;
        return { key, label };
      };

      const groupedByWeek: Record<string, { label: string; records: typeof movements }> = {};
      for (const m of movements) {
        const { key, label } = getWeekInfo(m.registered_at);
        if (!groupedByWeek[key]) {
          groupedByWeek[key] = { label, records: [] };
        }
        groupedByWeek[key].records.push(m);
      }

      let y = 70;
      let globalIndex = 1;

      const drawTableHeader = (currentY: number) => {
        doc.rect(36, currentY - 4, 766, 20).fill('#1E293B');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
        doc.text('N°', 40, currentY, { width: 28 });
        doc.text('Fecha/Hora', 70, currentY, { width: 105 });
        doc.text('Tipo', 178, currentY, { width: 60 });
        doc.text('Bien / Insumo', 242, currentY, { width: 220 });
        doc.text('Cant.', 465, currentY, { width: 45, align: 'center' });
        doc.text('Operador / Destino', 515, currentY, { width: 140 });
        doc.text('Observaciones', 660, currentY, { width: 138 });
      };

      for (const weekData of Object.values(groupedByWeek)) {
        if (y > 480) {
          doc.addPage();
          y = 40;
        }

        doc.fillColor('#14387F').font('Helvetica-Bold').fontSize(10.5).text(`📦 ${weekData.label} (${weekData.records.length} movimientos)`, 36, y);
        y += 16;

        drawTableHeader(y);
        y += 20;

        let rowIndex = 0;
        for (const m of weekData.records) {
          if (y > 525) {
            doc.addPage();
            y = 40;
            drawTableHeader(y);
            y += 20;
          }

          const isEven = rowIndex % 2 === 0;
          if (isEven) {
            doc.rect(36, y - 3, 766, 18).fill('#F8FAFC');
          }

          doc.fillColor('#0F172A').font('Helvetica').fontSize(8);

          const fechaHora = m.registered_at.toLocaleString('es-PE', {
            timeZone: 'America/Lima',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });

          const dest = m.area
            ? `${m.area.name} - ${m.area.responsable}`
            : (m.destinatario_name ?? m.user?.username ?? '-');

          const itemName = m.item?.name ?? `Item ${m.item_id}`;
          const cleanObs = (m.observations || '-').replace(/[\r\n]+/g, ' ').trim();

          doc.text(String(globalIndex), 40, y, { width: 28 });
          doc.text(fechaHora, 70, y, { width: 105 });
          doc.text(m.type.toUpperCase(), 178, y, { width: 60 });
          doc.text(itemName, 242, y, { width: 220, ellipsis: true });
          doc.text(String(m.quantity), 465, y, { width: 45, align: 'center' });
          doc.text(dest, 515, y, { width: 140, ellipsis: true });
          doc.text(cleanObs, 660, y, { width: 138, ellipsis: true });

          y += 18;
          rowIndex++;
          globalIndex++;
        }

        y += 12;
      }
    } else {
      const summary = await this.getReports(startDate, endDate);

      if (logoPath) {
        doc.image(logoPath, 36, 15, { width: 90 });
      }
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(15).text('REPORTE RESUMIDO DE MOVIMIENTOS DE INVENTARIO', 0, 18, { align: 'center' });
      doc.fontSize(8.5).font('Helvetica').fillColor('#64748B').text(`Rango: ${startDate} al ${endDate} | Generado: ${new Date().toLocaleString('es-PE')}`, 36, 42, { align: 'right', width: 766 });
      doc.moveTo(36, 58).lineTo(802, 58).strokeColor('#CBD5E1').stroke();

      let y = 75;

      doc.rect(36, y - 4, 766, 20).fill('#1E293B');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
      doc.text('Tipo de Movimiento', 50, y, { width: 200 });
      doc.text('Total Transacciones', 280, y, { width: 200, align: 'center' });
      doc.text('Cantidad Total de Artículos', 520, y, { width: 240, align: 'center' });

      y += 22;

      if (!summary.length) {
        doc.fillColor('#64748B').font('Helvetica').fontSize(9).text('Sin movimientos registrados en el rango seleccionado.', 50, y);
      } else {
        let index = 0;
        for (const row of summary) {
          const isEven = index % 2 === 0;
          if (isEven) {
            doc.rect(36, y - 3, 766, 18).fill('#F8FAFC');
          }
          doc.fillColor('#0F172A').font('Helvetica').fontSize(8.5);

          doc.text(row.type.toUpperCase(), 50, y, { width: 200 });
          doc.text(String(row.total_movimientos), 280, y, { width: 200, align: 'center' });
          doc.text(String(row.cantidad_total), 520, y, { width: 240, align: 'center' });
          y += 20;
          index++;
        }
      }
    }

    doc.end();

    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    return {
      contentType: 'application/pdf',
      data: buffer,
    };
  }
}
