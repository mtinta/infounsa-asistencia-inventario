/**
 * Middleware transversal de auditoría HTTP.
 *
 * Registra método, URL, estado, IP y tiempo de respuesta en Winston después de
 * que Express emite `finish`; no modifica la respuesta del controlador.
 *
 * @see ./winston.config.ts
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { logger } from './winston.config';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  /** Registra la solicitud y continúa el pipeline de NestJS. */
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { method, originalUrl, ip } = req;
      const { statusCode } = res;

      const logData = {
        context: 'HTTP',
        method,
        url: originalUrl,
        statusCode,
        duration: `${duration}ms`,
        ip,
      };

      if (statusCode >= 500) {
        logger.error(`[${method}] ${originalUrl} ${statusCode} - ${duration}ms`, logData);
      } else if (statusCode >= 400) {
        logger.warn(`[${method}] ${originalUrl} ${statusCode} - ${duration}ms`, logData);
      } else {
        logger.info(`[${method}] ${originalUrl} ${statusCode} - ${duration}ms`, logData);
      }
    });

    next();
  }
}
