-- =============================================================================================
-- DIAGNOSTICO DE UNA BASE DE DATOS DE UNA VERSION ANTERIOR (solo lectura: no modifica nada)
--
-- Ejecutelo sobre la base de Asistencia y sobre la de Inventario del servidor del cliente y
-- guarde/compare el resultado. Sirve para identificar de que version proviene cada base.
--
--   mysql -u infounsa -p infounsa_asistencia < scripts/migracion/diagnostico-version-anterior.sql
--   mysql -u infounsa -p infounsa_inventario < scripts/migracion/diagnostico-version-anterior.sql
-- =============================================================================================

SELECT VERSION() AS version_mysql, DATABASE() AS base_de_datos;

-- 1. Tablas y cantidad aproximada de filas
SELECT table_name AS tabla, table_rows AS filas_aprox
FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 2. Caracteristicas que permiten identificar la version (1 = presente, 0 = ausente)
SELECT 'ASISTENCIA - esquema anterior: tabla sync_usuarios' AS caracteristica,
       COUNT(*) AS presente FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'sync_usuarios'
UNION ALL
SELECT 'ASISTENCIA - sync_usuarios.condicion y cargo (desde v1.1; 2 = ambas)', COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'sync_usuarios' AND column_name IN ('condicion', 'cargo')
UNION ALL
SELECT 'ASISTENCIA - sync_asistencias.estado_auditoria (auditoria, desde v1.2)', COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'sync_asistencias' AND column_name = 'estado_auditoria'
UNION ALL
SELECT 'ASISTENCIA - sync_usuarios.nombres (nombres y apellidos separados)', COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'sync_usuarios' AND column_name = 'nombres'
UNION ALL
SELECT 'ASISTENCIA - esquema ACTUAL: users.dni (no requiere migracion)', COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'dni'
UNION ALL
SELECT 'INVENTARIO - tabla areas (desde v1.2)', COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'areas'
UNION ALL
SELECT 'INVENTARIO - inventory_movements.area_id', COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'inventory_movements' AND column_name = 'area_id'
UNION ALL
SELECT 'INVENTARIO - trigger de stock no negativo', COUNT(*) FROM information_schema.triggers
  WHERE trigger_schema = DATABASE() AND trigger_name = 'tg_prevent_negative_stock'
UNION ALL
SELECT 'INVENTARIO - restricciones de integridad aplicadas (002)', COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'inventory_schema_migrations';

-- 3. Cuentas con acceso (sin mostrar contrasenas)
SELECT username, status FROM users WHERE username IS NOT NULL;
