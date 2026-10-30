import { getMysqlConnectionOptions } from './mysql-connection';

describe('Configuracion de conexion MySQL compartida', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('asigna timeouts y pool por defecto cuando no se definen variables', () => {
    delete process.env.NODE_ENV;
    delete process.env.MYSQL_SSL;
    delete process.env.MYSQL_SSL_REJECT_UNAUTHORIZED;

    expect(getMysqlConnectionOptions('mysql://usuario:clave@db.example/infounsa_db')).toMatchObject({
      host: 'db.example',
      port: 3306,
      user: 'usuario',
      password: 'clave',
      database: 'infounsa_db',
      connectionLimit: 10,
      connectTimeout: 5000,
      acquireTimeout: 5000,
      idleTimeout: 60000,
    });
  });

  it('configura ssl con rejectUnauthorized en true cuando se habilita explicitamente', () => {
    process.env.MYSQL_SSL = 'true';
    process.env.MYSQL_SSL_REJECT_UNAUTHORIZED = 'true';

    expect(getMysqlConnectionOptions('mysql://usuario:clave@db.example/infounsa_db').ssl).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('exige MYSQL_SSL=true en produccion', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MYSQL_SSL;

    expect(() => getMysqlConnectionOptions('mysql://usuario:clave@db.example/infounsa_db')).toThrow(
      'MYSQL_SSL=true es obligatorio en produccion',
    );
  });

  it('bloquea MYSQL_SSL_REJECT_UNAUTHORIZED=false en produccion', () => {
    process.env.NODE_ENV = 'production';
    process.env.MYSQL_SSL = 'true';
    process.env.MYSQL_SSL_REJECT_UNAUTHORIZED = 'false';

    expect(() => getMysqlConnectionOptions('mysql://usuario:clave@db.example/infounsa_db')).toThrow(
      'MYSQL_SSL_REJECT_UNAUTHORIZED=false no esta permitido en produccion',
    );
  });
});
