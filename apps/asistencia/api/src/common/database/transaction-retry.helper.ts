/**
 * Opciones de configuración para la ejecución transaccional con reintentos.
 */
export interface TransactionRetryOptions {
  /** Cantidad máxima de intentos totales (el intento inicial + reintentos). Default: 3 */
  maxRetries?: number;
  /** Retardo base en milisegundos para el cálculo del backoff exponencial. Default: 50 */
  baseDelayMs?: number;
  /** Retardo máximo en milisegundos con jitter incluido. Default: 1000 */
  maxDelayMs?: number;
  /** Callback opcional ejecutado al detectar un fallo transaccional recuperable. */
  onRetry?: (attempt: number, maxRetries: number, error: unknown, delayMs: number) => void;
}

/** Códigos de error de base de datos reconocidos como condiciones de contención recuperables */
export const RETRYABLE_DB_ERROR_CODES = [
  'P2034', // Prisma: Transaction failed due to a write conflict or a deadlock.
  '1213', // MySQL/MariaDB errno: ER_LOCK_DEADLOCK
  '1205', // MySQL/MariaDB errno: ER_LOCK_WAIT_TIMEOUT
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT',
] as const;

/**
 * Determina si un error arrojado durante una transacción corresponde a una
 * condición de contención temporal (deadlock, lock wait timeout, write conflict)
 * susceptible de recuperarse mediante reintento.
 *
 * @param error Error capturado durante la ejecución transaccional.
 * @returns true si el error es transaccional y recuperable; false en caso contrario.
 */
export function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;

  const meta = err.meta as Record<string, unknown> | undefined;
  const metaCause = meta?.cause as Record<string, unknown> | undefined;
  const cause = err.cause as Record<string, unknown> | undefined;
  const originalError = err.originalError as Record<string, unknown> | undefined;

  const codes = [
    err.code,
    err.errno,
    meta?.code,
    metaCause?.code,
    cause?.code,
    originalError?.code,
    originalError?.errno,
  ]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).toUpperCase());

  if (codes.some((code) => (RETRYABLE_DB_ERROR_CODES as readonly string[]).includes(code))) {
    return true;
  }

  const message = String(err.message || '');
  return /deadlock|lock wait timeout|write conflict|contention/i.test(message);
}

/**
 * Ejecuta una operación transaccional envolviéndola en una estrategia de reintentos
 * con retroceso exponencial (*exponential backoff*) y jitter aleatorio.
 *
 * @param transactionExecutor Función que despacha el callback hacia el motor transaccional (ej: prisma.client.$transaction).
 * @param callback Bloque de lógica de negocio a ejecutar dentro del contexto transaccional.
 * @param options Parámetros de reintento (máximo de intentos, delay base, delay máximo, callback de log).
 */
export async function executeTransactionWithRetry<T>(
  transactionExecutor: (callback: (tx: unknown) => Promise<T>, options?: unknown) => Promise<T>,
  callback: (tx: unknown) => Promise<T>,
  options?: TransactionRetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 50;
  const maxDelayMs = options?.maxDelayMs ?? 1000;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await transactionExecutor(callback, {
        maxWait: 5000,
        timeout: 10000,
      });
    } catch (error) {
      lastError = error;

      if (!isRetryableTransactionError(error) || attempt === maxRetries - 1) {
        throw error;
      }

      const exponentialDelay = baseDelayMs * 2 ** attempt;
      const jitter = Math.floor(Math.random() * 50);
      const backoffMs = Math.min(exponentialDelay + jitter, maxDelayMs);

      if (options?.onRetry) {
        options.onRetry(attempt, maxRetries, error, backoffMs);
      }

      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError;
}
