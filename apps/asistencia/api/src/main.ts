/**
 * Arranque HTTP de Asistencia API.
 *
 * Este archivo configura únicamente infraestructura transversal —CORS,
 * validación, logging y puerto— y delega los casos de uso a `AppModule`.
 *
 * @see apps/asistencia/api/src/app.module.ts
 * @see apps/asistencia/api/src/common/logging/winston.config.ts
 */
import dotenv from 'dotenv';
dotenv.config({ override: true });
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { logger } from './common/logging/winston.config';

// Orígenes permitidos: Portal General (nginx), clientes Electron (null/app://)
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:8000',   // Portal General (nginx dev)
  'http://127.0.0.1:8000',
  'http://localhost:43000',  // API de Asistencia
  'http://localhost:5173',   // Vite dev (si aplica)
  'http://localhost:5174',   // Vite dev alternativo (asistencia)
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
];

/**
 * Une orígenes por defecto y configurados sin duplicados.
 *
 * @param envName Nombre de la variable de entorno con una lista CSV.
 * @param defaults Orígenes locales admitidos por el producto.
 * @returns Lista normalizada que usa `bootstrap` para CORS.
 */
function getAllowedOrigins(envName: string, defaults: string[]) {
  const configured = (process.env[envName] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set([...defaults, ...configured])];
}

/**
 * Crea el servidor Nest, aplica validaciones globales y publica el API.
 *
 * @returns Promesa completada cuando el listener queda iniciado.
 * @see apps/asistencia/api/src/modules/health/health.controller.ts
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      instance: logger,
    }),
  });
  const allowedOrigins = getAllowedOrigins('ASISTENCIA_ALLOWED_ORIGINS', DEFAULT_ALLOWED_ORIGINS);
  const httpServer = app.getHttpAdapter().getInstance();

  if (typeof httpServer.set === 'function') {
    httpServer.set('trust proxy', 1);
  }

  // CORS restrictivo: solo orígenes autorizados + Electron (origin: null / undefined)
  app.enableCors({
    origin: (origin, callback) => {
      // Electron y herramientas locales envían a veces "null" o "file://"
      if (!origin || origin === 'null' || origin.startsWith('file://') || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin no permitido por CORS: ${origin}`), false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Validación global automatizada para DTOs
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const port = Number(process.env.PORT ?? process.env.ASISTENCIA_API_PORT ?? 43000);
  await app.listen(port);
  logger.info(`Asistencia API escuchando en puerto ${port}`);
}

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection capturado globalmente: ${reason}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception capturada globalmente: ${err.message}`, err.stack);
});

bootstrap();

