/**
 * Guard global de autenticación JWT.
 *
 * Permite únicamente handlers marcados con `@Public()` sin token; el resto de
 * rutas pasa por la estrategia JWT de Asistencia.
 *
 * @see ./public.decorator.ts
 * @see apps/asistencia/api/src/modules/auth/jwt.strategy.ts
 */
import { Injectable, ExecutionContext, Inject } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
