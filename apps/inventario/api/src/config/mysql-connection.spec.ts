import { getMysqlConnectionOptions } from './mysql-connection';

describe('Configuracion de conexion MySQL de Inventario', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('aplica el pool seguro por defecto fuera de produccion', () => {
    delete process.env.NODE_ENV;
    delete process.env.MYSQL_SSL;
    delete process.env.MYSQL_SSL_REJECT_UNAUTHORIZED;

    expect(getMysqlConnectionOptions('mysql://usuario:clave@db.example/infounsa_inventario')).toMatchObject({
      host: 'db.example',
      port: 3306,
      user: 'usuario',
      password: 'clave',
      database: 'infounsa_inventario',
      connectionLimit: 10,
      connectTimeout: 5000,
      acquireTimeout: 5000,
      idleTimeout: 60000,
    });
  });

  it('habilita TLS validando el certificado cuando se solicita', () => {
    process.env.MYSQL_SSL = 'true';
    process.env.MYSQL_SSL_REJECT_UNAUTHORIZED = 'true';

    expect(getMysqlConnectionOptions('mysql://usuario:clave@db.example/infounsa_inventario').ssl).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('rechaza una conexion sin TLS en produccion', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MYSQL_SSL;

    expect(() => getMysqlConnectionOptions('mysql://usuario:clave@db.example/infounsa_inventario')).toThrow(
      'MYSQL_SSL=true es obligatorio en produccion',
    );
  });

  it('rechaza desactivar la validacion TLS en produccion', () => {
    process.env.NODE_ENV = 'production';
    process.env.MYSQL_SSL = 'true';
    process.env.MYSQL_SSL_REJECT_UNAUTHORIZED = 'false';

    expect(() => getMysqlConnectionOptions('mysql://usuario:clave@db.example/infounsa_inventario')).toThrow(
      'MYSQL_SSL_REJECT_UNAUTHORIZED=false no esta permitido en produccion',
    );
  });
});
