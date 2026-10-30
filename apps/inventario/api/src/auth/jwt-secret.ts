import { randomBytes } from 'node:crypto';

// Solo para desarrollo local: cambia en cada proceso y nunca debe usarse en produccion.
const DEV_JWT_SECRET = randomBytes(32).toString('hex');

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET_INVENTARIO?.trim();

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET_INVENTARIO es requerido en produccion para Inventario API.');
  }

  return DEV_JWT_SECRET;
}
