import {
  isRetryableTransactionError,
  executeTransactionWithRetry,
  RETRYABLE_DB_ERROR_CODES,
} from './transaction-retry.helper';

describe('transaction-retry.helper', () => {
  describe('isRetryableTransactionError', () => {
    it('debe reconocer todos los códigos canónicos de contención de BD', () => {
      expect(isRetryableTransactionError({ code: 'P2034' })).toBe(true);
      expect(isRetryableTransactionError({ code: '1213' })).toBe(true);
      expect(isRetryableTransactionError({ errno: 1213 })).toBe(true);
      expect(isRetryableTransactionError({ code: '1205' })).toBe(true);
      expect(isRetryableTransactionError({ errno: 1205 })).toBe(true);
      expect(isRetryableTransactionError({ code: 'ER_LOCK_DEADLOCK' })).toBe(true);
      expect(isRetryableTransactionError({ code: 'ER_LOCK_WAIT_TIMEOUT' })).toBe(true);
    });

    it('debe detectar códigos anidados en meta, cause u originalError', () => {
      expect(isRetryableTransactionError({ meta: { code: '1213' } })).toBe(true);
      expect(isRetryableTransactionError({ meta: { cause: { code: 'ER_LOCK_DEADLOCK' } } })).toBe(true);
      expect(isRetryableTransactionError({ cause: { code: 'P2034' } })).toBe(true);
      expect(isRetryableTransactionError({ originalError: { errno: 1205 } })).toBe(true);
      expect(isRetryableTransactionError({ originalError: { code: 'ER_LOCK_WAIT_TIMEOUT' } })).toBe(true);
    });

    it('debe detectar patrones de deadlock y timeout en el mensaje', () => {
      expect(
        isRetryableTransactionError(
          new Error('Deadlock found when trying to get lock; try restarting transaction'),
        ),
      ).toBe(true);
      expect(
        isRetryableTransactionError(
          new Error('Lock wait timeout exceeded; try restarting transaction'),
        ),
      ).toBe(true);
      expect(
        isRetryableTransactionError(
          new Error('Transaction failed due to a write conflict'),
        ),
      ).toBe(true);
    });

    it('debe retornar false ante errores no recuperables o nulos', () => {
      expect(isRetryableTransactionError(null)).toBe(false);
      expect(isRetryableTransactionError(undefined)).toBe(false);
      expect(isRetryableTransactionError({ code: 'P2002' })).toBe(false);
      expect(isRetryableTransactionError({ code: 'ER_DUP_ENTRY' })).toBe(false);
      expect(isRetryableTransactionError(new Error('Validation error: Invalid input'))).toBe(false);
    });
  });

  describe('executeTransactionWithRetry', () => {
    it('ejecuta exitosamente en el primer intento si no hay errores', async () => {
      const mockExecutor = jest.fn((callback) => callback('tx-context'));
      const mockCallback = jest.fn().mockResolvedValue('resultado-exitoso');

      const result = await executeTransactionWithRetry(mockExecutor, mockCallback);

      expect(result).toBe('resultado-exitoso');
      expect(mockExecutor).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith('tx-context');
    });

    it('reintenta ante error de deadlock (1213) y retorna el resultado en el segundo intento', async () => {
      const deadlockError = Object.assign(new Error('Deadlock found'), { errno: 1213 });
      const mockExecutor = jest.fn((callback) => callback('tx-context'));
      const mockCallback = jest
        .fn()
        .mockRejectedValueOnce(deadlockError)
        .mockResolvedValueOnce('exito-en-reintento');

      const onRetryMock = jest.fn();

      const result = await executeTransactionWithRetry(mockExecutor, mockCallback, {
        baseDelayMs: 1,
        onRetry: onRetryMock,
      });

      expect(result).toBe('exito-en-reintento');
      expect(mockCallback).toHaveBeenCalledTimes(2);
      expect(onRetryMock).toHaveBeenCalledWith(0, 3, deadlockError, expect.any(Number));
    });

    it('falla inmediatamente sin reintentar ante errores no recuperables', async () => {
      const syntaxError = new Error('Syntax error in SQL');
      const mockExecutor = jest.fn((callback) => callback('tx-context'));
      const mockCallback = jest.fn().mockRejectedValue(syntaxError);
      const onRetryMock = jest.fn();

      await expect(
        executeTransactionWithRetry(mockExecutor, mockCallback, {
          baseDelayMs: 1,
          onRetry: onRetryMock,
        }),
      ).rejects.toThrow('Syntax error in SQL');

      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(onRetryMock).not.toHaveBeenCalled();
    });

    it('agota los reintentos configurados y lanza el último error si el deadlock persiste', async () => {
      const deadlockError = Object.assign(new Error('Deadlock permanente'), { code: 'P2034' });
      const mockExecutor = jest.fn((callback) => callback('tx-context'));
      const mockCallback = jest.fn().mockRejectedValue(deadlockError);
      const onRetryMock = jest.fn();

      await expect(
        executeTransactionWithRetry(mockExecutor, mockCallback, {
          maxRetries: 4,
          baseDelayMs: 1,
          onRetry: onRetryMock,
        }),
      ).rejects.toThrow('Deadlock permanente');

      expect(mockCallback).toHaveBeenCalledTimes(4);
      expect(onRetryMock).toHaveBeenCalledTimes(3);
    });

    it('soporta reintentos cuando el executor mismo ($transaction) lanza el error recuperable', async () => {
      const lockTimeout = Object.assign(new Error('Lock wait timeout'), { errno: 1205 });
      let callCount = 0;
      const mockExecutor = jest.fn(async (callback) => {
        callCount++;
        if (callCount === 1) {
          throw lockTimeout;
        }
        return callback('tx-context');
      });
      const mockCallback = jest.fn().mockResolvedValue('recuperado');

      const result = await executeTransactionWithRetry(mockExecutor, mockCallback, {
        baseDelayMs: 1,
      });

      expect(result).toBe('recuperado');
      expect(mockExecutor).toHaveBeenCalledTimes(2);
    });
  });
});
