/**
 * Resolución centralizada del secreto JWT del API.
 *
 * El entorno de producción exige `JWT_SECRET`; el valor de desarrollo solo
 * evita bloquear pruebas locales y no debe utilizarse como secreto productivo.
 *
 * @see apps/asistencia/api/src/modules/auth/jwt.strategy.ts
 * @see apps/asistencia/api/src/modules/auth/auth.service.ts
 */
import { randomBytes } from 'node:crypto';

// Solo para desarrollo local: cambia en cada proceso y nunca debe usarse en produccion.
const DEV_JWT_SECRET = randomBytes(32).toString('hex');

/**
 * @returns {string} Secreto configurado para firmar/verificar JWT.
 * @throws {Error} En producción cuando falta `JWT_SECRET`.
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es requerido en produccion para Asistencia API.');
  }

  return DEV_JWT_SECRET;
}
