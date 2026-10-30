/**
 * Composition root del monolito modular de Asistencia.
 *
 * `common` contiene capacidades transversales y `modules` contiene capacidades
 * de negocio. Los guards globales preservan la política de autenticación,
 * roles y limitación de tráfico mientras el árbol físico se reorganiza.
 *
 * @see apps/asistencia/api/src/common/auth
 * @see apps/asistencia/api/src/common/database
 * @see apps/asistencia/api/src/modules
 */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { SedesModule } from './modules/sedes/sedes.module';
import { TerminalsModule } from './modules/terminals/terminals.module';
import { UsersModule } from './modules/users/users.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { PrismaModule } from './common/database/prisma/prisma.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard, LoggerMiddleware } from '@infounsa/shared-config';
import { StatsModule } from './modules/stats/stats.module';
import { BarcodeModule } from './modules/barcode/barcode.module';

@Module({
  imports: [
    // Rate limiting: 100 peticiones por 60 segundos por IP
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // ms
        limit: 100,
      },
    ]),
    HealthModule,
    AuthModule,
    SedesModule,
    TerminalsModule,
    UsersModule,
    AttendanceModule,
    PrismaModule,
    StatsModule,
    BarcodeModule,
  ],
  controllers: [],
  providers: [
    // Rate limiter global (antes del JWT guard)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // JWT auth global
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Roles auth global
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
