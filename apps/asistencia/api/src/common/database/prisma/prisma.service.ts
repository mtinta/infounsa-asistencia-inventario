/**
 * Adaptador de infraestructura para la conexión MySQL/MariaDB de Asistencia.
 *
 * Normaliza la URL que usan Docker y el entorno local, crea el cliente Prisma
 * y mantiene un watchdog de conexión. Los módulos de negocio consumen
 * `PrismaService`; no deben crear pools ni conocer la ubicación de esta clase.
 *
 * @see apps/asistencia/api/src/common/database/prisma/prisma.module.ts
 * @see apps/asistencia/api/src/modules/attendance/attendance.service.ts
 * @see apps/asistencia/api/prisma/schema.prisma
 */
import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../../generated/prisma/client';
import { getMysqlConnectionOptions } from '@infounsa/shared-config';
import {
  executeTransactionWithRetry,
  isRetryableTransactionError,
  TransactionRetryOptions,
} from '../transaction-retry.helper';

/**
 * Obtiene una URL compatible con el adaptador PrismaMariaDb.
 *
 * @returns {string} URL normalizada sin exponer la contraseña en logs.
 */
function getConnectionOptions() {
  const rawConnectionString = process.env.DATABASE_URL || process.env.ASISTENCIA_DATABASE_URL;

  if (!rawConnectionString?.trim()) {
    throw new Error('DATABASE_URL o ASISTENCIA_DATABASE_URL es requerido para Asistencia API.');
  }

  return getMysqlConnectionOptions(rawConnectionString);
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public client!: PrismaClient;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isReconnecting = false;
  private connectionOptions: ReturnType<typeof getConnectionOptions>;

  constructor() {
    this.connectionOptions = getConnectionOptions();
    this.logger.log(
      `Inicializando Prisma Asistencia con MySQL ${this.connectionOptions.host}:${this.connectionOptions.port}/${this.connectionOptions.database}`,
    );
    this.createClientInstance();
  }

  /**
   * Construye el cliente Prisma con el adaptador MariaDB/MySQL configurado.
   *
   * @returns Cliente Prisma listo para conexión.
   */
  private createClientInstance(): PrismaClient {
    const adapter = new PrismaMariaDb(this.connectionOptions);
    const rawClient = new PrismaClient({ adapter });

    this.client = new Proxy(rawClient as unknown as Record<string | symbol, unknown>, {
      get(target: Record<string | symbol, unknown>, prop: string | symbol) {
        if (prop === 'adminUser') return target.usuario;
        if (prop === 'adminSede') return target.sede;
        if (prop === 'adminTerminal') return target.terminal;
        if (prop === 'adminAttendance') return target.asistencia;
        if (prop === 'adminRole') return target.role;
        return target[prop];
      },
    }) as unknown as PrismaClient;

    return this.client;
  }

  /**
   * Reemplaza el cliente cuando el pool queda inválido y verifica `SELECT 1`.
   *
   * @returns `true` si la conexión fue restablecida; `false` si debe reintentarse.
   */
  public async reconnect(): Promise<boolean> {
    if (this.isReconnecting) {
      return false;
    }
    this.isReconnecting = true;

    try {
      this.logger.warn('Intentando reconectar y renovar pool de base de datos...');
      try {
        if (this.client) {
          await Promise.race([
            this.client.$disconnect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Disconnect timeout')), 2000)),
          ]);
        }
      } catch {
        // Ignorar errores al desconectar pool previo zombi
      }

      this.createClientInstance();
      await this.client.$connect();
      await this.client.$queryRaw`SELECT 1`;
      this.logger.log('Reconexión exitosa a la base de datos MySQL (Asistencia)');
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Fallo en auto-reconexión a MySQL: ${msg}`);
      return false;
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Ejecuta un callback dentro de una transacción Prisma con reintentos automáticos
   * y retroceso exponencial ante deadlocks o contención de bloqueos.
   */
  public async executeTransaction<T>(
    callback: (tx: unknown) => Promise<T>,
    options?: TransactionRetryOptions,
  ): Promise<T> {
    return executeTransactionWithRetry(
      (cb, opts) => this.client.$transaction(cb as any, opts as any) as unknown as Promise<T>,
      callback,
      {
        onRetry: (attempt, maxRetries, error, delayMs) => {
          const err = error as { code?: string; errno?: number; message?: string } | undefined;
          this.logger.warn(
            `Transacción Prisma reintentando (${attempt + 1}/${maxRetries}) tras ${delayMs}ms por error recuperable: ${err?.code || err?.errno || err?.message}`,
          );
        },
        ...options,
      },
    );
  }

  /** Inicia el watchdog de conexión una sola vez. */
  private startHeartbeat() {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(async () => {
      if (this.isReconnecting) return;
      try {
        await this.client.$queryRaw`SELECT 1`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Watchdog detectó fallo de conexión a BD (${msg}). Disparando auto-recuperación...`);
        await this.reconnect();
      }
    }, 10000);
  }

  /** Conecta al arrancar, con reintentos acotados y recuperación diferida. */
  async onModuleInit() {
    const maxRetries = 10;
    const retryDelay = 3000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.client.$connect();
        await this.client.$queryRaw`SELECT 1`;
        this.logger.log('Conexión inicial exitosa a la base de datos MySQL (Asistencia)');
        this.startHeartbeat();
        return;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Intento ${attempt}/${maxRetries} fallido al conectar a MySQL: ${msg}. Reintentando en 3s...`
        );
        if (attempt === maxRetries) {
          this.logger.error('No se pudo conectar a la base de datos en arranque. Activando watchdog para auto-recuperación en diferido.');
          this.startHeartbeat();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  /** Detiene el watchdog y libera la conexión al apagar NestJS. */
  async onModuleDestroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.client) {
      await this.client.$disconnect();
    }
  }
}


