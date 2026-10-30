import { Controller, Get, Post, Body, UseInterceptors, UploadedFile, BadRequestException, Res, InternalServerErrorException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { UsersService } from './users.service';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import { Roles } from '../../common/auth/roles.decorator';
import * as ExcelJS from 'exceljs';

export interface UserPreviewRecord {
  row: number;
  dni: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  nombre_completo: string;
  estado: boolean;
  condicion: string | null;
  cargo: string | null;
  hasError: boolean;
  hasWarning: boolean;
}

export interface UserImportError {
  row: number;
  col: number;
  columnName: string;
  value: string;
  severity: 'CRITICAL' | 'WARNING';
  message: string;
}

export interface ImportUserItemDto {
  dni: string;
  nombres?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  nombre_completo?: string;
  estado: boolean;
  condicion?: string | null;
  cargo?: string | null;
}

@Controller('users')
@Roles('administrador')
export class UsersImportController {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('template')
  async downloadTemplate(@Res() res: Response) {
    try {
      const dbUsuarios = await this.prisma.client.usuario.findMany({
        select: {
          cargo: true,
          condicion: true,
        },
      });

    const cargosExistentes = Array.from(
      new Set(dbUsuarios.map((u) => u.cargo?.trim()).filter(Boolean))
    ) as string[];

    const condicionesExistentes = Array.from(
      new Set(dbUsuarios.map((u) => u.condicion?.trim()).filter(Boolean))
    ) as string[];

    const cargosFinales = cargosExistentes.length > 0 ? cargosExistentes : ['DOCENTE', 'ADMINISTRATIVO', 'JEFE', 'COORDINADOR'];
    const condicionesFinales = condicionesExistentes.length > 0 ? condicionesExistentes : ['NOMBRADO', 'CONTRATADO', 'VISITANTE', 'TERCERO'];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Plantilla Personal');

    worksheet.columns = [
      { header: 'DNI', key: 'dni', width: 15 },
      { header: 'Nombres', key: 'nombres', width: 25 },
      { header: 'Apellido Paterno', key: 'apellido_paterno', width: 25 },
      { header: 'Apellido Materno', key: 'apellido_materno', width: 25 },
      { header: 'Estado', key: 'estado', width: 15 },
      { header: 'Condición Laboral', key: 'condicion', width: 25 },
      { header: 'Cargo', key: 'cargo', width: 25 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1F4E78' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    headerRow.height = 25;

    worksheet.addRow(['12345678', 'Juan Carlos', 'Perez', 'Gomez', 'ACTIVO', condicionesFinales[0], cargosFinales[0]]);
    worksheet.addRow(['87654321', 'Maria Julia', 'Rodriguez', 'Silva', 'INACTIVO', condicionesFinales[1] || 'CONTRATADO', cargosFinales[1] || 'ADMINISTRATIVO']);

    for (let r = 2; r <= 500; r++) {
      worksheet.getCell(r, 5).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"ACTIVO,INACTIVO"'],
        showErrorMessage: true,
        errorTitle: 'Estado inválido',
        error: 'Seleccione un estado de la lista (ACTIVO o INACTIVO)',
      };

      worksheet.getCell(r, 6).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${condicionesFinales.map(c => c.replace(/"/g, '""')).join(',')}"`],
        showErrorMessage: false,
      };

      worksheet.getCell(r, 7).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${cargosFinales.map(c => c.replace(/"/g, '""')).join(',')}"`],
        showErrorMessage: false,
      };
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla_personal.xlsx');

    await workbook.xlsx.write(res);
    res.end();
    } catch (error: unknown) {
      console.error('Error generando plantilla excel:', error);
      const msg = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException('No se pudo generar la plantilla: ' + msg);
    }
  }

  @Post('preview-lote')
  @UseInterceptors(FileInterceptor('file'))
  async previewLote(@UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file || !file.buffer) {
      throw new BadRequestException('El archivo Excel es requerido.');
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as any);
    } catch (e) {
      throw new BadRequestException('No se pudo leer el archivo Excel. Asegúrese de subir un formato .xlsx válido.');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('El archivo Excel no contiene ninguna hoja.');
    }

    const previewData: UserPreviewRecord[] = [];
    const errors: UserImportError[] = [];
    let totalRows = 0;

    const dbUsers = await this.prisma.client.usuario.findMany({
      select: { dni: true, nombre_completo: true },
    });
    const dbDnis = new Set(dbUsers.map((u) => u.dni));

    const fileDnis = new Set<string>();

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const col1 = row.getCell(1).value?.toString().trim() || '';
      const col2 = row.getCell(2).value?.toString().trim() || '';
      const col3 = row.getCell(3).value?.toString().trim() || '';
      const col4 = row.getCell(4).value?.toString().trim() || '';
      const col5 = row.getCell(5).value?.toString().trim() || '';
      const col6 = row.getCell(6).value?.toString().trim() || '';
      const col7 = row.getCell(7).value?.toString().trim() || '';

      if (!col1 && !col2 && !col3 && !col4 && !col5 && !col6 && !col7) {
        return;
      }

      // Check format: 7 columns (new format) vs 5 columns (legacy format)
      const isNewFormat = col5.toUpperCase() === 'ACTIVO' || col5.toUpperCase() === 'INACTIVO' || !!col6 || !!col7;

      let dniVal = col1;
      let nombresVal = '';
      let apellidoPaternoVal = '';
      let apellidoMaternoVal = '';
      let estadoVal = '';
      let condicionVal = '';
      let cargoVal = '';

      if (isNewFormat) {
        nombresVal = col2;
        apellidoPaternoVal = col3;
        apellidoMaternoVal = col4;
        estadoVal = col5.toUpperCase();
        condicionVal = col6;
        cargoVal = col7;
      } else {
        // Legacy 5-column format: DNI, Nombre Completo, Estado, Condición, Cargo
        const full = col2;
        const parts = full.split(/\s+/);
        nombresVal = parts.slice(2).join(' ') || parts[0] || '';
        apellidoPaternoVal = parts[0] || '';
        apellidoMaternoVal = parts[1] || '';
        estadoVal = col3.toUpperCase();
        condicionVal = col4;
        cargoVal = col5;
      }

      if (dniVal === '12345678' && nombresVal === 'Juan Carlos' && apellidoPaternoVal === 'Perez') return;
      if (dniVal === '12345678' && col2 === 'Perez Gomez Juan Carlos') return;

      totalRows++;

      const surnames = `${apellidoPaternoVal} ${apellidoMaternoVal}`.trim();
      const nombreCompleto = surnames ? `${surnames}, ${nombresVal}`.trim() : nombresVal;

      const record: UserPreviewRecord = {
        row: rowNumber,
        dni: dniVal,
        nombres: nombresVal,
        apellido_paterno: apellidoPaternoVal,
        apellido_materno: apellidoMaternoVal,
        nombre_completo: nombreCompleto,
        estado: estadoVal === 'ACTIVO',
        condicion: condicionVal || null,
        cargo: cargoVal || null,
        hasError: false,
        hasWarning: false,
      };

      if (!dniVal) {
        errors.push({
          row: rowNumber,
          col: 1,
          columnName: 'DNI',
          value: dniVal,
          severity: 'CRITICAL',
          message: 'El DNI es obligatorio.',
        });
        record.hasError = true;
      } else if (!/^\d{8,9}$/.test(dniVal)) {
        errors.push({
          row: rowNumber,
          col: 1,
          columnName: 'DNI',
          value: dniVal,
          severity: 'CRITICAL',
          message: 'El DNI debe ser numérico y contener 8 o 9 dígitos.',
        });
        record.hasError = true;
      }

      if (dniVal && fileDnis.has(dniVal)) {
        errors.push({
          row: rowNumber,
          col: 1,
          columnName: 'DNI',
          value: dniVal,
          severity: 'CRITICAL',
          message: 'Este DNI está duplicado dentro del mismo archivo Excel.',
        });
        record.hasError = true;
      } else if (dniVal) {
        fileDnis.add(dniVal);
      }

      if (!nombresVal && !apellidoPaternoVal) {
        errors.push({
          row: rowNumber,
          col: 2,
          columnName: 'Nombres',
          value: nombresVal,
          severity: 'CRITICAL',
          message: 'Los Nombres y Apellidos son obligatorios.',
        });
        record.hasError = true;
      }

      if (!estadoVal) {
        errors.push({
          row: rowNumber,
          col: isNewFormat ? 5 : 3,
          columnName: 'Estado',
          value: estadoVal,
          severity: 'CRITICAL',
          message: 'El Estado es obligatorio (ACTIVO/INACTIVO).',
        });
        record.hasError = true;
      } else if (estadoVal !== 'ACTIVO' && estadoVal !== 'INACTIVO') {
        errors.push({
          row: rowNumber,
          col: isNewFormat ? 5 : 3,
          columnName: 'Estado',
          value: estadoVal,
          severity: 'CRITICAL',
          message: 'El Estado debe ser exactamente ACTIVO o INACTIVO.',
        });
        record.hasError = true;
      }

      if (dniVal && dbDnis.has(dniVal) && !record.hasError) {
        errors.push({
          row: rowNumber,
          col: 1,
          columnName: 'DNI',
          value: dniVal,
          severity: 'WARNING',
          message: 'El usuario ya existe en la base de datos. Sus datos serán actualizados.',
        });
        record.hasWarning = true;
      }

      previewData.push(record);
    });

    return {
      preview: previewData,
      totalRows,
      errors,
      isValid: errors.filter((e) => e.severity === 'CRITICAL').length === 0,
    };
  }

  @Post('import-lote')
  async importLote(@Body() body: { users: ImportUserItemDto[] }) {
    const { users } = body;
    if (!users || !Array.isArray(users)) {
      throw new BadRequestException('Se requiere una lista de usuarios válidos para importar.');
    }

    let insertados = 0;
    let actualizados = 0;

    await this.prisma.client.$transaction(async (tx) => {
      for (const u of users) {
        const idGenerado = `usr-${u.dni}`;

        const usuarioExistente = await tx.usuario.findUnique({
          where: { dni: u.dni },
        });

        await tx.usuario.upsert({
          where: { dni: u.dni },
          update: {
            nombres: u.nombres || '',
            apellido_paterno: u.apellido_paterno || '',
            apellido_materno: u.apellido_materno || '',
            nombre_completo: u.nombre_completo || `${u.apellido_paterno || ''} ${u.apellido_materno || ''}, ${u.nombres || ''}`.trim(),
            estado: u.estado,
            condicion: u.condicion || null,
            cargo: u.cargo || null,
          },
          create: {
            id: idGenerado,
            dni: u.dni,
            nombres: u.nombres || '',
            apellido_paterno: u.apellido_paterno || '',
            apellido_materno: u.apellido_materno || '',
            nombre_completo: u.nombre_completo || `${u.apellido_paterno || ''} ${u.apellido_materno || ''}, ${u.nombres || ''}`.trim(),
            estado: u.estado,
            condicion: u.condicion || null,
            cargo: u.cargo || null,
          },
        });

        if (usuarioExistente) {
          actualizados++;
        } else {
          insertados++;
        }
      }
    });

    return {
      success: true,
      stats: {
        total: users.length,
        insertados,
        actualizados,
      },
    };
  }
}
