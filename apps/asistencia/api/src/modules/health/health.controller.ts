import { Controller, Get, Res, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import { Public } from '../../common/auth/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async checkHealth(@Res() res: Response) {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return res.status(HttpStatus.OK).json({ status: 'ok', database: 'connected', service: 'asistencia-api' });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Intentar auto-recuperación si el primer intento falló
      const reconnected = await this.prisma.reconnect();
      if (reconnected) {
        try {
          await this.prisma.client.$queryRaw`SELECT 1`;
          return res.status(HttpStatus.OK).json({ status: 'ok', database: 'connected', service: 'asistencia-api', recovered: true });
        } catch (recoveryError: unknown) {
          const recoveryMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
          this.logger.error(`Health check de Asistencia no pudo validar la reconexion: ${recoveryMessage}`);
        }
      }

      this.logger.error(`Health check de Asistencia no pudo conectar a la base de datos: ${errorMessage}`);

      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'error',
        database: 'unavailable',
        code: 'DATABASE_UNAVAILABLE',
      });
    }
  }
}

