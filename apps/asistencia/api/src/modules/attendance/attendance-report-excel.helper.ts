import * as ExcelJS from 'exceljs';
import { Response } from 'express';

interface AttendanceRecord {
  fecha_hora_marca: Date;
  tipo: string;
  observacion: string | null;
  usuario: {
    dni: string;
    nombre_completo: string;
    condicion: string | null;
    cargo: string | null;
  } | null;
}

function splitFullName(fullName: string): { apellidos: string; nombres: string } {
  if (!fullName) return { apellidos: 'N/A', nombres: 'N/A' };
  
  if (fullName.includes(',')) {
    const parts = fullName.split(',');
    return {
      apellidos: parts[0].trim(),
      nombres: parts.slice(1).join(',').trim()
    };
  }

  const cleanName = fullName.trim();
  const words = cleanName.split(/\s+/);
  
  if (words.length <= 2) {
    return {
      apellidos: words[0] || '',
      nombres: words.slice(1).join(' ') || ''
    };
  }

  return {
    apellidos: `${words[0]} ${words[1]}`,
    nombres: words.slice(2).join(' ')
  };
}

function parseUserNames(usuario: {
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  nombres?: string | null;
  nombre_completo?: string | null;
  name?: string | null;
  nombre?: string | null;
} | null | undefined): { apellidos: string; nombres: string } {
  const p = (usuario?.apellido_paterno || '').trim();
  const m = (usuario?.apellido_materno || '').trim();
  if (p || m) {
    const apellidos = m && p ? `${m} ${p}` : (m || p);
    const nombres = (usuario?.nombres || '').trim();
    return { apellidos: apellidos || 'Sin Apellidos', nombres: nombres || 'Sin Nombres' };
  }
  const full = (usuario?.nombre_completo || usuario?.name || usuario?.nombre || '').trim();
  return splitFullName(full);
}

export async function generatePivotedExcelReport(
  asistencias: AttendanceRecord[],
  startDateStr: string,
  endDateStr: string,
  res?: Response
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Control de Personal');

  // Generate unique date list in the range
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T23:59:59');
  
  const datesList: string[] = [];
  const curr = new Date(start);
  while (curr <= end) {
    datesList.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }

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

  // Row 2: Title
  const titleCell = worksheet.getCell('C2');
  titleCell.value = 'RELACIÓN DE ASISTENCIA PERSONAL  INFOUNSA 2026';
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: '14387F' } };
  worksheet.getRow(2).height = 30;
  
  // Row 4: Sub-header "FECHAS DE REGISTRO"
  // Dates columns will start at index 7 (column G)
  const startColIndex = 7;
  const endColIndex = startColIndex + datesList.length - 1;
  
  if (datesList.length > 0) {
    worksheet.mergeCells(4, startColIndex, 4, endColIndex);
    const subheaderCell = worksheet.getCell(4, startColIndex);
    subheaderCell.value = 'FECHAS DE REGISTRO';
    subheaderCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    subheaderCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '1E3A8A' }
    };
    subheaderCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(4).height = 20;
  }

  // Row 5: Column headers
  const headers = [
    'Nº',
    'APELLIDOS',
    'NOMBRES',
    'CONDICIÓN',
    'CARGO',
    'HORA DE INGRESO ',
    ...datesList,
    'OBSERVACIONES'
  ];

  const headerRow = worksheet.getRow(5);
  headerRow.height = 25;
  headers.forEach((h, idx) => {
    const colNumber = idx + 1;
    const cell = headerRow.getCell(colNumber);
    cell.value = h.startsWith('202') ? new Date(h + 'T00:00:00') : h;
    
    // Format date headers to DD/MM
    if (h.startsWith('202')) {
      cell.numFmt = 'dd/mm';
    }

    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '14387F' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFFFFF' } },
      left: { style: 'thin', color: { argb: 'FFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFF' } }
    };
  });

  // Group attendance by user DNI
  const userMap = new Map<string, {
    dni: string;
    nombre_completo: string;
    condicion: string;
    cargo: string;
    hora_ingreso: string;
    marks: Map<string, string>; // dateString -> formattedTime
    observaciones: string[];
  }>();

  for (const a of asistencias) {
    if (!a.usuario) continue;
    const dni = a.usuario.dni;
    if (!userMap.has(dni)) {
      const resolvedName = a.usuario.nombre_completo || (a.usuario as any).name || (a.usuario as any).nombres || 'Desconocido';
      userMap.set(dni, {
        dni,
        nombre_completo: resolvedName,
        condicion: a.usuario.condicion || (dni.startsWith('VISIT') || dni === 'VISIT000' ? 'VISITANTE' : 'PERSONAL'),
        cargo: a.usuario.cargo || (dni.startsWith('VISIT') || dni === 'VISIT000' ? 'VISITANTE' : 'COLABORADOR'),
        hora_ingreso: '08:00 a.m.', // Default/Base
        marks: new Map(),
        observaciones: []
      });
    }

    const userData = userMap.get(dni)!;
    
    // Format time in PE timezone
    const timeStr = new Date(a.fecha_hora_marca).toLocaleTimeString('es-PE', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toLowerCase();
    
    const dateStr = new Date(a.fecha_hora_marca).toISOString().split('T')[0];
    
    // Only register the first check-in (entrada) of the day in this cell
    if (a.tipo === 'entrada') {
      userData.marks.set(dateStr, timeStr);
    }
    
    function sanitizeText(str: string | null): string {
      if (!str) return '';
      return str
        .replace(/lleg\?\?/gi, 'Llegó')
        .replace(/t\?\?cnica/gi, 'técnica')
        .replace(/reuni\?\?n/gi, 'Reunión')
        .replace(/coordinaci\?\?n/gi, 'coordinación')
        .replace(/mi\?\?rcoles/gi, 'miércoles')
        .replace(/s\?\?bado/gi, 'sábado')
        .replace(/asociaci\?\?n/gi, 'asociación')
        .replace(/marcaci\?\?n/gi, 'marcación')
        .replace(/operaci\?\?n/gi, 'operación')
        .replace(/direcci\?\?n/gi, 'dirección')
        .replace(/retraso\s+leve/gi, 'Retraso leve')
        .replace(/\?\?/g, 'o');
    }

    if (a.observacion) {
      userData.observaciones.push(sanitizeText(a.observacion));
    }
  }

  // Populate data rows
  let rowNumber = 6;
  let index = 1;
  const borderStyle: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'CBD5E1' } },
    left: { style: 'thin', color: { argb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
    right: { style: 'thin', color: { argb: 'CBD5E1' } }
  };

  userMap.forEach((user) => {
    const splitName = parseUserNames(user);
    const rowValues: Array<string | number | null | undefined> = [];
    
    rowValues[1] = index;
    rowValues[2] = splitName.apellidos;
    rowValues[3] = splitName.nombres;
    rowValues[4] = user.condicion;
    rowValues[5] = user.cargo;
    rowValues[6] = user.hora_ingreso;

    // Fill dates
    datesList.forEach((date, dateIdx) => {
      const mark = user.marks.get(date);
      rowValues[startColIndex + dateIdx] = mark || null;
    });

    // Fill observations
    const obsColIndex = startColIndex + datesList.length;
    rowValues[obsColIndex] = user.observaciones.length > 0 
      ? Array.from(new Set(user.observaciones)).join(', ') 
      : null;

    const row = worksheet.addRow(rowValues);
    row.height = 20;

    // Apply styles to all cells in the row
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = borderStyle;
      cell.font = { name: 'Arial', size: 9 };
      
      // Alternating row background colors
      if (index % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'F8FAFC' }
        };
      }

      // Alignments
      if (colNumber === 1) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (colNumber === 2 || colNumber === 3) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else if (colNumber >= 4 && colNumber <= 6) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (colNumber >= startColIndex && colNumber < obsColIndex) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });

    index++;
  });

  // Autofit columns (with limits)
  worksheet.columns.forEach((column, colIdx) => {
    let maxLength = 10;
    column.eachCell!({ includeEmpty: true }, (cell) => {
      const valStr = cell.value ? cell.value.toString() : '';
      if (valStr.length > maxLength) {
        maxLength = valStr.length;
      }
    });
    
    const colNumber = colIdx + 1;
    // Don't auto-fit columns that are merged in titles or dates
    if (colNumber === 2 || colNumber === 3) {
      column.width = Math.min(30, maxLength + 3);
    } else if (colNumber >= startColIndex && colNumber < startColIndex + datesList.length) {
      column.width = 12; // Date cells fixed size
    } else if (colNumber === startColIndex + datesList.length) {
      column.width = Math.min(40, maxLength + 3); // Observations
    } else {
      column.width = Math.min(18, maxLength + 3);
    }
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (res) {
    res.setHeader?.('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader?.('Content-Disposition', 'attachment; filename=reporte-asistencia.xlsx');
    res.send?.(buffer);
  }
  return buffer;
}
