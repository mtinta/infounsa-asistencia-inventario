/**
 * Guard global de autorización por rol.
 *
 * Lee la metadata de `@Roles()` después de la autenticación JWT y rechaza la
 * solicitud cuando el usuario no contiene un rol requerido.
 *
 * @see ./roles.decorator.ts
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      throw new ForbiddenException('Acceso denegado: Usuario no autenticado o rol ausente');
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(`Acceso denegado: Se requiere rol [${requiredRoles.join(', ')}]`);
    }

    return true;
  }
}
