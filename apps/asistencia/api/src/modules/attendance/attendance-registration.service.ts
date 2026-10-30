import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import * as crypto from 'crypto';

export interface RegisterAttendanceInput {
  usuario_id: string;
  terminal_id: string;
  sede_id: string;
  fecha_hora_marca: string;
  id_operacion_local: string;
  tipo?: string;
  observacion?: string;
}

export interface ManualLogInput {
  dni: string;
  tipo?: string;
  fecha_hora_marca: string;
  observacion?: string;
  terminal_id?: string;
  sede_id?: string;
}

export interface VisitorMarkInput {
  dni?: string;
  nombre: string;
  motivo?: string;
  observacion?: string;
  terminal_id: string;
  sede_id: string;
  tipo?: string;
  fecha_hora_marca?: string;
  id_operacion_local?: string;
}

export interface UpdateAttendanceLogInput {
  tipo?: string;
  fecha_hora_marca?: string | Date;
  observacion?: string | null;
  estado_auditoria?: string;
  [key: string]: unknown;
}

@Injectable()
export class AttendanceRegistrationService {
  private readonly logger = new Logger(AttendanceRegistrationService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Valida sintácticamente un código de barras o DNI ingresado (manual o lector).
   */
  validateBarcodeOrDni(input: string): {
    isValid: boolean;
    type: 'dni' | 'barcode' | 'visitor' | 'minor' | 'invalid';
    sanitized: string;
    errorMessage?: string;
  } {
    if (!input || typeof input !== 'string') {
      return { isValid: false, type: 'invalid', sanitized: '', errorMessage: 'Código o DNI no proporcionado' };
    }

    const sanitized = input.trim();

    if (sanitized === '00000000') {
      return { isValid: true, type: 'minor', sanitized };
    }

    if (sanitized.toUpperCase().startsWith('VISIT') || sanitized.toUpperCase() === 'VISIT000') {
      return { isValid: true, type: 'visitor', sanitized: sanitized.toUpperCase() };
    }

    // DNI estándar de 8 dígitos numéricos
    if (/^\d{8}$/.test(sanitized)) {
      return { isValid: true, type: 'dni', sanitized };
    }

    // Código de barras (ej. Code128, Code39 o formato institucional alfanumérico >= 6 chars)
    if (/^[A-Za-z0-9\-_]{6,30}$/.test(sanitized)) {
      return { isValid: true, type: 'barcode', sanitized };
    }

    return {
      isValid: false,
      type: 'invalid',
      sanitized,
      errorMessage: 'El formato de DNI o código de barras no es válido (se esperan 8 dígitos numéricos o código válido)',
    };
  }

  /**
   * Construye una observación descriptiva para visitantes.
   */
  buildVisitorObservation(data: {
    visitante_nombre?: string | null;
    visitante_motivo?: string | null;
    visitante_observacion?: string | null;
    observacion?: string | null;
  }): string | null {
    const parts = [
      data.visitante_nombre ? `Visitante: ${data.visitante_nombre}` : null,
      data.visitante_motivo ? `Motivo: ${data.visitante_motivo}` : null,
      data.visitante_observacion ? `Obs: ${data.visitante_observacion}` : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(' | ');
    }

    return data.observacion ?? null;
  }

  /**
   * Registra una marcación individual desde un cliente autorizado.
   */
  async register(data: RegisterAttendanceInput) {
    const { usuario_id, terminal_id, sede_id, fecha_hora_marca, id_operacion_local, tipo, observacion } = data;

    if (id_operacion_local) {
      const existing = await this.prisma.client.asistencia.findUnique({
        where: { id_operacion_local },
      });
      if (existing) {
        return { ...existing, duplicated: true };
      }
    }

    const sede = await this.prisma.client.sede.findUnique({ where: { id: sede_id } });
    if (!sede) {
      throw new BadRequestException(`La sede con ID ${sede_id} no existe.`);
    }

    const terminal = await this.prisma.client.terminal.findUnique({ where: { id: terminal_id } });
    if (!terminal || terminal.sede_id !== sede_id) {
      throw new BadRequestException('El terminal no esta registrado o no pertenece a la sede indicada.');
    }

    const usuario = await this.prisma.client.usuario.findUnique({ where: { id: usuario_id } });
    if (!usuario) {
      throw new BadRequestException(`El usuario con ID ${usuario_id} no se encuentra registrado.`);
    }

    return this.prisma.client.asistencia.create({
      data: {
        id_operacion_local,
        usuario_id,
        terminal_id,
        sede_id,
        tipo: tipo ?? 'entrada',
        fecha_hora_marca: new Date(fecha_hora_marca),
        observacion,
      },
    });
  }

  /**
   * Registra una marcación para un visitante generando/asociando el registro correspondiente.
   */
  async registerVisitor(data: VisitorMarkInput) {
    const {
      dni,
      nombre,
      motivo,
      observacion,
      terminal_id,
      sede_id,
      tipo = 'entrada',
      fecha_hora_marca = new Date().toISOString(),
      id_operacion_local = `visit-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString()}`,
    } = data;

    if (!nombre || nombre.trim().length < 3) {
      throw new BadRequestException('El nombre del visitante debe tener al menos 3 caracteres.');
    }

    const targetDni = dni?.trim() || 'VISIT000';
    let visitorUser = await this.prisma.client.usuario.findFirst({
      where: {
        OR: [
          { dni: targetDni },
          { id: `usr-${targetDni}` }
        ]
      }
    });

    if (!visitorUser) {
      visitorUser = await this.prisma.client.usuario.create({
        data: {
          id: `usr-${targetDni}`,
          dni: targetDni,
          nombre_completo: `VISITANTE - ${nombre.trim().toUpperCase()}`,
          estado: true,
        }
      });
    }

    const obsFinal = this.buildVisitorObservation({
      visitante_nombre: nombre,
      visitante_motivo: motivo,
      visitante_observacion: observacion,
    });

    return this.register({
      usuario_id: visitorUser.id,
      terminal_id,
      sede_id,
      fecha_hora_marca,
      id_operacion_local,
      tipo,
      observacion: obsFinal ?? undefined,
    });
  }

  /**
   * Actualiza una marcación de asistencia existente (edición administrativa).
   */
  async updateLog(id: string, body: UpdateAttendanceLogInput) {
    const existing = await this.prisma.client.asistencia.findFirst({
      where: {
        OR: [
          { id },
          { id_operacion_local: id }
        ]
      }
    });

    if (!existing) {
      throw new BadRequestException('El registro de asistencia no existe');
    }

    return this.prisma.client.asistencia.update({
      where: { id: existing.id },
      data: {
        tipo: body.tipo ?? existing.tipo,
        fecha_hora_marca: body.fecha_hora_marca ? new Date(body.fecha_hora_marca) : existing.fecha_hora_marca,
        observacion: body.observacion ?? existing.observacion,
        estado_auditoria: body.estado_auditoria ?? 'editado',
      },
    });
  }

  /**
   * Elimina lógicamente una marcación de asistencia (soft delete).
   */
  async deleteLog(id: string) {
    const existing = await this.prisma.client.asistencia.findFirst({
      where: {
        OR: [
          { id },
          { id_operacion_local: id }
        ]
      }
    });

    if (!existing) {
      throw new BadRequestException('El registro de asistencia no existe');
    }

    return this.prisma.client.asistencia.update({
      where: { id: existing.id },
      data: {
        estado_auditoria: 'borrado',
      },
    });
  }

  /**
   * Crea una marcación de asistencia manual por parte de un administrador.
   */
  async createManualLog(body: ManualLogInput) {
    const { dni, tipo, fecha_hora_marca, observacion, terminal_id, sede_id } = body;

    const validation = this.validateBarcodeOrDni(dni);
    if (!validation.isValid) {
      throw new BadRequestException(validation.errorMessage || 'DNI o código inválido');
    }

    const usuario = await this.prisma.client.usuario.findUnique({
      where: { dni },
    });

    if (!usuario) {
      throw new BadRequestException(`El usuario con DNI ${dni} no existe en el sistema`);
    }

    return this.prisma.client.asistencia.create({
      data: {
        id_operacion_local: `manual-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString()}`,
        usuario_id: usuario.id,
        terminal_id: terminal_id || 'TERM-001',
        sede_id: sede_id || '84c8a8ca-8ea4-41e9-add6-2b077bcd701a',
        tipo: tipo || 'entrada',
        fecha_hora_marca: new Date(fecha_hora_marca),
        observacion: observacion || 'Ingreso manual por administrador',
        estado_auditoria: 'nuevo',
      },
    });
  }
}
