import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import { ReportQueryDto } from './dto/report-query.dto';
import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { generatePivotedExcelReport } from './attendance-report-excel.helper';

export interface AttendanceClientRecord {
  id?: string | number;
  id_local?: string | number;
  type?: string;
  tipo?: string;
  registered_at?: string | Date;
  fecha_hora_marca?: string | Date;
  fecha_hora?: string | Date;
  observacion?: string | null;
  usuario_id?: string;
  dni?: string;
  name?: string;
  nombre?: string;
  nombres?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  condicion?: string;
  cargo?: string;
  [key: string]: unknown;
}

export interface NormalizedAttendanceReportItem {
  id_operacion_local?: string | number;
  tipo: string;
  fecha_hora_marca: Date;
  observacion?: string | null;
  usuario: {
    id?: string;
    dni?: string;
    nombre_completo?: string;
    nombres?: string;
    apellido_paterno?: string;
    apellido_materno?: string;
    condicion?: string;
    cargo?: string;
  };
}

@Injectable()
export class AttendanceReportService {
  private readonly logger = new Logger(AttendanceReportService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Valida y calcula el rango de fechas para reportes de asistencia (máximo 90 días).
   */
  public parseReportRange(startDate: string, endDate: string) {
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate y endDate son requeridos');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('startDate y endDate deben ser fechas validas');
    }

    // Ajustar al final del día 23:59:59.999 para cubrir todos los registros
    end.setHours(23, 59, 59, 999);

    if (start > end) {
      throw new BadRequestException('startDate no puede ser posterior a endDate');
    }

    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 90) {
      throw new BadRequestException('El rango de fechas no puede exceder los 90 dias');
    }

    return { start, end };
  }

  /**
   * Obtiene el reporte agrupado de usuarios con totales de entradas y salidas.
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
    const { start, end } = this.parseReportRange(startDate, endDate);

    const asistenciaWhere: Prisma.AsistenciaWhereInput = {
      fecha_hora_marca: {
        gte: start,
        lte: end,
      },
      estado_auditoria: {
        not: 'borrado',
      },
    };

    if (filterType && filterType !== 'todos') {
      asistenciaWhere.tipo = filterType;
    }

    const userWhere: Prisma.UsuarioWhereInput = {};

    if (filterRole && filterRole !== 'todos') {
      if (filterRole === 'menor') {
        userWhere.dni = '00000000';
      } else if (filterRole === 'visitante') {
        userWhere.OR = [
          { dni: { startsWith: 'VISIT' } },
          { dni: 'VISIT000' }
        ];
      } else if (filterRole === 'usuario') {
        userWhere.NOT = [
          { dni: '00000000' },
          { dni: { startsWith: 'VISIT' } },
          { dni: 'VISIT000' }
        ];
      }
    }

    if (search && search.trim() !== '') {
      const searchQuery = search.trim().toLowerCase();
      userWhere.AND = [
        {
          OR: [
            { dni: { contains: searchQuery } },
            { nombre_completo: { contains: searchQuery } },
            { nombres: { contains: searchQuery } },
            { apellido_paterno: { contains: searchQuery } },
            { apellido_materno: { contains: searchQuery } }
          ]
        }
      ];
    }

    const usuarios = await this.prisma.client.usuario.findMany({
      where: userWhere,
      include: {
        asistencias: {
          where: asistenciaWhere,
          include: {
            sede: true,
            terminal: true,
          },
        },
      },
      orderBy: [
        { apellido_paterno: 'asc' },
        { apellido_materno: 'asc' },
        { nombres: 'asc' },
      ],
    });

    return usuarios.map((u) => {
      let filteredAsistencias = u.asistencias;
      if (applyDayFilter === 'true' && startDayOfWeek && endDayOfWeek) {
        const startDay = parseInt(startDayOfWeek, 10);
        const endDay = parseInt(endDayOfWeek, 10);
        filteredAsistencias = filteredAsistencias.filter((a) => {
          let day = a.fecha_hora_marca.getDay();
          if (day === 0) day = 7;
          if (startDay <= endDay) {
            return day >= startDay && day <= endDay;
          } else {
            return day >= startDay || day <= endDay;
          }
        });
      }

      const total_entradas = filteredAsistencias.filter((a) => a.tipo === 'entrada').length;
      const total_salidas = filteredAsistencias.filter((a) => a.tipo === 'salida').length;
      return {
        user_id: u.id,
        full_name: u.nombre_completo,
        total_entradas,
        total_salidas,
      };
    }).filter((u) => u.total_entradas > 0 || u.total_salidas > 0);
  }

  /**
   * Obtiene métricas estadísticas de asistencia agregadas por tipo y sede.
   */
  async getAttendanceStats(startDate: string, endDate: string) {
    const { start, end } = this.parseReportRange(startDate, endDate);
    const where = {
      fecha_hora_marca: {
        gte: start,
        lte: end,
      },
      estado_auditoria: {
        not: 'borrado',
      },
    };

    const [byType, bySede, uniqueUsers] = await Promise.all([
      this.prisma.client.asistencia.groupBy({
        by: ['tipo'],
        where,
        _count: { _all: true },
      }),
      this.prisma.client.asistencia.groupBy({
        by: ['sede_id'],
        where,
        _count: { _all: true },
      }),
      this.prisma.client.asistencia.findMany({
        where,
        distinct: ['usuario_id'],
        select: { usuario_id: true },
      }),
    ]);

    const totalMarcas = byType.reduce((sum, row) => sum + row._count._all, 0);

    return {
      startDate,
      endDate,
      total_marcas: totalMarcas,
      usuarios_con_marcas: uniqueUsers.length,
      por_tipo: byType.map((row) => ({
        tipo: row.tipo,
        total: row._count._all,
      })),
      por_sede: bySede.map((row) => ({
        sede_id: row.sede_id,
        total: row._count._all,
      })),
    };
  }

  /**
   * Genera el documento PDFKit con las tablas y matrices de marcación.
   */
  async generatePdfDocument(query: ReportQueryDto, clientRecords?: AttendanceClientRecord[]) {
    const { startDate, endDate, type, search, filterType, filterRole, applyDayFilter, startDayOfWeek, endDayOfWeek } = query;
    const doc = new PDFDocument({ margin: 28, layout: 'landscape', size: 'A4' });
    const candidates = [
      path.join(process.cwd(), 'src', 'assets', 'logo.png'),
      path.join(process.cwd(), 'apps', 'asistencia', 'api', 'src', 'assets', 'logo.png'),
      path.join(__dirname, '..', 'assets', 'logo.png'),
      path.join(__dirname, '..', '..', 'src', 'assets', 'logo.png'),
    ];
    let logoPath = '';
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        logoPath = c;
        break;
      }
    }

    const parseUserNames = (u: { apellido_paterno?: string | null; apellido_materno?: string | null; nombres?: string | null; nombre_completo?: string | null; name?: string | null; nombre?: string | null } | null | undefined): { apellidos: string; nombres: string } => {
      const p = (u?.apellido_paterno || '').trim();
      const m = (u?.apellido_materno || '').trim();
      if (p || m) {
        const apellidos = m && p ? `${m} ${p}` : (m || p);
        const nombres = (u?.nombres || '').trim();
        return { apellidos: apellidos || 'Sin Apellidos', nombres: nombres || 'Sin Nombres' };
      }
      const full = (u?.nombre_completo || u?.name || u?.nombre || '').trim();
      if (full.includes(',')) {
        const parts = full.split(',');
        return { apellidos: parts[0].trim(), nombres: parts.slice(1).join(',').trim() };
      }
      const parts = full.split(/\s+/);
      if (parts.length <= 2) {
        return { apellidos: parts[0] || '', nombres: parts.slice(1).join(' ') || '' };
      }
      return { apellidos: `${parts[0]} ${parts[1]}`, nombres: parts.slice(2).join(' ') };
    };

    let asistencias: NormalizedAttendanceReportItem[] = [];

    if (clientRecords && Array.isArray(clientRecords) && clientRecords.length > 0) {
      asistencias = clientRecords.map((r) => ({
        id_operacion_local: r.id_local || r.id,
        tipo: r.type || r.tipo || 'ENTRADA',
        fecha_hora_marca: new Date(r.registered_at || r.fecha_hora_marca || r.fecha_hora || Date.now()),
        observacion: r.observacion,
        usuario: {
          id: r.usuario_id || r.dni,
          dni: r.dni,
          nombre_completo: r.name || r.nombre,
          nombres: r.nombres || r.name || r.nombre,
          apellido_paterno: r.apellido_paterno || '',
          apellido_materno: r.apellido_materno || '',
          condicion: r.condicion || (r.dni?.startsWith('VISIT') || r.dni === 'VISIT000' ? 'VISITANTE' : (r.dni === '00000000' ? 'MENOR' : 'PERSONAL')),
          cargo: r.cargo || (r.dni?.startsWith('VISIT') || r.dni === 'VISIT000' ? 'VISITANTE' : 'COLABORADOR'),
        },
      }));
    } else {
      const { start, end } = this.parseReportRange(startDate, endDate);
      const whereClause: Prisma.AsistenciaWhereInput = {
        fecha_hora_marca: {
          gte: start,
          lte: end,
        },
        estado_auditoria: {
          not: 'borrado',
        },
      };

      if (filterType && filterType !== 'todos') {
        whereClause.tipo = filterType;
      }

      if (filterRole && filterRole !== 'todos') {
        if (filterRole === 'menor') {
          whereClause.usuario = { dni: '00000000' };
        } else if (filterRole === 'visitante') {
          whereClause.usuario = {
            OR: [
              { dni: { startsWith: 'VISIT' } },
              { dni: 'VISIT000' }
            ]
          };
        } else if (filterRole === 'usuario') {
          whereClause.usuario = {
            NOT: [
              { dni: '00000000' },
              { dni: { startsWith: 'VISIT' } },
              { dni: 'VISIT000' }
            ]
          };
        }
      }

      if (search && search.trim() !== '') {
        const searchQuery = search.trim().toLowerCase();
        if (whereClause.usuario) {
          whereClause.usuario.AND = [
            {
              OR: [
                { dni: { contains: searchQuery } },
                { nombre_completo: { contains: searchQuery } }
              ]
            }
          ];
        } else {
          whereClause.usuario = {
            OR: [
              { dni: { contains: searchQuery } },
              { nombre_completo: { contains: searchQuery } }
            ]
          };
        }
      }

      asistencias = await this.prisma.client.asistencia.findMany({
        where: whereClause,
        include: {
          usuario: true,
          sede: true,
          terminal: true,
        },
        orderBy: {
          fecha_hora_marca: 'asc',
        },
      });

      if (applyDayFilter === 'true' && startDayOfWeek && endDayOfWeek) {
        const startDay = parseInt(startDayOfWeek, 10);
        const endDay = parseInt(endDayOfWeek, 10);
        asistencias = asistencias.filter((a) => {
          let day = a.fecha_hora_marca.getDay();
          if (day === 0) day = 7;
          if (startDay <= endDay) {
            return day >= startDay && day <= endDay;
          } else {
            return day >= startDay || day <= endDay;
          }
        });
      }
    }

    if (type === 'detallado') {
      if (logoPath) {
        doc.image(logoPath, 36, 15, { width: 90 });
      }
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(15).text('REPORTE DETALLADO DE ASISTENCIA (POR SEMANAS)', 0, 18, { align: 'center' });
      doc.fontSize(8.5).font('Helvetica').fillColor('#64748B').text(`Fecha de generación: ${new Date().toLocaleString('es-PE')}`, 36, 42, { align: 'right', width: 766 });
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

      const groupedByWeek: Record<string, { label: string; records: typeof asistencias }> = {};
      for (const a of asistencias) {
        const { key, label } = getWeekInfo(a.fecha_hora_marca);
        if (!groupedByWeek[key]) {
          groupedByWeek[key] = { label, records: [] };
        }
        groupedByWeek[key].records.push(a);
      }

      let y = 70;
      let globalIndex = 1;

      const drawTableHeader = (currentY: number) => {
        doc.rect(36, currentY - 4, 766, 20).fill('#1E293B');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
        doc.text('N°', 40, currentY, { width: 28 });
        doc.text('Fecha', 70, currentY, { width: 75 });
        doc.text('DNI / ID', 147, currentY, { width: 68 });
        doc.text('Apellidos y Nombres', 217, currentY, { width: 260 });
        doc.text('Rol', 479, currentY, { width: 105 });
        doc.text('Tipo', 586, currentY, { width: 65 });
        doc.text('Hora', 653, currentY, { width: 65 });
        doc.text('Observación', 720, currentY, { width: 78 });
      };

      for (const weekData of Object.values(groupedByWeek)) {
        if (y > 480) {
          doc.addPage();
          y = 40;
        }

        doc.fillColor('#14387F').font('Helvetica-Bold').fontSize(10.5).text(`📅 ${weekData.label} (${weekData.records.length} registros)`, 36, y);
        y += 16;
        drawTableHeader(y);
        y += 20;

        let rowIndex = 0;
        for (const a of weekData.records) {
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

          let role = 'Personal / Alumno';
          if (a.usuario.dni === '00000000') {
            role = 'Menor de Edad';
          } else if (a.usuario.dni.startsWith('VISIT') || a.usuario.dni === 'VISIT000') {
            role = 'Visitante';
          }

          const fechaMarca = a.fecha_hora_marca.toLocaleDateString('es-PE', {
            timeZone: 'America/Lima',
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
          });

          const hora = a.fecha_hora_marca.toLocaleTimeString('es-PE', {
            timeZone: 'America/Lima',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

          const names = parseUserNames(a.usuario);
          const displayName = `${names.apellidos}, ${names.nombres}`;
          const cleanObs = (a.observacion || '-').replace(/[\r\n]+/g, ' ').trim();

          doc.text(String(globalIndex), 40, y, { width: 28 });
          doc.text(fechaMarca, 70, y, { width: 75 });
          doc.text(a.usuario.dni, 147, y, { width: 68 });
          doc.text(displayName, 217, y, { width: 260, ellipsis: true });
          doc.text(role, 479, y, { width: 105 });
          doc.text(a.tipo.toUpperCase(), 586, y, { width: 65 });
          doc.text(hora, 653, y, { width: 65 });
          doc.text(cleanObs, 720, y, { width: 78, ellipsis: true });

          y += 18;
          rowIndex++;
          globalIndex++;
        }
        y += 12;
      }
      return doc;
    }

    // Default / type === 'semanal' / 'resumido': REPORTE SEMANAL (MATRIZ A4 HORIZONTAL)
    const getMonday = (d: Date) => {
      const date = new Date(d);
      const day = date.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(date);
      monday.setDate(date.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);
      return monday;
    };

    const weeksMap = new Map<string, {
      monday: Date;
      sunday: Date;
      days: Array<{ dateKey: string; dayName: string; dateStr: string }>;
      users: Map<string, {
        dni: string;
        apellidos: string;
        nombres: string;
        condicion: string;
        cargo: string;
        hora_ingreso: string;
        marks: Map<string, string>;
        observaciones: string[];
      }>;
    }>();

    const startRange = new Date(startDate + 'T00:00:00');
    const endRange = new Date(endDate + 'T23:59:59');

    let iterMonday = getMonday(startRange);
    const lastMonday = getMonday(endRange);

    while (iterMonday <= lastMonday) {
      const weekKey = iterMonday.toISOString().split('T')[0];
      const sunday = new Date(iterMonday);
      sunday.setDate(iterMonday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      const days = [];
      for (let i = 0; i < 7; i++) {
        const curDay = new Date(iterMonday);
        curDay.setDate(iterMonday.getDate() + i);
        const dateKey = curDay.toISOString().split('T')[0];
        const dateStr = curDay.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit' });
        days.push({ dateKey, dayName: dayNames[i], dateStr });
      }

      weeksMap.set(weekKey, {
        monday: new Date(iterMonday),
        sunday,
        days,
        users: new Map(),
      });

      iterMonday.setDate(iterMonday.getDate() + 7);
    }

    for (const a of asistencias) {
      if (!a.usuario) continue;
      const aDate = new Date(a.fecha_hora_marca);
      const aMon = getMonday(aDate);
      const weekKey = aMon.toISOString().split('T')[0];

      let weekObj = weeksMap.get(weekKey);
      if (!weekObj) {
        const sunday = new Date(aMon);
        sunday.setDate(aMon.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        const days = [];
        for (let i = 0; i < 7; i++) {
          const curDay = new Date(aMon);
          curDay.setDate(aMon.getDate() + i);
          const dateKey = curDay.toISOString().split('T')[0];
          const dateStr = curDay.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit' });
          days.push({ dateKey, dayName: dayNames[i], dateStr });
        }
        weekObj = { monday: aMon, sunday, days, users: new Map() };
        weeksMap.set(weekKey, weekObj);
      }

      const dni = a.usuario.dni || 'SIN-DNI';
      if (!weekObj.users.has(dni)) {
        const names = parseUserNames(a.usuario);
        weekObj.users.set(dni, {
          dni,
          apellidos: names.apellidos,
          nombres: names.nombres,
          condicion: a.usuario.condicion || (dni.startsWith('VISIT') || dni === 'VISIT000' ? 'VISITANTE' : (dni === '00000000' ? 'MENOR' : 'PERSONAL')),
          cargo: a.usuario.cargo || (dni.startsWith('VISIT') || dni === 'VISIT000' ? 'VISITANTE' : 'COLABORADOR'),
          hora_ingreso: '08:00 a.m.',
          marks: new Map(),
          observaciones: [],
        });
      }

      const userEntry = weekObj.users.get(dni)!;
      const dateKey = aDate.toISOString().split('T')[0];
      const timeStr = aDate.toLocaleTimeString('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).toLowerCase();

      if (a.tipo === 'entrada' || !userEntry.marks.has(dateKey)) {
        userEntry.marks.set(dateKey, timeStr);
      }

      if (a.observacion) {
        const cleanObs = a.observacion.replace(/[\r\n]+/g, ' ').trim();
        if (cleanObs && !userEntry.observaciones.includes(cleanObs)) {
          userEntry.observaciones.push(cleanObs);
        }
      }
    }

    let weekIndex = 0;
    for (const [, weekData] of weeksMap) {
      if (weekIndex > 0) {
        doc.addPage();
      }

      if (logoPath) {
        doc.image(logoPath, 28, 12, { width: 80 });
      }

      const monStr = weekData.monday.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' });
      const sunStr = weekData.sunday.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' });

      doc.fillColor('#14387F').font('Helvetica-Bold').fontSize(14).text('RELACIÓN DE ASISTENCIA PERSONAL - INFOUNSA 2026', 0, 14, { align: 'center' });
      doc.fillColor('#1E3A8A').font('Helvetica-Bold').fontSize(10).text(`SEMANA: DEL ${monStr.toUpperCase()} AL ${sunStr.toUpperCase()}`, 0, 31, { align: 'center' });
      doc.fontSize(8).font('Helvetica').fillColor('#64748B').text(`Fecha de emisión: ${new Date().toLocaleString('es-PE')}`, 28, 44, { align: 'right', width: 785 });
      doc.moveTo(28, 54).lineTo(813, 54).strokeColor('#CBD5E1').lineWidth(0.75).stroke();

      const drawWeekTableHeader = (currentY: number) => {
        const headerHeight = 24;
        doc.rect(28, currentY, 453, headerHeight).fill('#14387F');
        doc.rect(481, currentY, 238, 12).fill('#1E3A8A');
        doc.rect(481, currentY + 12, 238, 12).fill('#14387F');
        doc.rect(719, currentY, 94, headerHeight).fill('#14387F');
        doc.rect(28, currentY, 785, headerHeight).strokeColor('#0F172A').lineWidth(0.5).stroke();

        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
        doc.text('Nº', 28, currentY + 8, { width: 22, align: 'center' });
        doc.text('APELLIDOS', 52, currentY + 8, { width: 128, align: 'left' });
        doc.text('NOMBRES', 184, currentY + 8, { width: 106, align: 'left' });
        doc.text('CONDICIÓN', 292, currentY + 8, { width: 63, align: 'center' });
        doc.text('CARGO', 357, currentY + 8, { width: 68, align: 'left' });
        doc.text('HORA INGRESO', 427, currentY + 8, { width: 54, align: 'center' });
        doc.fontSize(7).text('FECHAS DE REGISTRO', 481, currentY + 3, { width: 238, align: 'center' });

        weekData.days.forEach((dh, idx) => {
          const dayX = 481 + idx * 34;
          if (idx > 0) {
            doc.moveTo(dayX, currentY + 12).lineTo(dayX, currentY + 24).strokeColor('#334155').lineWidth(0.5).stroke();
          }
          doc.fontSize(6.5).text(`${dh.dayName} ${dh.dateStr}`, dayX, currentY + 14, { width: 34, align: 'center' });
        });

        doc.fontSize(7.5).text('OBSERVACIONES', 721, currentY + 8, { width: 90, align: 'left' });
      };

      let y = 60;
      drawWeekTableHeader(y);
      y += 24;

      const userList = Array.from(weekData.users.values());

      if (userList.length === 0) {
        doc.rect(28, y, 785, 24).fill('#F8FAFC');
        doc.rect(28, y, 785, 24).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
        doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(8.5).text('Sin marcaciones registradas en esta semana.', 28, y + 7, { width: 785, align: 'center' });
        y += 28;
      } else {
        let userIndex = 1;
        for (const u of userList) {
          if (y > 540) {
            doc.addPage();
            y = 28;
            drawWeekTableHeader(y);
            y += 24;
          }

          const rowHeight = 18;
          const isEven = userIndex % 2 === 0;

          if (isEven) {
            doc.rect(28, y, 785, rowHeight).fill('#F8FAFC');
          }

          doc.rect(28, y, 785, rowHeight).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
          const colDividers = [50, 182, 292, 355, 427, 481, 515, 549, 583, 617, 651, 685, 719];
          colDividers.forEach((xPos) => {
            doc.moveTo(xPos, y).lineTo(xPos, y + rowHeight).strokeColor('#E2E8F0').lineWidth(0.5).stroke();
          });

          doc.fillColor('#0F172A').font('Helvetica').fontSize(7);
          doc.text(String(userIndex), 28, y + 5, { width: 22, align: 'center' });
          doc.text(u.apellidos, 52, y + 5, { width: 128, ellipsis: true });
          doc.text(u.nombres, 184, y + 5, { width: 106, ellipsis: true });
          doc.text(u.condicion, 292, y + 5, { width: 61, align: 'center', ellipsis: true });
          doc.text(u.cargo, 357, y + 5, { width: 68, ellipsis: true });
          doc.text(u.hora_ingreso, 427, y + 5, { width: 54, align: 'center' });

          weekData.days.forEach((dh, idx) => {
            const dayX = 481 + idx * 34;
            const mark = u.marks.get(dh.dateKey);
            if (mark) {
              doc.fillColor('#1E3A8A').font('Helvetica-Bold').fontSize(6.5);
              doc.text(mark, dayX, y + 5, { width: 34, align: 'center' });
            } else {
              doc.fillColor('#94A3B8').font('Helvetica').fontSize(7);
              doc.text('-', dayX, y + 5, { width: 34, align: 'center' });
            }
          });

          const obsText = u.observaciones.length > 0 ? Array.from(new Set(u.observaciones)).join(', ') : '-';
          doc.fillColor(obsText !== '-' ? '#334155' : '#94A3B8').font('Helvetica').fontSize(6.5);
          doc.text(obsText, 721, y + 5, { width: 90, ellipsis: true });

          y += rowHeight;
          userIndex++;
        }
      }

      weekIndex++;
    }

    return doc;
  }

  /**
   * Genera el buffer con el stream completo del reporte en PDF.
   */
  async generatePdfStream(query: ReportQueryDto, clientRecords?: AttendanceClientRecord[]) {
    const doc = await this.generatePdfDocument(query, clientRecords);
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.end();

    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    return {
      contentType: 'application/pdf',
      data: buffer,
    };
  }

  /**
   * Exporta reporte en formato PDF devolviendo directamente el Buffer binario.
   */
  async exportDailyReportPdf(query: ReportQueryDto, clientRecords?: AttendanceClientRecord[]): Promise<Buffer> {
    const stream = await this.generatePdfStream(query, clientRecords);
    return stream.data;
  }

  /**
   * Genera el reporte de asistencia en Excel (formato pivotado semanal).
   */
  async generateExcelReport(
    query: ReportQueryDto,
    resOrRecords?: Response | AttendanceClientRecord[],
    clientRecords?: AttendanceClientRecord[],
  ): Promise<Buffer> {
    let records: AttendanceClientRecord[] | undefined;
    let legacyRes: Response | undefined;

    if (resOrRecords && typeof (resOrRecords as Response).setHeader === 'function') {
      legacyRes = resOrRecords as Response;
      records = clientRecords;
    } else if (Array.isArray(resOrRecords)) {
      records = resOrRecords;
    } else {
      records = clientRecords;
    }

    const { startDate, endDate, search, filterType, filterRole, applyDayFilter, startDayOfWeek, endDayOfWeek } = query;
    let asistencias: NormalizedAttendanceReportItem[] = [];

    if (records && Array.isArray(records) && records.length > 0) {
      asistencias = records.map((r) => ({
        id_operacion_local: r.id_local || r.id,
        tipo: r.type || r.tipo || 'ENTRADA',
        fecha_hora_marca: new Date(r.registered_at || r.fecha_hora_marca || r.fecha_hora || Date.now()),
        observacion: r.observacion,
        usuario: {
          id: r.usuario_id || r.dni,
          dni: r.dni,
          nombre_completo: r.name || r.nombre,
          nombres: r.name || r.nombre,
          apellido_paterno: '',
          apellido_materno: '',
        },
      }));
    } else {
      const { start, end } = this.parseReportRange(startDate, endDate);

      const whereClause: Prisma.AsistenciaWhereInput = {
        fecha_hora_marca: {
          gte: start,
          lte: end,
        },
        estado_auditoria: {
          not: 'borrado',
        },
      };

      if (filterType && filterType !== 'todos') {
        whereClause.tipo = filterType;
      }

      if (filterRole && filterRole !== 'todos') {
        if (filterRole === 'menor') {
          whereClause.usuario = { dni: '00000000' };
        } else if (filterRole === 'visitante') {
          whereClause.usuario = {
            OR: [
              { dni: { startsWith: 'VISIT' } },
              { dni: 'VISIT000' }
            ]
          };
        } else if (filterRole === 'usuario') {
          whereClause.usuario = {
            NOT: [
              { dni: '00000000' },
              { dni: { startsWith: 'VISIT' } },
              { dni: 'VISIT000' }
            ]
          };
        }
      }

      if (search && search.trim() !== '') {
        const searchQuery = search.trim().toLowerCase();
        if (whereClause.usuario) {
          whereClause.usuario.AND = [
            {
              OR: [
                { dni: { contains: searchQuery } },
                { nombre_completo: { contains: searchQuery } }
              ]
            }
          ];
        } else {
          whereClause.usuario = {
            OR: [
              { dni: { contains: searchQuery } },
              { nombre_completo: { contains: searchQuery } }
            ]
          };
        }
      }

      asistencias = await this.prisma.client.asistencia.findMany({
        where: whereClause,
        include: {
          usuario: true,
        },
        orderBy: {
          fecha_hora_marca: 'asc',
        },
      });

      if (applyDayFilter === 'true' && startDayOfWeek && endDayOfWeek) {
        const startDay = parseInt(startDayOfWeek, 10);
        const endDay = parseInt(endDayOfWeek, 10);
        asistencias = asistencias.filter((a) => {
          let day = a.fecha_hora_marca.getDay();
          if (day === 0) day = 7;
          if (startDay <= endDay) {
            return day >= startDay && day <= endDay;
          } else {
            return day >= startDay || day <= endDay;
          }
        });
      }
    }

    const buffer = await generatePivotedExcelReport(asistencias as any, startDate, endDate, legacyRes);
    return buffer;
  }

  /**
   * Genera reporte Excel pivotado por semana.
   */
  async generatePivotedExcelReport(
    asistencias: NormalizedAttendanceReportItem[] | unknown[],
    startDateStr: string,
    endDateStr: string,
    res?: Response,
  ): Promise<Buffer> {
    return generatePivotedExcelReport(asistencias as any, startDateStr, endDateStr, res);
  }

  /**
   * Genera el reporte de auditoría de asistencia en Excel (formato plano con estados).
   */
  async generateAuditExcelReport(query: ReportQueryDto, res?: Response): Promise<Buffer> {
    const { startDate, endDate, search, filterType, filterRole, applyDayFilter, startDayOfWeek, endDayOfWeek } = query;
    const { start, end } = this.parseReportRange(startDate, endDate);

    const whereClause: Prisma.AsistenciaWhereInput = {
      fecha_hora_marca: {
        gte: start,
        lte: end,
      },
    };

    if (filterType && filterType !== 'todos') {
      whereClause.tipo = filterType;
    }

    if (filterRole && filterRole !== 'todos') {
      if (filterRole === 'menor') {
        whereClause.usuario = { dni: '00000000' };
      } else if (filterRole === 'visitante') {
        whereClause.usuario = {
          OR: [
            { dni: { startsWith: 'VISIT' } },
            { dni: 'VISIT000' }
          ]
        };
      } else if (filterRole === 'usuario') {
        whereClause.usuario = {
          NOT: [
            { dni: '00000000' },
            { dni: { startsWith: 'VISIT' } },
            { dni: 'VISIT000' }
          ]
        };
      }
    }

    if (search && search.trim() !== '') {
      const searchQuery = search.trim().toLowerCase();
      if (whereClause.usuario) {
        whereClause.usuario.AND = [
          {
            OR: [
              { dni: { contains: searchQuery } },
              { nombre_completo: { contains: searchQuery } }
            ]
          }
        ];
      } else {
        whereClause.usuario = {
          OR: [
            { dni: { contains: searchQuery } },
            { nombre_completo: { contains: searchQuery } }
          ]
        };
      }
    }

    let asistencias = await this.prisma.client.asistencia.findMany({
      where: whereClause,
      include: {
        usuario: true,
      },
      orderBy: {
        fecha_hora_marca: 'asc',
      },
    });

    if (applyDayFilter === 'true' && startDayOfWeek && endDayOfWeek) {
      const startDay = parseInt(startDayOfWeek, 10);
      const endDay = parseInt(endDayOfWeek, 10);
      asistencias = asistencias.filter((a) => {
        let day = a.fecha_hora_marca.getDay();
        if (day === 0) day = 7;
        if (startDay <= endDay) {
          return day >= startDay && day <= endDay;
        } else {
          return day >= startDay || day <= endDay;
        }
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Auditoría Asistencia');

    // Title Block
    worksheet.mergeCells('A2:H2');
    const titleCell = worksheet.getCell('A2');
    titleCell.value = 'REPORTE DE AUDITORÍA DE CONTROL DE PERSONAL INFOUNSA';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '14387F' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(2).height = 35;

    // Headers
    const headers = [
      'Nº', 'DNI', 'APELLIDOS Y NOMBRES', 'CONDICIÓN', 'CARGO', 'HORA REGISTRO', 'TIPO', 'ESTADO AUDITORÍA'
    ];
    worksheet.getRow(4).values = headers;
    worksheet.getRow(4).height = 25;
    
    // Header styling
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A8A' } };
    const headerFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    const centerAlign = { vertical: 'middle', horizontal: 'center' };

    for (let col = 1; col <= 8; col++) {
      const cell = worksheet.getCell(4, col);
      cell.fill = headerFill as any;
      cell.font = headerFont;
      cell.alignment = centerAlign as any;
    }

    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'CBD5E1' } },
      left: { style: 'thin', color: { argb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
      right: { style: 'thin', color: { argb: 'CBD5E1' } }
    };

    asistencias.forEach((a, idx) => {
      const rowValues = [
        idx + 1,
        a.usuario.dni,
        a.usuario.nombre_completo,
        a.usuario.condicion || (a.usuario.dni.startsWith('VISIT') || a.usuario.dni === 'VISIT000' ? 'VISITANTE' : 'PERSONAL'),
        a.usuario.cargo || (a.usuario.dni.startsWith('VISIT') || a.usuario.dni === 'VISIT000' ? 'VISITANTE' : 'COLABORADOR'),
        a.fecha_hora_marca.toLocaleString('es-PE', { timeZone: 'America/Lima' }),
        a.tipo.toUpperCase(),
        a.estado_auditoria.toUpperCase()
      ];

      const row = worksheet.addRow(rowValues);
      row.height = 20;

      // Style row cells
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = borderStyle;
        cell.font = { name: 'Arial', size: 9 };
        if (colNumber === 8) {
          const status = cell.value?.toString().toLowerCase();
          if (status === 'borrado') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FCA5A5' } };
            cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '991B1B' } };
          } else if (status === 'editado') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF08A' } };
            cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '854D0E' } };
          } else if (status === 'nuevo') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'BBF7D0' } };
            cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '166534' } };
          }
        }
      });
    });

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      let maxLen = 10;
      column.eachCell!({ includeEmpty: true }, (cell) => {
        const valStr = cell.value ? cell.value.toString() : '';
        if (valStr.length > maxLen) maxLen = valStr.length;
      });
      column.width = Math.min(45, maxLen + 3);
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (res) {
      res.setHeader?.('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader?.('Content-Disposition', 'attachment; filename=reporte-auditoria-asistencia.xlsx');
      res.send?.(buffer);
    }
    return buffer;
  }
}
