/**
 * Configuración central de logging de Asistencia API.
 *
 * Define salida de consola y archivos rotativos para que `main.ts` y el
 * middleware HTTP utilicen el mismo logger.
 *
 * @see ./logger.middleware.ts
 * @see apps/asistencia/api/src/main.ts
 */
import winston from 'winston';
import 'winston-daily-rotate-file';

const { combine, timestamp, printf, errors, json } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, context }) =>
  JSON.stringify({
    timestamp,
    level,
    context,
    message,
    stack,
  }),
);

const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/application-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  level: 'info',
});

const errorRotateTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  level: 'error',
});

export const logger = winston.createLogger({
  level: 'info',
  format: combine(errors({ stack: true }), timestamp(), json(), logFormat),
  transports: [
    fileRotateTransport,
    errorRotateTransport,
    new winston.transports.Console(),
  ],
  exitOnError: false,
});
