import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import {
  executeTransactionWithRetry,
  isRetryableTransactionError,
  TransactionRetryOptions,
} from '../../common/database/transaction-retry.helper';
import { SyncAttendanceDto } from './dto/sync-attendance.dto';

@Injectable()
export class AttendanceSyncService {
  private readonly logger = new Logger(AttendanceSyncService.name);
  public readonly maxTransactionRetries = 3;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Determina si un error transaccional corresponde a una colisión temporal de base de datos
   * (P2034, ER_LOCK_DEADLOCK, 1213, 1205, ER_LOCK_WAIT_TIMEOUT) y es recuperable.
   */
  public isRetryableTransactionError(error: unknown): boolean {
    return isRetryableTransactionError(error);
  }

  /**
   * Ejecuta un callback dentro de una transacción de base de datos con reintentos configurables
   * y retroceso exponencial con jitter aleatorio para prevenir tormentas de reconexión.
   */
  public async executeTransaction<T>(
    callback: (tx: any) => Promise<T>,
    options?: TransactionRetryOptions,
  ): Promise<T> {
    return executeTransactionWithRetry(
      (cb, opts) => this.prisma.client.$transaction(cb as any, opts as any) as any,
      callback,
      {
        onRetry: (attempt, maxRetries, error, delayMs) => {
          const err = error as { code?: string; errno?: number; message?: string } | undefined;
          this.logger.warn(
            `Transacción de asistencia falló por contención (${err?.code || err?.errno || err?.message}). Reintento ${attempt + 1}/${maxRetries} tras ${delayMs}ms...`,
          );
        },
        ...options,
      },
    );
  }

  /**
   * Helper para construir la observación de visitantes a partir de los campos del DTO.
   */
  public buildVisitorObservation(registro: SyncAttendanceDto['registros'][number]): string | null {
    const parts = [
      registro.visitante_nombre ? `Visitante: ${registro.visitante_nombre}` : null,
      registro.visitante_motivo ? `Motivo: ${registro.visitante_motivo}` : null,
      registro.visitante_observacion ? `Obs: ${registro.visitante_observacion}` : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(' | ');
    }

    return registro.observacion ?? null;
  }

  /**
   * Procesa de forma transaccional un lote de marcaciones offline sincronizadas hacia la base online.
   */
  async syncLote(payload: SyncAttendanceDto, options?: TransactionRetryOptions) {
    return this.executeTransaction(async (tx) => {
      let insertados = 0;
      let omitidosPorDuplicado = 0;
      const processedLocalIds: string[] = [];

      // Auto-registro y actualización de sede y terminal conectados
      let sedeObj = await tx.sede.findUnique({ where: { id: payload.sede_id } });
      if (!sedeObj) {
        sedeObj = await tx.sede.findFirst({ where: { estado: true } });
        if (!sedeObj) {
          sedeObj = await tx.sede.create({
            data: {
              id: payload.sede_id,
              nombre: 'Sede Principal Universitaria',
              estado: true,
            },
          });
        }
      }

      let terminalObj = await tx.terminal.findUnique({ where: { id: payload.terminal_id } });
      if (!terminalObj) {
        terminalObj = await tx.terminal.create({
          data: {
            id: payload.terminal_id,
            sede_id: sedeObj.id,
            estado: true,
          },
        });
      } else if (!terminalObj.estado) {
        terminalObj = await tx.terminal.update({
          where: { id: payload.terminal_id },
          data: { estado: true },
        });
      }
      const DNI_MENOR = '00000000';
      const DNI_VISITANTE = 'VISIT000';
      let usuarioMenor = await tx.usuario.findUnique({ where: { dni: DNI_MENOR } });
      let usuarioVisitante = await tx.usuario.findUnique({ where: { dni: DNI_VISITANTE } });

      if (!usuarioMenor) {
        usuarioMenor = await tx.usuario.create({
          data: {
            id: 'USR-MENOR-GENERICO',
            dni: DNI_MENOR,
            nombre_completo: 'MENOR - SIN DOCUMENTO',
            estado: true,
          },
        });
      }

      if (!usuarioVisitante) {
        usuarioVisitante = await tx.usuario.create({
          data: {
            id: 'USR-VISITANTE-GENERICO',
            dni: DNI_VISITANTE,
            nombre_completo: 'VISITANTE - SIN DOCUMENTO',
            estado: true,
          },
        });
      }

      for (const registro of payload.registros) {
        let finalUsuarioId: string | null = registro.usuario_id;
        let observacionFinal: string | null = registro.observacion ?? null;

        if (registro.es_menor_manual) {
          if (!registro.datos_menor || registro.datos_menor.nombre_completo.length < 3) {
            throw new BadRequestException(
              `El menor con ID operacional ${registro.id_operacion_local} debe tener un nombre de minimo 3 caracteres.`,
            );
          }
          finalUsuarioId = usuarioMenor.id;
          observacionFinal = `Menor - Sin Doc. | Nombre digitado: ${registro.datos_menor.nombre_completo.toUpperCase()}`;
        } else if (!registro.usuario_id && registro.visitante_nombre?.trim()) {
          finalUsuarioId = usuarioVisitante.id;
          observacionFinal = this.buildVisitorObservation(registro) ?? observacionFinal;
        } else {
          // Sanitización: tratar string vacío igual que null/undefined para evitar
          // PrismaClientValidationError si el cliente envía usuario_id: "" en lugar de null.
          const rawUsuarioId = registro.usuario_id?.trim();
          let usuarioIdQuery: string | undefined = rawUsuarioId || undefined;
          let usuarioExiste: { id: string; [key: string]: unknown } | null = null;

          if (usuarioIdQuery) {
            usuarioExiste = await tx.usuario.findUnique({
              where: { id: usuarioIdQuery },
            });
          }

          // Sanitización: también tratar dni vacío como ausente para evitar findUnique con dni: ""
          const rawDni = registro.dni?.trim();
          const targetDni = rawDni || (usuarioIdQuery && usuarioIdQuery.startsWith('usr-') ? usuarioIdQuery.substring(4) : usuarioIdQuery);

          if (!usuarioExiste && targetDni) {
            usuarioExiste = await tx.usuario.findUnique({
              where: { dni: targetDni.substring(0, 9) },
            });
          }

          if (!usuarioExiste && targetDni) {
            const nameFromObs = registro.visitante_nombre?.trim()
              || registro.nombre?.trim()
              || (registro.observacion?.startsWith('Visitante:')
                ? registro.observacion.substring('Visitante:'.length).split('|')[0].trim()
                : `Visitante DNI: ${targetDni}`);
            const newUserId = usuarioIdQuery || `usr-${targetDni}`;
            try {
              usuarioExiste = await tx.usuario.create({
                data: {
                  id: newUserId,
                  dni: targetDni.substring(0, 9),
                  nombre_completo: nameFromObs,
                  estado: true,
                },
              });
            } catch {
              usuarioExiste = await tx.usuario.findFirst({
                where: {
                  OR: [
                    { id: newUserId },
                    { dni: targetDni.substring(0, 9) }
                  ]
                }
              });
            }
          }

          if (!usuarioExiste) {
            finalUsuarioId = usuarioVisitante.id;
            observacionFinal = this.buildVisitorObservation(registro) ?? observacionFinal ?? `Visitante DNI: ${registro.dni || 'Sin DNI'}`;
          } else {
            finalUsuarioId = usuarioExiste.id;
          }
        }

        const existente = await tx.asistencia.findUnique({
          where: { id_operacion_local: registro.id_operacion_local },
        });

        const estadoAuditoria = (registro as any).estado_auditoria ?? 'normal';

        if (existente) {
          await tx.asistencia.update({
            where: { id_operacion_local: registro.id_operacion_local },
            data: {
              tipo: registro.tipo,
              fecha_hora_marca: new Date(registro.fecha_hora_marca),
              observacion: registro.es_menor_manual ? observacionFinal : this.buildVisitorObservation(registro) ?? observacionFinal,
              estado_auditoria: estadoAuditoria,
            },
          });
          omitidosPorDuplicado++;
          processedLocalIds.push(registro.id_operacion_local);
          continue;
        }

        await tx.asistencia.create({
          data: {
            id_operacion_local: registro.id_operacion_local,
            usuario_id: finalUsuarioId,
            terminal_id: payload.terminal_id,
            sede_id: payload.sede_id,
            tipo: registro.tipo,
            fecha_hora_marca: new Date(registro.fecha_hora_marca),
            observacion: registro.es_menor_manual ? observacionFinal : this.buildVisitorObservation(registro) ?? observacionFinal,
            estado_auditoria: estadoAuditoria,
          },
        });
        insertados++;
        processedLocalIds.push(registro.id_operacion_local);
      }

      return {
        success: true,
        processed_local_ids: processedLocalIds,
        stats: {
          recibidos: payload.registros.length,
          insertados,
          omitidosPorDuplicado,
        },
      };
    }, options);
  }

  /**
   * Alias transaccional para sincronización masiva de asistencias.
   */
  async syncAttendances(payload: SyncAttendanceDto, options?: TransactionRetryOptions) {
    return this.syncLote(payload, options);
  }

  /**
   * Alias transaccional para registro batch de marcas.
   */
  async registerMarksBatch(payload: SyncAttendanceDto, options?: TransactionRetryOptions) {
    return this.syncLote(payload, options);
  }

  /**
   * Obtiene las marcas sincronizadas para réplica o actualización de caché local.
   */
  async pullSyncedMarks(limit = 1000) {
    const records = await this.prisma.client.asistencia.findMany({
      take: limit,
      where: {
        estado_auditoria: {
          not: 'borrado',
        },
      },
      orderBy: { fecha_hora_marca: 'desc' },
      include: {
        usuario: true,
        terminal: true,
        sede: true,
      },
    });

    return records.map((r) => ({
      local_id: r.id_operacion_local,
      usuario_id: r.usuario_id,
      dni: r.usuario?.dni || '00000000',
      nombre: r.usuario?.nombre_completo || r.usuario?.nombres || 'Usuario',
      tipo_marca: r.tipo,
      fecha_hora: r.fecha_hora_marca.toISOString(),
      id_terminal: r.terminal_id,
      sede_id: r.sede_id,
      observacion: r.observacion,
      estado_auditoria: r.estado_auditoria || 'normal',
      sync_status: 'Sincronizado',
    }));
  }
}
