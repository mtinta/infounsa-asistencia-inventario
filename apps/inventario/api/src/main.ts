import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { json, urlencoded } from 'express';
import { logger } from './config/winston.config';

// Orígenes permitidos
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:8000',   // Portal General (nginx)
  'http://127.0.0.1:8000',
  'http://localhost:43001',  // API de Inventario
  'http://localhost:5173',   // Vite dev (si aplica)
];

function getAllowedOrigins(envName: string, defaults: string[]) {
  const configured = (process.env[envName] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set([...defaults, ...configured])];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      instance: logger,
    }),
  });

  // Aumentar el límite de peso para importaciones masivas (Excel)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));
  const allowedOrigins = getAllowedOrigins('INVENTARIO_ALLOWED_ORIGINS', DEFAULT_ALLOWED_ORIGINS);
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

  const port = Number(process.env.PORT ?? process.env.INVENTARIO_API_PORT ?? 43001);
  await app.listen(port);
  logger.info(`Inventario API escuchando en puerto ${port}`);
}

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection capturado globalmente: ${reason}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception capturada globalmente: ${err.message}`, err.stack);
});

bootstrap();

