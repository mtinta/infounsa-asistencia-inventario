import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { CreateInventoryItemDto, UpdateInventoryItemDto, BulkImportPayloadDto } from './dto/inventory-item.dto';

@Injectable()
export class InventoryItemsService {
  constructor(private readonly prisma: PrismaService) {}

  private withCategoryName<T extends { category?: { name?: string | null } | null }>(
    item: T,
  ): T & { category_name: string | null };
  private withCategoryName(item: null | undefined): null | undefined;
  private withCategoryName<T extends { category?: { name?: string | null } | null } | null | undefined>(item: T) {
    if (!item) return item;
    const category = item.category;
    return { ...item, category_name: category?.name ?? null };
  }

  private rethrowKnownWriteError(error: unknown, barcode?: string): never {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002') {
      throw new ConflictException(
        `Ya existe un bien registrado con el codigo de barras ${barcode ?? 'enviado'}.`,
      );
    }

    throw error;
  }

  async findAll(page = 1, limit = 50, search?: string, categoryId?: number) {
    const isUnlimited = limit <= 0 || limit >= 10000;
    const offset = (page - 1) * limit;

    const where: Prisma.InventoryItemWhereInput = {};
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q } },
        { barcode: { contains: q } },
        { description: { contains: q } },
      ];
    }
    if (categoryId && Number.isInteger(categoryId) && categoryId > 0) {
      where.category_id = categoryId;
    }

    const [items, total] = await Promise.all([
      this.prisma.client.inventoryItem.findMany({
        where,
        include: { category: true },
        orderBy: { id: 'desc' },
        ...(isUnlimited ? {} : { take: limit, skip: offset }),
      }),
      this.prisma.client.inventoryItem.count({ where }),
    ]);

    return {
      data: items.map((item) => this.withCategoryName(item)),
      total,
      page,
      limit: isUnlimited ? total : limit,
      totalPages: isUnlimited ? 1 : Math.ceil(total / limit),
    };
  }

  async findOne(id: number) {
    const item = await this.prisma.client.inventoryItem.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!item) {
      throw new NotFoundException(`Bien con ID ${id} no encontrado`);
    }
    return this.withCategoryName(item);
  }

  async findByBarcode(barcode: string) {
    const item = await this.prisma.client.inventoryItem.findUnique({
      where: { barcode },
      include: { category: true },
    });
    if (!item) {
      throw new NotFoundException(`Bien con codigo de barras ${barcode} no encontrado`);
    }
    return this.withCategoryName(item);
  }

  async create(data: CreateInventoryItemDto) {
    const { name, description, quantity, min_stock, unit, category_id, sede_id, observation, user_id } = data;
    let barcode = data.barcode?.trim();

    if (quantity !== undefined && quantity < 0) {
      throw new BadRequestException('La cantidad no puede ser negativa');
    }

    if (!barcode) {
      let candidateNum = (await this.prisma.client.inventoryItem.count()) + 1;
      while (true) {
        const candidateStr = String(candidateNum).padStart(7, '0');
        const existing = await this.prisma.client.inventoryItem.findUnique({
          where: { barcode: candidateStr },
        });
        if (!existing) {
          barcode = candidateStr;
          break;
        }
        candidateNum++;
      }
    }

    try {
      const newItem = await this.prisma.client.inventoryItem.create({
        data: {
          barcode,
          name,
          description,
          quantity: quantity ?? 0,
          min_stock: min_stock ?? 0,
          unit: unit ?? 'unidad',
          category_id,
          sede_id: sede_id ?? 1,
        },
      });

      if (observation) {
        await this.prisma.client.inventoryMovement.create({
          data: {
            item_id: newItem.id,
            type: 'entrada',
            quantity: quantity ?? 0,
            user_id: user_id ?? null,
            registered_at: new Date(),
            observations: `[Creación] ${observation}`,
            sync_status: 'sincronizado',
          },
        });
      }

      return newItem;
    } catch (error) {
      this.rethrowKnownWriteError(error, barcode);
    }
  }

  async update(id: number, data: UpdateInventoryItemDto) {
    const current = await this.findOne(id);
    const { barcode, name, description, quantity, min_stock, unit, category_id, sede_id, status } = data;
    const finalBarcode = barcode?.trim();

    if (quantity !== undefined && quantity < 0) {
      throw new BadRequestException('La cantidad no puede ser negativa');
    }

    try {
      const updated = await this.prisma.client.inventoryItem.update({
        where: { id },
        data: {
          barcode: finalBarcode || current.barcode,
          name: name ?? current.name,
          description: description !== undefined ? description : current.description,
          quantity: quantity !== undefined ? quantity : current.quantity,
          min_stock: min_stock !== undefined ? min_stock : current.min_stock,
          unit: unit ?? current.unit,
          category_id: category_id !== undefined ? category_id : current.category_id,
          sede_id: sede_id !== undefined ? sede_id : current.sede_id,
          status: (status as string | undefined) ?? current.status,
        },
      });

      return updated;
    } catch (error) {
      this.rethrowKnownWriteError(error, finalBarcode);
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.client.inventoryItem.delete({
      where: { id },
    });
    return { deleted: true, id };
  }

  async importBulk(data: BulkImportPayloadDto) {
    const { items = [], movements = [] } = data;

    // 1. Preload existing items, categories, and users in single queries (O(1) lookups)
    const [existingItems, categoriesList, usersList] = await Promise.all([
      this.prisma.client.inventoryItem.findMany(),
      this.prisma.client.category.findMany(),
      this.prisma.client.user.findMany(),
    ]);

    type ExistingItem = typeof existingItems[number];
    const importedItems: ExistingItem[] = [];

    const nameToItemMap = new Map<string, ExistingItem>();
    const barcodeToItemMap = new Map<string, ExistingItem>();
    for (const item of existingItems) {
      if (item.name) nameToItemMap.set(item.name.toLowerCase().trim(), item);
      if (item.barcode) barcodeToItemMap.set(item.barcode.toLowerCase().trim(), item);
    }

    const categoryMap = new Map<string, number>();
    for (const cat of categoriesList) {
      if (cat.name) categoryMap.set(cat.name.toLowerCase().trim(), cat.id);
    }

    const userMap = new Map<string, number>();
    for (const user of usersList) {
      if (user.username) userMap.set(user.username.toLowerCase().trim(), user.id);
    }
    const defaultUser = usersList.find(u => u.role === 'administrador') || usersList[0];

    // In-memory barcode sequence generator
    let candidateCounter = existingItems.length + 1;
    const generateUniqueBarcode = () => {
      while (true) {
        const candidateStr = String(candidateCounter++).padStart(7, '0');
        if (!barcodeToItemMap.has(candidateStr.toLowerCase())) {
          return candidateStr;
        }
      }
    };

    // 2. Process items in concurrent chunks of 25
    const itemChunkSize = 25;
    for (let i = 0; i < items.length; i += itemChunkSize) {
      const chunk = items.slice(i, i + itemChunkSize);
      const chunkResults = await Promise.all(
        chunk.map(async (itemData) => {
          const cleanName = itemData.name?.trim() || '';
          if (!cleanName) return null;
          const unit = itemData.unit?.trim() || 'unidad';
          const quantity = Number(itemData.quantity) || 0;
          const min_stock = Number(itemData.min_stock) || 5;
          const category_name = itemData.category_name?.trim() || 'Material de oficina';
          const overwrite = itemData.overwrite === true;

          // Get or create category
          let category_id = categoryMap.get(category_name.toLowerCase());
          if (!category_id) {
            const newCat = await this.prisma.client.category.create({
              data: { name: category_name, description: `Categoría importada de Excel: ${category_name}` },
            });
            category_id = newCat.id;
            categoryMap.set(category_name.toLowerCase(), category_id);
          }

          let existingItem = nameToItemMap.get(cleanName.toLowerCase());
          let itemRecord: ExistingItem;

          if (existingItem) {
            if (overwrite) {
              itemRecord = await this.prisma.client.inventoryItem.update({
                where: { id: existingItem.id },
                data: {
                  quantity,
                  unit,
                  min_stock,
                  category_id,
                },
              });
              nameToItemMap.set(cleanName.toLowerCase(), itemRecord);
              barcodeToItemMap.set(itemRecord.barcode.toLowerCase(), itemRecord);
            } else {
              itemRecord = existingItem;
            }
          } else {
            let barcode = itemData.barcode?.trim();
            if (!barcode || barcodeToItemMap.has(barcode.toLowerCase())) {
              barcode = generateUniqueBarcode();
            }

            itemRecord = await this.prisma.client.inventoryItem.create({
              data: {
                barcode,
                name: cleanName,
                description: itemData.description || 'Importado de Excel',
                quantity,
                min_stock,
                unit,
                category_id,
                sede_id: 1,
                status: 'activo',
              },
            });
            nameToItemMap.set(cleanName.toLowerCase(), itemRecord);
            barcodeToItemMap.set(itemRecord.barcode.toLowerCase(), itemRecord);
          }
          return itemRecord;
        }),
      );

      for (const resItem of chunkResults) {
        if (resItem) importedItems.push(resItem);
      }
    }

    // 3. Process movements
    const movementsToCreate: Prisma.InventoryMovementCreateManyInput[] = [];
    for (const mvData of movements) {
      const item_name = mvData.item_name?.trim();
      if (!item_name) continue;

      let item = nameToItemMap.get(item_name.toLowerCase()) || barcodeToItemMap.get(item_name.toLowerCase());

      if (!item) {
        const barcode = generateUniqueBarcode();
        const defaultCatName = 'Material de oficina';
        let category_id = categoryMap.get(defaultCatName.toLowerCase());
        if (!category_id) {
          const newCat = await this.prisma.client.category.create({
            data: { name: defaultCatName, description: 'Categoría por defecto' },
          });
          category_id = newCat.id;
          categoryMap.set(defaultCatName.toLowerCase(), category_id);
        }

        item = await this.prisma.client.inventoryItem.create({
          data: {
            barcode,
            name: item_name,
            description: 'Creado automáticamente durante importación de movimientos',
            quantity: 0,
            min_stock: 5,
            unit: mvData.unit || 'unidad',
            category_id,
            sede_id: 1,
            status: 'activo',
          },
        });
        nameToItemMap.set(item_name.toLowerCase(), item);
        barcodeToItemMap.set(barcode.toLowerCase(), item);
      }

      const type = String(mvData.type).toLowerCase() === 'salida' ? 'salida' : 'entrada';
      const quantity = Number(mvData.quantity) || 1;
      const registered_at = mvData.registered_at ? new Date(mvData.registered_at) : new Date();
      const observations = mvData.observations || '';
      const destinatario_name = mvData.destinatario_name || null;
      const operator_name = mvData.operator_name || 'admin';
      const user_id = userMap.get(operator_name.toLowerCase()) || defaultUser?.id || null;

      movementsToCreate.push({
        item_id: item.id,
        type,
        quantity,
        user_id,
        destinatario_name,
        registered_at,
        observations,
        sync_status: 'sincronizado',
      });
    }

    // Bulk insert movements in batches of 200 for maximum performance
    if (movementsToCreate.length > 0) {
      const batchSize = 200;
      for (let i = 0; i < movementsToCreate.length; i += batchSize) {
        const batch = movementsToCreate.slice(i, i + batchSize);
        await this.prisma.client.inventoryMovement.createMany({
          data: batch,
        });
      }
    }

    return {
      success: true,
      importedItemsCount: importedItems.length,
      importedMovementsCount: movementsToCreate.length,
    };
  }

  async generateCargoPdfStream() {
    const items = await this.prisma.client.inventoryItem.findMany({
      where: { status: 'activo' },
      include: { category: true },
      orderBy: { name: 'asc' },
    });

    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'portrait' });
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

    if (logoPath) {
      doc.image(logoPath, 36, 15, { width: 85 });
    }

    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(14).text('CARGO / ESTADO GENERAL DE INVENTARIO', 0, 20, { align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor('#64748B').text(`Fecha de emisión: ${new Date().toLocaleString('es-PE')}`, 36, 42, { align: 'right', width: 521 });
    doc.moveTo(36, 56).lineTo(557, 56).strokeColor('#CBD5E1').stroke();

    let y = 68;
    let globalIndex = 1;
    let totalQty = 0;

    const drawTableHeader = (currentY: number) => {
      doc.rect(36, currentY - 4, 521, 20).fill('#1E293B');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
      doc.text('N°', 40, currentY, { width: 24 });
      doc.text('Producto', 64, currentY, { width: 216 });
      doc.text('Medida', 280, currentY, { width: 58, align: 'center' });
      doc.text('Cantidad', 338, currentY, { width: 55, align: 'center' });
      doc.text('Observaciones', 395, currentY, { width: 158 });
    };

    drawTableHeader(y);
    y += 20;

    for (const item of items) {
      if (y > 750) {
        doc.addPage();
        y = 40;
        drawTableHeader(y);
        y += 20;
      }

      const isEven = (globalIndex - 1) % 2 === 0;
      if (isEven) {
        doc.rect(36, y - 3, 521, 18).fill('#F8FAFC');
      }

      doc.fillColor('#0F172A').font('Helvetica').fontSize(8);

      const obs = (item.description || item.category?.name || '-').replace(/[\r\n]+/g, ' ').trim();
      totalQty += item.quantity;

      doc.text(String(globalIndex), 40, y, { width: 24 });
      doc.text(item.name, 64, y, { width: 216, ellipsis: true });
      doc.text(item.unit || 'unidad', 280, y, { width: 58, align: 'center' });
      doc.text(String(item.quantity), 338, y, { width: 55, align: 'center' });
      doc.text(obs, 395, y, { width: 158, ellipsis: true });

      y += 18;
      globalIndex++;
    }

    // Totals row
    if (y > 720) {
      doc.addPage();
      y = 40;
    }
    y += 8;
    doc.rect(36, y - 4, 521, 20).fill('#E2E8F0');
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5);
    doc.text(`TOTAL ÍTEMS: ${items.length}`, 64, y, { width: 216 });
    doc.text(`TOTAL UNIDADES: ${totalQty}`, 300, y, { width: 150, align: 'center' });
    y += 35;

    // Signature blocks
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    y += 25;
    doc.strokeColor('#64748B').lineWidth(0.8);
    doc.moveTo(60, y).lineTo(230, y).stroke();
    doc.moveTo(330, y).lineTo(500, y).stroke();

    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8);
    doc.text('ENTREGADO CONFORME', 60, y + 4, { width: 170, align: 'center' });
    doc.text('RECIBIDO CONFORME', 330, y + 4, { width: 170, align: 'center' });

    doc.font('Helvetica').fontSize(7.5);
    doc.text('Firma / Responsable Almacén', 60, y + 14, { width: 170, align: 'center' });
    doc.text('Firma / Destinatario o Custodio', 330, y + 14, { width: 170, align: 'center' });

    doc.end();

    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    return {
      contentType: 'application/pdf',
      data: buffer,
    };
  }

  async generateCargoExcelReport(res: Response) {
    const items = await this.prisma.client.inventoryItem.findMany({
      where: { status: 'activo' },
      include: { category: true },
      orderBy: { name: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cargo de Inventario');

    worksheet.views = [{ showGridLines: true }];
    worksheet.pageSetup = {
      orientation: 'portrait',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    };

    // Title
    const titleCell = worksheet.getCell('B2');
    titleCell.value = 'CARGO / ESTADO GENERAL DE INVENTARIO';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: '14387F' } };
    worksheet.getRow(2).height = 24;

    const subtitleCell = worksheet.getCell('B3');
    subtitleCell.value = `Relación de bienes activos | Generado: ${new Date().toLocaleString('es-PE')}`;
    subtitleCell.font = { name: 'Arial', size: 9.5, italic: true, color: { argb: '475569' } };
    worksheet.getRow(3).height = 18;

    const headers = ['N°', 'Producto', 'Medida', 'Cantidad', 'Observaciones'];
    const headerRow = worksheet.getRow(5);
    headerRow.height = 24;

    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 2);
      cell.value = h;
      cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '14387F' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFFFFF' } },
        left: { style: 'thin', color: { argb: 'FFFFFF' } },
        bottom: { style: 'thin', color: { argb: 'FFFFFF' } },
        right: { style: 'thin', color: { argb: 'FFFFFF' } }
      };
    });

    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'CBD5E1' } },
      left: { style: 'thin', color: { argb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
      right: { style: 'thin', color: { argb: 'CBD5E1' } }
    };

    items.forEach((item, idx) => {
      const obs = item.description || item.category?.name || '';
      const row = worksheet.addRow([
        '',
        idx + 1,
        item.name,
        item.unit || 'unidad',
        item.quantity,
        obs
      ]);
      row.height = 20;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber < 2) return;
        cell.border = borderStyle;
        cell.font = { name: 'Arial', size: 9 };

        if (colNumber === 2 || colNumber === 4 || colNumber === 5) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }

        if (idx % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F8FAFC' }
          };
        }
      });
    });

    // Auto-fit
    worksheet.columns.forEach((column, colIdx) => {
      if (colIdx === 0) {
        column.width = 3;
        return;
      }
      if (colIdx === 1) column.width = 6;
      else if (colIdx === 2) column.width = 35;
      else if (colIdx === 3) column.width = 12;
      else if (colIdx === 4) column.width = 12;
      else if (colIdx === 5) column.width = 30;
    });

    await workbook.xlsx.write(res);
  }

  private parseRange(startDate?: string, endDate?: string) {
    const todayStr = new Date().toISOString().split('T')[0];
    const sStr = startDate?.trim() || todayStr;
    const eStr = endDate?.trim() || todayStr;
    const start = new Date(`${sStr}T00:00:00.000Z`);
    const end = new Date(`${eStr}T23:59:59.999Z`);
    return { start, end, sStr, eStr };
  }

  async getAlmacenReportData(startDate?: string, endDate?: string) {
    const { start, end, sStr, eStr } = this.parseRange(startDate, endDate);
    
    const items = await this.prisma.client.inventoryItem.findMany({
      where: { status: 'activo' },
      include: {
        category: true,
        movements: {
          orderBy: { registered_at: 'asc' }
        }
      },
      orderBy: { name: 'asc' },
    });

    const rows = items.map((item) => {
      let entradasPeriodo = 0;
      let salidasPeriodo = 0;
      let entradasPosteriores = 0;
      let salidasPosteriores = 0;

      for (const m of item.movements) {
        const mDate = new Date(m.registered_at);
        const qty = Number(m.quantity) || 0;
        if (mDate >= start && mDate <= end) {
          if (m.type === 'entrada') entradasPeriodo += qty;
          else if (m.type === 'salida') salidasPeriodo += qty;
        } else if (mDate > end) {
          if (m.type === 'entrada') entradasPosteriores += qty;
          else if (m.type === 'salida') salidasPosteriores += qty;
        }
      }

      const stockFinal = item.quantity - entradasPosteriores + salidasPosteriores;
      const cantidadInicial = stockFinal - entradasPeriodo + salidasPeriodo;

      return {
        id: item.id,
        producto: item.name,
        medida: item.unit || 'unidad',
        cantidad: Math.max(0, cantidadInicial),
        salida: salidasPeriodo,
        stock: Math.max(0, stockFinal),
      };
    });

    return { rows, sStr, eStr };
  }

  async generateAlmacenPdfStream(startDate?: string, endDate?: string) {
    const { rows, sStr, eStr } = await this.getAlmacenReportData(startDate, endDate);

    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'portrait' });
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

    if (logoPath) {
      doc.image(logoPath, 36, 14, { width: 80 });
    }

    // Título institucional
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(14).text('REPORTE DE ALMACEN-INFOUNSA', 0, 18, { align: 'center' });
    doc.fontSize(8.5).font('Helvetica').fillColor('#64748B').text(`Periodo: ${sStr} al ${eStr} | Emisión: ${new Date().toLocaleString('es-PE')}`, 36, 40, { align: 'right', width: 521 });
    doc.moveTo(36, 54).lineTo(557, 54).strokeColor('#CBD5E1').stroke();

    let y = 64;
    let globalIndex = 1;
    let totalCantidad = 0;
    let totalSalida = 0;
    let totalStock = 0;

    const drawTableHeader = (currentY: number) => {
      // Header background
      doc.rect(36, currentY - 4, 521, 26).fill('#1E293B');

      // Date labels over Cantidad and Stock
      doc.fillColor('#94A3B8').font('Helvetica').fontSize(7);
      doc.text(`[${sStr}]`, 320, currentY - 1, { width: 70, align: 'center' });
      doc.text(`[${eStr}]`, 470, currentY - 1, { width: 80, align: 'center' });

      // Column main titles
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
      doc.text('N°', 40, currentY + 9, { width: 22 });
      doc.text('Producto', 66, currentY + 9, { width: 190 });
      doc.text('Medida', 260, currentY + 9, { width: 55, align: 'center' });
      doc.text('Cantidad', 320, currentY + 9, { width: 70, align: 'center' });
      doc.text('Salida', 395, currentY + 9, { width: 70, align: 'center' });
      doc.text('Stock', 470, currentY + 9, { width: 80, align: 'center' });
    };

    drawTableHeader(y);
    y += 28;

    for (const r of rows) {
      if (y > 750) {
        doc.addPage();
        y = 40;
        drawTableHeader(y);
        y += 28;
      }

      const isEven = (globalIndex - 1) % 2 === 0;
      if (isEven) {
        doc.rect(36, y - 3, 521, 18).fill('#F8FAFC');
      }

      doc.fillColor('#0F172A').font('Helvetica').fontSize(8.5);

      totalCantidad += r.cantidad;
      totalSalida += r.salida;
      totalStock += r.stock;

      doc.text(String(globalIndex), 40, y, { width: 22 });
      doc.text(r.producto, 66, y, { width: 190, ellipsis: true });
      doc.text(r.medida, 260, y, { width: 55, align: 'center' });
      doc.text(String(r.cantidad), 320, y, { width: 70, align: 'center' });
      doc.text(String(r.salida), 395, y, { width: 70, align: 'center' });
      doc.text(String(r.stock), 470, y, { width: 80, align: 'center' });

      y += 18;
      globalIndex++;
    }

    // Totales
    if (y > 720) {
      doc.addPage();
      y = 40;
    }
    y += 6;
    doc.rect(36, y - 4, 521, 20).fill('#E2E8F0');
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5);
    doc.text('TOTALES:', 66, y + 2, { width: 190 });
    doc.text(String(totalCantidad), 320, y + 2, { width: 70, align: 'center' });
    doc.text(String(totalSalida), 395, y + 2, { width: 70, align: 'center' });
    doc.text(String(totalStock), 470, y + 2, { width: 80, align: 'center' });
    y += 35;

    // Firmas de conformidad
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    y += 25;
    doc.strokeColor('#64748B').lineWidth(0.8);
    doc.moveTo(60, y).lineTo(230, y).stroke();
    doc.moveTo(330, y).lineTo(500, y).stroke();

    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8);
    doc.text('ENTREGADO CONFORME', 60, y + 4, { width: 170, align: 'center' });
    doc.text('RECIBIDO CONFORME', 330, y + 4, { width: 170, align: 'center' });

    doc.font('Helvetica').fontSize(7.5);
    doc.text('Firma / Responsable Almacén', 60, y + 14, { width: 170, align: 'center' });
    doc.text('Firma / Destinatario o Custodio', 330, y + 14, { width: 170, align: 'center' });

    doc.end();

    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    return {
      contentType: 'application/pdf',
      data: buffer,
    };
  }

  async generateAlmacenExcelReport(startDate: string, endDate: string, res: Response) {
    const { rows, sStr, eStr } = await this.getAlmacenReportData(startDate, endDate);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte de Almacén');

    worksheet.views = [{ showGridLines: true }];
    worksheet.pageSetup = {
      orientation: 'portrait',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    };

    // Título
    const titleCell = worksheet.getCell('B2');
    titleCell.value = 'REPORTE DE ALMACEN-INFOUNSA';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: '14387F' } };
    worksheet.getRow(2).height = 24;

    const subtitleCell = worksheet.getCell('B3');
    subtitleCell.value = `Periodo: ${sStr} al ${eStr} | Generado: ${new Date().toLocaleString('es-PE')}`;
    subtitleCell.font = { name: 'Arial', size: 9.5, italic: true, color: { argb: '475569' } };
    worksheet.getRow(3).height = 18;

    // Sub-header con fechas encima de Cantidad y Stock
    const dateHeaderRow = worksheet.getRow(5);
    dateHeaderRow.height = 16;
    dateHeaderRow.getCell(5).value = `[${sStr}]`;
    dateHeaderRow.getCell(5).font = { name: 'Arial', size: 8, italic: true, bold: true, color: { argb: 'FFFFFF' } };
    dateHeaderRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    dateHeaderRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };

    dateHeaderRow.getCell(7).value = `[${eStr}]`;
    dateHeaderRow.getCell(7).font = { name: 'Arial', size: 8, italic: true, bold: true, color: { argb: 'FFFFFF' } };
    dateHeaderRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
    dateHeaderRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };

    // Fila de encabezados principales
    const headers = ['N°', 'Producto', 'Medida', 'Cantidad', 'Salida', 'Stock'];
    const headerRow = worksheet.getRow(6);
    headerRow.height = 22;

    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 2);
      cell.value = h;
      cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '14387F' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFFFFF' } },
        left: { style: 'thin', color: { argb: 'FFFFFF' } },
        bottom: { style: 'thin', color: { argb: 'FFFFFF' } },
        right: { style: 'thin', color: { argb: 'FFFFFF' } }
      };
    });

    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'CBD5E1' } },
      left: { style: 'thin', color: { argb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
      right: { style: 'thin', color: { argb: 'CBD5E1' } }
    };

    let startDataRow = 7;
    rows.forEach((r, idx) => {
      const row = worksheet.addRow([
        '',
        idx + 1,
        r.producto,
        r.medida,
        r.cantidad,
        r.salida,
        r.stock
      ]);
      row.height = 20;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber < 2) return;
        cell.border = borderStyle;
        cell.font = { name: 'Arial', size: 9 };

        if (colNumber === 2 || colNumber === 4 || colNumber === 5 || colNumber === 6 || colNumber === 7) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }

        if (idx % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F8FAFC' }
          };
        }
      });
    });

    const endDataRow = startDataRow + rows.length - 1;

    // Fila de Totales
    if (rows.length > 0) {
      const totalsRow = worksheet.addRow([
        '',
        '',
        'TOTALES',
        '',
        { formula: `SUM(E${startDataRow}:E${endDataRow})` },
        { formula: `SUM(F${startDataRow}:F${endDataRow})` },
        { formula: `SUM(G${startDataRow}:G${endDataRow})` }
      ]);
      totalsRow.height = 22;
      totalsRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber < 2) return;
        cell.border = borderStyle;
        cell.font = { name: 'Arial', size: 9.5, bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'E2E8F0' }
        };
        if (colNumber >= 4) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
    }

    // Ancho de columnas
    worksheet.columns.forEach((column, colIdx) => {
      if (colIdx === 0) column.width = 3;
      else if (colIdx === 1) column.width = 6;   // N°
      else if (colIdx === 2) column.width = 35;  // Producto
      else if (colIdx === 3) column.width = 12;  // Medida
      else if (colIdx === 4) column.width = 14;  // Cantidad
      else if (colIdx === 5) column.width = 14;  // Salida
      else if (colIdx === 6) column.width = 14;  // Stock
    });

    await workbook.xlsx.write(res);
  }

  async previewImportExcel(buffer: Buffer) {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('El archivo Excel está vacío o es inválido.');
    }

    const extractCell = (v: unknown): unknown => (v && typeof v === 'object' && 'result' in v ? (v as { result: unknown }).result : v);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'formato inválido';
      throw new BadRequestException(`No se pudo leer el archivo Excel: ${msg}`);
    }

    // 1. Preload DB items and categories for match detection
    const [existingItems, categoriesList] = await Promise.all([
      this.prisma.client.inventoryItem.findMany({ select: { id: true, name: true, barcode: true } }),
      this.prisma.client.category.findMany({ select: { id: true, name: true } }),
    ]);

    const existingNamesSet = new Set(
      existingItems.map((item) => (item.name || '').toLowerCase().trim())
    );

    // Helper to find worksheet by case-insensitive name
    const findWorksheet = (name: string) => {
      const lower = name.toLowerCase();
      return (
        workbook.worksheets.find((ws) => ws.name.toLowerCase().trim() === lower) ||
        workbook.getWorksheet(name)
      );
    };

    // 1. Parse STOCK sheet (or first sheet if none named STOCK)
    const stockSheet = findWorksheet('STOCK') || workbook.worksheets[0];
    interface RawStockItem {
      rowIndex: number;
      name: string;
      unit: string;
      quantity: number;
      min_stock: number;
    }
    const rawStockItems: RawStockItem[] = [];
    if (stockSheet) {
      stockSheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 4) {
          const values = row.values as Array<Record<string, unknown> | string | number | boolean | Date | null | undefined>;
          if (!values) return;
          // Col C (values[3]): PRODUCTO
          // Col D (values[4]): MEDIDA
          // Col E (values[5]): CANTIDAD
          // Col F (values[6]): STOCK MÍNIMO (opcional)
          const rawName = extractCell(values[3]);
          const rawUnit = extractCell(values[4]);
          const rawQty = extractCell(values[5]);
          const rawMinStock = extractCell(values[6]);

          const name = rawName ? String(rawName).trim() : '';
          if (name && name.toUpperCase() !== 'PRODUCTO') {
            rawStockItems.push({
              rowIndex: rowNumber,
              name,
              unit: rawUnit ? String(rawUnit).trim() : 'UNIDAD',
              quantity: rawQty !== null && rawQty !== undefined && !isNaN(Number(rawQty)) ? Number(rawQty) : 0,
              min_stock: rawMinStock !== null && rawMinStock !== undefined && !isNaN(Number(rawMinStock)) ? Number(rawMinStock) : 5,
            });
          }
        }
      });
    }

    // Guess category and map stock items
    const nameCounts: Record<string, number> = {};
    rawStockItems.forEach((item) => {
      const key = item.name.trim().toLowerCase();
      if (key) nameCounts[key] = (nameCounts[key] || 0) + 1;
    });

    const defaultCategory = categoriesList[0] || { id: 1, name: 'Material de oficina' };

    const stockItems = rawStockItems.map((item) => {
      const cleanName = item.name.trim();
      const nameLower = cleanName.toLowerCase();
      const normalized = nameLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      let categoryId = defaultCategory.id;
      let categoryName = defaultCategory.name;

      if (
        normalized.includes('limpieza') ||
        normalized.includes('jabon') ||
        normalized.includes('desinfectante') ||
        normalized.includes('guantes') ||
        normalized.includes('hisopo')
      ) {
        const match = categoriesList.find((c) =>
          c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('limpieza')
        );
        if (match) {
          categoryId = match.id;
          categoryName = match.name;
        }
      } else if (
        normalized.includes('papel') ||
        normalized.includes('archivador') ||
        normalized.includes('boligrafo') ||
        normalized.includes('lapicero') ||
        normalized.includes('borrador')
      ) {
        const match = categoriesList.find((c) => {
          const catNorm = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return catNorm.includes('oficina') || catNorm.includes('escritorio');
        });
        if (match) {
          categoryId = match.id;
          categoryName = match.name;
        }
      } else if (
        normalized.includes('computo') ||
        normalized.includes('monitor') ||
        normalized.includes('proyector') ||
        normalized.includes('teclado') ||
        normalized.includes('servidor')
      ) {
        const match = categoriesList.find((c) => {
          const catNorm = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return catNorm.includes('computo') || catNorm.includes('inform');
        });
        if (match) {
          categoryId = match.id;
          categoryName = match.name;
        }
      }

      const isDbMatch = existingNamesSet.has(nameLower);
      const isExcelDuplicate = (nameCounts[nameLower] || 0) > 1;

      return {
        rowIndex: item.rowIndex,
        name: cleanName,
        unit: item.unit || 'UNIDAD',
        quantity: item.quantity ?? 0,
        min_stock: item.min_stock || 5,
        category_id: categoryId,
        category_name: categoryName,
        description: 'Importado de planilla de inventario',
        action: 'overwrite',
        isDbMatch,
        isExcelDuplicate,
        error: cleanName ? '' : 'El nombre del producto no puede estar vacío.',
      };
    });

    // 2. Parse INGRESO sheet
    interface ParsedMovementPreview {
      rowIndex: number;
      item_name: string;
      unit?: string;
      type: string;
      quantity: number;
      registered_at: string;
      observations: string;
      destinatario_name: string | null;
      operator_name: string;
    }
    const ingresoSheet = findWorksheet('INGRESO');
    const ingresoMovements: ParsedMovementPreview[] = [];
    if (ingresoSheet) {
      ingresoSheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 3) {
          const values = row.values as Array<Record<string, unknown> | string | number | boolean | Date | null | undefined>;
          if (!values) return;
          const rawName = extractCell(values[3]);
          if (!rawName) return;

          const nameStr = String(rawName).trim();
          if (
            !nameStr ||
            nameStr.toLowerCase().includes('descripción') ||
            nameStr.toLowerCase().includes('ingresos de bienes')
          ) {
            return;
          }

          let unit = 'UNIDAD';
          let quantity = 0;

          if (rowNumber < 40) {
            unit = 'UNIDAD';
            const valD = extractCell(values[4]);
            const valE = extractCell(values[5]);

            if (valD !== null && valD !== undefined && !isNaN(Number(valD))) {
              quantity = Number(valD);
            } else if (valE !== null && valE !== undefined && !isNaN(Number(valE))) {
              quantity = Number(valE);
            }
          } else {
            const rawUnit = extractCell(values[4]);
            unit = rawUnit ? String(rawUnit).trim() : 'UNIDAD';

            const rawQty = extractCell(values[5]);
            quantity = Number(rawQty) || 0;
          }

          const dateVal = values[6];
          let date = new Date().toISOString();
          if (dateVal instanceof Date) {
            date = dateVal.toISOString();
          } else if (dateVal) {
            const d = new Date(String(dateVal));
            if (!isNaN(d.getTime())) date = d.toISOString();
          }

          const salidaStr = values[7] ? String(values[7]).trim() : '';
          const obsStr = values[8] ? String(values[8]).trim() : '';
          const observations = [salidaStr, obsStr].filter(Boolean).join(' - ') || 'Ingreso importado';

          ingresoMovements.push({
            rowIndex: rowNumber,
            item_name: nameStr,
            unit,
            type: 'entrada',
            quantity: Math.max(0, quantity),
            registered_at: date,
            observations,
            destinatario_name: null,
            operator_name: 'admin',
          });
        }
      });
    }

    // 3. Parse SALIDA sheet
    const salidaSheet = findWorksheet('SALIDA');
    const salidaMovements: ParsedMovementPreview[] = [];
    if (salidaSheet) {
      salidaSheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 3) {
          const values = row.values as Array<Record<string, unknown> | string | number | boolean | Date | null | undefined>;
          if (!values) return;
          const dateVal = values[2];
          const rawName = extractCell(values[3]);
          const qtyVal = extractCell(values[4]);
          const userVal = values[5];
          const deliverVal = values[6];

          if (!rawName) return;
          const nameStr = String(rawName).trim();
          if (
            !nameStr ||
            nameStr.toLowerCase().includes('material') ||
            nameStr.toLowerCase().includes('saliidas del almacen')
          ) {
            return;
          }

          let date = new Date().toISOString();
          if (dateVal instanceof Date) {
            date = dateVal.toISOString();
          } else if (dateVal) {
            const d = new Date(String(dateVal));
            if (!isNaN(d.getTime())) date = d.toISOString();
          }

          const obsParts: string[] = [];
          for (let colIdx = 7; colIdx < values.length; colIdx++) {
            if (values[colIdx]) obsParts.push(String(values[colIdx]).trim());
          }
          const observations = obsParts.join(' - ') || 'Egreso importado';

          salidaMovements.push({
            rowIndex: rowNumber,
            item_name: nameStr,
            type: 'salida',
            quantity: Math.max(0, Number(qtyVal) || 0),
            registered_at: date,
            observations,
            destinatario_name: userVal ? String(userVal).trim() : 'Área General',
            operator_name: deliverVal ? String(deliverVal).trim() : 'admin',
          });
        }
      });
    }

    const totalItems = stockItems.length;
    const dbMatchCount = stockItems.filter((i) => i.isDbMatch).length;
    const excelDuplicateCount = stockItems.filter((i) => i.isExcelDuplicate).length;
    const zeroStockCount = stockItems.filter((i) => i.quantity <= 0).length;
    const criticalCount = stockItems.filter((i) => i.quantity <= i.min_stock && i.quantity > 0).length;
    const totalMovements = ingresoMovements.length + salidaMovements.length;
    const emptyFieldsCount = stockItems.filter((i) => !!i.error).length;

    return {
      stockItems,
      ingresoMovements,
      salidaMovements,
      summary: {
        totalItems,
        dbMatchCount,
        excelDuplicateCount,
        zeroStockCount,
        criticalCount,
        totalMovements,
        emptyFieldsCount,
      },
    };
  }

  async generateImportTemplate(res: Response) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'InfoUNSA';
    workbook.lastModifiedBy = 'InfoUNSA';
    workbook.created = new Date();

    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };

    const headerFont: Partial<ExcelJS.Font> = {
      name: 'Segoe UI',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };

    const titleFont: Partial<ExcelJS.Font> = {
      name: 'Segoe UI',
      size: 13,
      bold: true,
      color: { argb: 'FF1E3A8A' },
    };

    // ── 1. Hoja STOCK ───────────────────────────────────
    const stockSheet = workbook.addWorksheet('STOCK');
    stockSheet.addRow(['INFOUNSA - PLANTILLA TIPO DE CONTROL DE STOCK']).font = titleFont;
    stockSheet.addRow(['Instrucciones: Ingrese sus bienes a partir de la Fila 4.']).font = { italic: true, color: { argb: 'FF64748B' } };
    stockSheet.addRow([]);

    const stockHeaders = stockSheet.addRow(['N°', 'CÓDIGO', 'PRODUCTO', 'MEDIDA', 'CANTIDAD', 'STOCK MÍNIMO']);
    stockHeaders.font = headerFont;
    stockHeaders.eachCell((cell) => {
      cell.fill = headerFill;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    stockSheet.addRow([1, 'MAT-001', 'Papel Bond A4 75g (Paquete x500)', 'PAQUETE', 50, 10]);
    stockSheet.addRow([2, 'MAT-002', 'Bolígrafo Azul 0.7mm', 'UNIDAD', 120, 20]);
    stockSheet.addRow([3, 'LIM-001', 'Jabón Líquido Antiséptico 1L', 'FRASCO', 30, 5]);
    stockSheet.addRow([4, 'INF-001', 'Teclado USB Ergonómico', 'UNIDAD', 15, 3]);

    stockSheet.columns = [
      { width: 8 },
      { width: 15 },
      { width: 45 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    // ── 2. Hoja INGRESO ─────────────────────────────────
    const ingresoSheet = workbook.addWorksheet('INGRESO');
    ingresoSheet.addRow(['INFOUNSA - REGISTRO DE INGRESOS DE BIENES (ABASTECIMIENTO)']).font = titleFont;
    ingresoSheet.addRow(['Instrucciones: Registre los abastecimientos de stock a partir de la Fila 3.']).font = { italic: true, color: { argb: 'FF64748B' } };

    const ingresoHeaders = ingresoSheet.addRow(['N°', 'CÓDIGO', 'Descripción', 'UNIDAD', 'Cantidad', 'Fecha', 'Origen/Proveedor', 'Observaciones']);
    ingresoHeaders.font = headerFont;
    ingresoHeaders.eachCell((cell) => {
      cell.fill = headerFill;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    ingresoSheet.addRow([1, 'MAT-001', 'Papel Bond A4 75g (Paquete x500)', 'PAQUETE', 20, '2026-08-01', 'Proveedor Central', 'Ingreso por abastecimiento mensual']);
    ingresoSheet.addRow([2, 'LIM-001', 'Jabón Líquido Antiséptico 1L', 'FRASCO', 10, '2026-08-02', 'Donación Institucional', 'Ingreso de higiene']);

    ingresoSheet.columns = [
      { width: 8 },
      { width: 15 },
      { width: 40 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 25 },
      { width: 35 },
    ];

    // ── 3. Hoja SALIDA ──────────────────────────────────
    const salidaSheet = workbook.addWorksheet('SALIDA');
    salidaSheet.addRow(['INFOUNSA - REGISTRO DE SALIDAS DE ALMACÉN (DISTRIBUCIÓN)']).font = titleFont;
    salidaSheet.addRow(['Instrucciones: Registre las salidas a áreas a partir de la Fila 3.']).font = { italic: true, color: { argb: 'FF64748B' } };

    const salidaHeaders = salidaSheet.addRow(['N°', 'Fecha de Entrega', 'Material', 'Cantidad', 'Usuario / Área Destino', 'Entregado Por', 'Observaciones']);
    salidaHeaders.font = headerFont;
    salidaHeaders.eachCell((cell) => {
      cell.fill = headerFill;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    salidaSheet.addRow([1, '2026-08-02', 'Papel Bond A4 75g (Paquete x500)', 2, 'Mendoza Emerson - Oficina Registro', 'Miguel Tinta', 'Entrega de útiles de escritorio']);
    salidaSheet.addRow([2, '2026-08-03', 'Bolígrafo Azul 0.7mm', 5, 'Sede Central - Recepción', 'Luis Quispe', 'Entrega regular']);

    salidaSheet.columns = [
      { width: 8 },
      { width: 18 },
      { width: 40 },
      { width: 15 },
      { width: 35 },
      { width: 25 },
      { width: 35 },
    ];

    await workbook.xlsx.write(res);
    res.end();
  }
}
