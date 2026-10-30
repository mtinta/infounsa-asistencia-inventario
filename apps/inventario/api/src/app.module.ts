import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';
import { CategoriesModule } from './categories/categories.module';
import { InventoryItemsModule } from './inventory-items/inventory-items.module';
import { InventoryMovementsModule } from './inventory-movements/inventory-movements.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard, LoggerMiddleware } from '@infounsa/shared-config';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AreasModule } from './areas/areas.module';

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
    PrismaModule,
    HealthModule,
    AuthModule,
    CategoriesModule,
    InventoryItemsModule,
    InventoryMovementsModule,
    UsersModule,
    AreasModule,
  ],
  controllers: [],
  providers: [
    // Rate limiter global
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
