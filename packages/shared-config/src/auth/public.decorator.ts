/** Metadata que permite excluir una ruta del `JwtAuthGuard` global. */
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca una clase o método como accesible sin JWT. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
