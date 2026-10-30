import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';
import { getMysqlConnectionOptions } from '@infounsa/shared-config';

function getConnectionOptions() {
  const rawConnectionString = process.env.DATABASE_URL || process.env.INVENTARIO_DATABASE_URL;

  if (!rawConnectionString?.trim()) {
    throw new Error('DATABASE_URL o INVENTARIO_DATABASE_URL es requerido para Inventario API.');
  }

  return getMysqlConnectionOptions(rawConnectionString);
}

interface PrismaQueryContext<TArgs = Record<string, unknown>, TResult = unknown> {
  model: string;
  operation: string;
  args: TArgs;
  query: (args: TArgs) => Promise<TResult>;
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public client!: PrismaClient;
  private baseClient!: PrismaClient;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isReconnecting = false;
  private connectionOptions: ReturnType<typeof getConnectionOptions>;

  constructor() {
    this.connectionOptions = getConnectionOptions();
    this.logger.log(
      `Inicializando Prisma Inventario con MySQL ${this.connectionOptions.host}:${this.connectionOptions.port}/${this.connectionOptions.database}`,
    );
    this.createClientInstance();
  }

  private createClientInstance(): PrismaClient {
    this.baseClient = new PrismaClient({ adapter: new PrismaMariaDb(this.connectionOptions) });
    const currentBase = this.baseClient;

    // Extensión de auditoría automatizada que reutiliza baseClient (evita fugas de conexiones)
    this.client = (this.baseClient as any).$extends({
      query: {
        $allModels: {
          async create({ model, operation: _operation, args, query }: PrismaQueryContext) {
            const result = await query(args);
            if (model === 'InventoryItem' || model === 'InventoryMovement') {
              try {
                let userId: number | null = null;
                const data = args?.data as Record<string, unknown> | undefined;
                if (data?.user_id) userId = Number(data.user_id);

                await currentBase.auditLog.create({
                  data: {
                    user_id: userId,
                    action: `CREATE_${model.toUpperCase()}`,
                    details: JSON.stringify({ args, result }),
                  },
                });
              } catch (err) {
                console.error('Error al registrar auditoría en create:', err);
              }
            }
            return result;
          },
          async update({ model, operation: _operation, args, query }: PrismaQueryContext) {
            const result = await query(args);
            if (model === 'InventoryItem' || model === 'InventoryMovement') {
              try {
                let userId: number | null = null;
                const data = args?.data as Record<string, unknown> | undefined;
                if (data?.user_id) userId = Number(data.user_id);

                await currentBase.auditLog.create({
                  data: {
                    user_id: userId,
                    action: `UPDATE_${model.toUpperCase()}`,
                    details: JSON.stringify({ args, result }),
                  },
                });
              } catch (err) {
                console.error('Error al registrar auditoría en update:', err);
              }
            }
            return result;
          },
          async delete({ model, operation: _operation, args, query }: PrismaQueryContext) {
            const result = await query(args);
            if (model === 'InventoryItem' || model === 'InventoryMovement') {
              try {
                await currentBase.auditLog.create({
                  data: {
                    user_id: null,
                    action: `DELETE_${model.toUpperCase()}`,
                    details: JSON.stringify({ args }),
                  },
                });
              } catch (err) {
                console.error('Error al registrar auditoría en delete:', err);
              }
            }
            return result;
          },
        },
      },
    }) as any;

    return this.client;
  }

  public async reconnect(): Promise<boolean> {
    if (this.isReconnecting) {
      return false;
    }
    this.isReconnecting = true;

    try {
      this.logger.warn('Intentando reconectar y renovar pool de base de datos (Inventario)...');
      try {
        if (this.baseClient) {
          await Promise.race([
            this.baseClient.$disconnect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Disconnect timeout')), 2000)),
          ]);
        }
      } catch {
        // Ignorar errores al desconectar pool previo zombi
      }

      this.createClientInstance();
      if (typeof (this.client as any).$connect === 'function') {
        await (this.client as any).$connect();
      }
      await this.client.$queryRaw`SELECT 1`;
      this.logger.log('Reconexión exitosa a la base de datos MySQL (Inventario)');
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Fallo en auto-reconexión a MySQL (Inventario): ${msg}`);
      return false;
    } finally {
      this.isReconnecting = false;
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(async () => {
      if (this.isReconnecting) return;
      try {
        await this.client.$queryRaw`SELECT 1`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Watchdog Inventario detectó fallo de BD (${msg}). Disparando auto-recuperación...`);
        await this.reconnect();
      }
    }, 10000);
  }

  async onModuleInit() {
    const maxRetries = 10;
    const retryDelay = 3000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (typeof (this.client as any).$connect === 'function') {
          await (this.client as any).$connect();
        }
        await this.client.$queryRaw`SELECT 1`;
        this.logger.log('Conexión inicial exitosa a la base de datos MySQL (Inventario)');
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

  async onModuleDestroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.baseClient && typeof (this.baseClient as any).$disconnect === 'function') {
      await (this.baseClient as any).$disconnect();
    }
  }
}


