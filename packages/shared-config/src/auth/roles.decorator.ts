/** Metadata consumida por `RolesGuard` para autorizar capacidades de negocio. */
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Declara los roles admitidos por una clase o método controlador. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
