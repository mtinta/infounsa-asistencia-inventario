/**
 * Códigos de error de dominio estandarizados para Plataforma InfoUNSA.
 * Evita la captura y parsing frágil de cadenas de texto (substring matching) en interfaces y controladores.
 */
export enum DomainErrorCode {
  // Autenticación y Autorización
  ERR_UNAUTHORIZED = 'ERR_UNAUTHORIZED',
  ERR_FORBIDDEN = 'ERR_FORBIDDEN',
  ERR_INVALID_CREDENTIALS = 'ERR_INVALID_CREDENTIALS',
  ERR_USER_NOT_FOUND = 'ERR_USER_NOT_FOUND',
  ERR_USER_ALREADY_EXISTS = 'ERR_USER_ALREADY_EXISTS',
  ERR_TERMINAL_MISMATCH = 'ERR_TERMINAL_MISMATCH',
  ERR_TOKEN_EXPIRED = 'ERR_TOKEN_EXPIRED',

  // Inventario y Stock
  ERR_INSUFFICIENT_STOCK = 'ERR_INSUFFICIENT_STOCK',
  ERR_ITEM_NOT_FOUND = 'ERR_ITEM_NOT_FOUND',
  ERR_DUPLICATE_BARCODE = 'ERR_DUPLICATE_BARCODE',
  ERR_INVALID_QUANTITY = 'ERR_INVALID_QUANTITY',
  ERR_CATEGORY_NOT_FOUND = 'ERR_CATEGORY_NOT_FOUND',

  // Asistencia y Marcación
  ERR_DUPLICATE_MARK = 'ERR_DUPLICATE_MARK',
  ERR_INVALID_DNI = 'ERR_INVALID_DNI',
  ERR_OFFLINE_SYNC = 'ERR_OFFLINE_SYNC',
  ERR_DEVICE_UNREGISTERED = 'ERR_DEVICE_UNREGISTERED',

  // Datos y Formato
  ERR_INVALID_INPUT = 'ERR_INVALID_INPUT',
  ERR_EXCEL_PARSING = 'ERR_EXCEL_PARSING',
  ERR_FILE_UPLOAD = 'ERR_FILE_UPLOAD',
  ERR_NETWORK = 'ERR_NETWORK',
  ERR_INTERNAL = 'ERR_INTERNAL',
}

/**
 * Clase estándar para errores de dominio con código tipado.
 */
export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly details?: unknown;

  constructor(code: DomainErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Helper type-guard para determinar si un error capturado es un DomainError o tiene DomainErrorCode.
   */
  static isDomainError(error: unknown): error is DomainError {
    if (error instanceof DomainError) return true;
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      return typeof err.code === 'string' && Object.values(DomainErrorCode).includes(err.code as DomainErrorCode);
    }
    return false;
  }

  /**
   * Extrae el código de error o un fallback seguro.
   */
  static getCode(error: unknown): DomainErrorCode | null {
    if (DomainError.isDomainError(error)) {
      return error.code;
    }
    return null;
  }
}
