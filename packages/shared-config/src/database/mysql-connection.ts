import { readFileSync } from 'node:fs';

export type MysqlSslOptions = {
  ca?: string;
  rejectUnauthorized: boolean;
};

export interface MysqlConnectionOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: MysqlSslOptions;
  connectionLimit: number;
  connectTimeout: number;
  acquireTimeout: number;
  idleTimeout: number;
}

function parseBoolean(name: string, value: string | undefined, defaultValue: boolean) {
  if (value === undefined || value.trim() === '') return defaultValue;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  throw new Error(`${name} debe ser true o false.`);
}

function parsePositiveInteger(name: string, value: string | undefined, defaultValue: number) {
  const parsed = value === undefined || value.trim() === '' ? defaultValue : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} debe ser un entero positivo.`);
  }
  return parsed;
}

export function getMysqlConnectionOptions(rawConnectionString: string): MysqlConnectionOptions {
  const connectionUrl = new URL(rawConnectionString);
  const sslEnabled = parseBoolean('MYSQL_SSL', process.env.MYSQL_SSL, false);
  const rejectUnauthorized = parseBoolean(
    'MYSQL_SSL_REJECT_UNAUTHORIZED',
    process.env.MYSQL_SSL_REJECT_UNAUTHORIZED,
    true,
  );

  if (process.env.NODE_ENV === 'production' && !sslEnabled) {
    throw new Error('MYSQL_SSL=true es obligatorio en produccion.');
  }
  if (process.env.NODE_ENV === 'production' && !rejectUnauthorized) {
    throw new Error('MYSQL_SSL_REJECT_UNAUTHORIZED=false no esta permitido en produccion.');
  }

  const caFile = process.env.MYSQL_SSL_CA_FILE?.trim();
  let ssl: MysqlSslOptions | undefined;
  if (sslEnabled) {
    ssl = { rejectUnauthorized };
    if (caFile) {
      ssl.ca = readFileSync(caFile, 'utf8');
    }
  }

  return {
    host: connectionUrl.hostname || '127.0.0.1',
    port: Number(connectionUrl.port || 3306),
    user: decodeURIComponent(connectionUrl.username),
    password: decodeURIComponent(connectionUrl.password),
    database: decodeURIComponent(connectionUrl.pathname.replace(/^\/+/, '')),
    ...(ssl ? { ssl } : {}),
    connectionLimit: parsePositiveInteger('DB_CONNECTION_LIMIT', process.env.DB_CONNECTION_LIMIT, 10),
    connectTimeout: parsePositiveInteger('DB_CONNECT_TIMEOUT_MS', process.env.DB_CONNECT_TIMEOUT_MS, 5000),
    acquireTimeout: parsePositiveInteger('DB_ACQUIRE_TIMEOUT_MS', process.env.DB_ACQUIRE_TIMEOUT_MS, 5000),
    idleTimeout: parsePositiveInteger('DB_IDLE_TIMEOUT_MS', process.env.DB_IDLE_TIMEOUT_MS, 60000),
  };
}
