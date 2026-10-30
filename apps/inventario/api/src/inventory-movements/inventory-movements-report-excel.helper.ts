import * as ExcelJS from 'exceljs';
import { Response } from 'express';

interface MovementRecord {
  id: number;
  item_id: number | null;
  type: string;
  quantity: number;
  registered_at: Date;
  destinatario_name: string | null;
  observations: string | null;
  item: {
    name: string;
    barcode: string;
  } | null;
  user: {
    username: string;
  } | null;
  area: {
    name: string;
    responsable: string;
  } | null;
}

export async function generateInventoryExcelReport(
  movements: MovementRecord[],
  startDateStr: string,
  endDateStr: string,
  format: 'resumido' | 'detallado',
  res?: Response
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Reporte de Movimientos');

  // Set default grid lines visible and page setup for A4 Landscape printing
  worksheet.views = [{ showGridLines: true }];
  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
  };

  // Title Row (Row 2)
  const titleCell = worksheet.getCell('B2');
  titleCell.value = format === 'resumido'
    ? 'REPORTE RESUMIDO DE MOVIMIENTOS DE INVENTARIO'
    : 'REPORTE DETALLADO DE MOVIMIENTOS DE INVENTARIO';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: '14387F' } };
  worksheet.getRow(2).height = 25;

  // Subtitle Row (Row 3)
  const subtitleCell = worksheet.getCell('B3');
  subtitleCell.value = `Rango: ${startDateStr} al ${endDateStr} | Generado: ${new Date().toLocaleString('es-PE')}`;
  subtitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: '475569' } };
  worksheet.getRow(3).height = 18;

  const headerStyle = {
    font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '14387F' }
    } as ExcelJS.Fill,
    alignment: { vertical: 'middle', horizontal: 'center' } as ExcelJS.Alignment,
    border: {
      top: { style: 'thin', color: { argb: 'FFFFFF' } },
      left: { style: 'thin', color: { argb: 'FFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFF' } }
    } as ExcelJS.Borders
  };

  const borderStyle: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'CBD5E1' } },
    left: { style: 'thin', color: { argb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
    right: { style: 'thin', color: { argb: 'CBD5E1' } }
  };

  if (format === 'resumido') {
    // Summarized Report: Group by movement type
    const summaryMap: Record<string, { count: number; totalQty: number }> = {};
    for (const m of movements) {
      const typeKey = m.type || 'entrada';
      if (!summaryMap[typeKey]) {
        summaryMap[typeKey] = { count: 0, totalQty: 0 };
      }
      summaryMap[typeKey].count += 1;
      summaryMap[typeKey].totalQty += Number(m.quantity || 0);
    }

    const headers = ['Tipo de Movimiento', 'Total Transacciones', 'Cantidad Total Artículos'];
    const headerRow = worksheet.getRow(5);
    headerRow.height = 24;

    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 2); // Start at Column B (index 2)
      cell.value = h;
      cell.font = headerStyle.font;
      cell.fill = headerStyle.fill;
      cell.alignment = headerStyle.alignment;
      cell.border = headerStyle.border;
    });

    let index = 1;
    Object.entries(summaryMap).forEach(([type, stats]) => {
      const row = worksheet.addRow([
        '', // A column empty spacer
        type.toUpperCase(),
        stats.count,
        stats.totalQty
      ]);
      row.height = 20;

      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (colNumber < 2) return;
        cell.border = borderStyle;
        cell.font = { name: 'Arial', size: 10 };
        
        if (colNumber === 2) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }

        if (index % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F8FAFC' }
          };
        }
      });
      index++;
    });

  } else {
    // Detailed Report: Listing all movements
    const headers = [
      'N°',
      'Fecha/Hora',
      'Tipo',
      'Bien / Artículo',
      'Cantidad',
      'Operador / Destino',
      'Observaciones'
    ];

    const headerRow = worksheet.getRow(5);
    headerRow.height = 24;

    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 2); // Start at Column B (index 2)
      cell.value = h;
      cell.font = headerStyle.font;
      cell.fill = headerStyle.fill;
      cell.alignment = headerStyle.alignment;
      cell.border = headerStyle.border;
    });

    movements.forEach((m, idx) => {
      const dateStr = new Date(m.registered_at).toLocaleString('es-PE', {
        timeZone: 'America/Lima'
      });
      const dest = m.area ? `${m.area.name} - ${m.area.responsable}` : (m.destinatario_name || m.user?.username || '-');
      
      const row = worksheet.addRow([
        '', // A spacer
        idx + 1,
        dateStr,
        m.type.toUpperCase(),
        m.item?.name || `Artículo ${m.item_id}`,
        m.quantity,
        dest,
        m.observations || ''
      ]);
      row.height = 20;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber < 2) return;
        cell.border = borderStyle;
        cell.font = { name: 'Arial', size: 9 };

        if (colNumber === 2 || colNumber === 4 || colNumber === 6) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 3 || colNumber === 5 || colNumber === 7 || colNumber === 8) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
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
  }

  // Auto-fit columns
  worksheet.columns.forEach((column, colIdx) => {
    if (colIdx === 0) {
      column.width = 3; // Spacer column
      return;
    }
    let maxLength = 10;
    column.eachCell!({ includeEmpty: false }, (cell) => {
      const valStr = cell.value ? cell.value.toString() : '';
      if (valStr.length > maxLength) {
        maxLength = valStr.length;
      }
    });
    column.width = Math.min(30, maxLength + 3);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (res) {
    res.setHeader?.('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader?.('Content-Disposition', 'attachment; filename=reporte-movimientos.xlsx');
    res.send?.(buffer);
  }
  return buffer;
}
