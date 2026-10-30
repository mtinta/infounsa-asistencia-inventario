-- Migracion versionada para alinear el esquema MySQL de Asistencia con Prisma.
-- Compatible con MySQL 8.0.16+ / 8.4. Aplicar despues de 001_create_attendance_schema.sql.
-- Este archivo es idempotente y no contiene credenciales.

CREATE TABLE IF NOT EXISTS asistencia_schema_migrations (
  version VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

SET @sql_users_nombres = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'nombres'
    ),
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN nombres VARCHAR(100) NOT NULL DEFAULT '''' AFTER password'
  )
);
PREPARE stmt_users_nombres FROM @sql_users_nombres;
EXECUTE stmt_users_nombres;
DEALLOCATE PREPARE stmt_users_nombres;

SET @sql_users_apellido_paterno = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'apellido_paterno'
    ),
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN apellido_paterno VARCHAR(100) NOT NULL DEFAULT '''' AFTER nombres'
  )
);
PREPARE stmt_users_apellido_paterno FROM @sql_users_apellido_paterno;
EXECUTE stmt_users_apellido_paterno;
DEALLOCATE PREPARE stmt_users_apellido_paterno;

SET @sql_users_apellido_materno = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'apellido_materno'
    ),
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN apellido_materno VARCHAR(100) NOT NULL DEFAULT '''' AFTER apellido_paterno'
  )
);
PREPARE stmt_users_apellido_materno FROM @sql_users_apellido_materno;
EXECUTE stmt_users_apellido_materno;
DEALLOCATE PREPARE stmt_users_apellido_materno;

SET @sql_sync_usuarios_nombres = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'sync_usuarios' AND column_name = 'nombres'
    ),
    'SELECT 1',
    'ALTER TABLE sync_usuarios ADD COLUMN nombres VARCHAR(100) NOT NULL DEFAULT '''' AFTER dni'
  )
);
PREPARE stmt_sync_usuarios_nombres FROM @sql_sync_usuarios_nombres;
EXECUTE stmt_sync_usuarios_nombres;
DEALLOCATE PREPARE stmt_sync_usuarios_nombres;

SET @sql_sync_usuarios_apellido_paterno = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'sync_usuarios' AND column_name = 'apellido_paterno'
    ),
    'SELECT 1',
    'ALTER TABLE sync_usuarios ADD COLUMN apellido_paterno VARCHAR(100) NOT NULL DEFAULT '''' AFTER nombres'
  )
);
PREPARE stmt_sync_usuarios_apellido_paterno FROM @sql_sync_usuarios_apellido_paterno;
EXECUTE stmt_sync_usuarios_apellido_paterno;
DEALLOCATE PREPARE stmt_sync_usuarios_apellido_paterno;

SET @sql_sync_usuarios_apellido_materno = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'sync_usuarios' AND column_name = 'apellido_materno'
    ),
    'SELECT 1',
    'ALTER TABLE sync_usuarios ADD COLUMN apellido_materno VARCHAR(100) NOT NULL DEFAULT '''' AFTER apellido_paterno'
  )
);
PREPARE stmt_sync_usuarios_apellido_materno FROM @sql_sync_usuarios_apellido_materno;
EXECUTE stmt_sync_usuarios_apellido_materno;
DEALLOCATE PREPARE stmt_sync_usuarios_apellido_materno;

SET @sql_sync_usuarios_condicion = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'sync_usuarios' AND column_name = 'condicion'
    ),
    'SELECT 1',
    'ALTER TABLE sync_usuarios ADD COLUMN condicion VARCHAR(50) NULL AFTER nombre_completo'
  )
);
PREPARE stmt_sync_usuarios_condicion FROM @sql_sync_usuarios_condicion;
EXECUTE stmt_sync_usuarios_condicion;
DEALLOCATE PREPARE stmt_sync_usuarios_condicion;

SET @sql_sync_usuarios_cargo = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'sync_usuarios' AND column_name = 'cargo'
    ),
    'SELECT 1',
    'ALTER TABLE sync_usuarios ADD COLUMN cargo VARCHAR(100) NULL AFTER condicion'
  )
);
PREPARE stmt_sync_usuarios_cargo FROM @sql_sync_usuarios_cargo;
EXECUTE stmt_sync_usuarios_cargo;
DEALLOCATE PREPARE stmt_sync_usuarios_cargo;

ALTER TABLE sync_usuarios
  MODIFY COLUMN dni VARCHAR(20) NOT NULL;

SET @sql_sync_asistencias_auditoria = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'sync_asistencias' AND column_name = 'estado_auditoria'
    ),
    'SELECT 1',
    'ALTER TABLE sync_asistencias ADD COLUMN estado_auditoria VARCHAR(30) NOT NULL DEFAULT ''normal'' AFTER observacion'
  )
);
PREPARE stmt_sync_asistencias_auditoria FROM @sql_sync_asistencias_auditoria;
EXECUTE stmt_sync_asistencias_auditoria;
DEALLOCATE PREPARE stmt_sync_asistencias_auditoria;

INSERT INTO asistencia_schema_migrations (version)
VALUES ('002_align_prisma_mysql_schema')
ON DUPLICATE KEY UPDATE applied_at = CURRENT_TIMESTAMP(3);
