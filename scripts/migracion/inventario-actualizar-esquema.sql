-- =============================================================================================
-- ACTUALIZACION DEL ESQUEMA DE INVENTARIO (base existente de una version anterior)
--
-- Lleva una base de Inventario creada con una version anterior al esquema actual SIN borrar ni
-- sobrescribir datos y SIN volver a insertar los datos de ejemplo del script de instalacion
-- (001_create_inventory_schema.sql), que en una base con datos reales no deben cargarse.
--
-- Contenido: tablas y columnas nuevas (areas, area_id), indices, trigger de stock no negativo y
-- las restricciones de integridad de 002_harden_inventory_integrity.sql.
-- Es idempotente: se puede ejecutar mas de una vez. HAGA UN RESPALDO ANTES.
-- Uso:  mysql -u infounsa -p infounsa_inventario < scripts/migracion/inventario-actualizar-esquema.sql
-- =============================================================================================

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'operador',
  status VARCHAR(30) NOT NULL DEFAULT 'activo',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  barcode VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_stock INT NOT NULL DEFAULT 5 CHECK (min_stock >= 0),
  unit VARCHAR(30) NOT NULL DEFAULT 'unidad',
  category_id INT,
  sede_id INT NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'activo',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_inventory_items_category FOREIGN KEY (category_id) REFERENCES categories(id)
  ,INDEX idx_inventory_items_name (name)
  ,INDEX idx_inventory_items_composite (sede_id, category_id, barcode)
);

CREATE TABLE IF NOT EXISTS areas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  responsable VARCHAR(150) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT,
  type VARCHAR(20) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  user_id INT,
  area_id INT,
  destinatario_name VARCHAR(150),
  registered_at DATETIME(3) NOT NULL,
  id_operacion_local VARCHAR(150) UNIQUE,
  sync_status VARCHAR(30) NOT NULL DEFAULT 'sincronizado',
  observations TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_movements_item FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_movements_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_movements_area FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL,
  INDEX idx_movements_item_id (item_id),
  INDEX idx_movements_registered_at (registered_at),
  INDEX idx_movements_id_op_local (id_operacion_local),
  INDEX idx_movements_area_id (area_id)
);

SET @add_area_id = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE inventory_movements ADD COLUMN area_id INT NULL',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'inventory_movements'
    AND column_name = 'area_id'
);
PREPARE stmt_area_id FROM @add_area_id;
EXECUTE stmt_area_id;
DEALLOCATE PREPARE stmt_area_id;


CREATE TABLE IF NOT EXISTS alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL UNIQUE,
  triggered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at DATETIME(3),
  CONSTRAINT fk_alerts_item FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(100) NOT NULL,
  details TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

DELIMITER $$

DROP TRIGGER IF EXISTS tg_prevent_negative_stock$$
CREATE TRIGGER tg_prevent_negative_stock
BEFORE UPDATE ON inventory_items
FOR EACH ROW
BEGIN
    IF NEW.quantity < 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'No se permite stock negativo.';
    END IF;
END$$

DELIMITER ;

-- Migracion versionada para instalaciones existentes de Inventario.
-- Compatible con MySQL 8.0.16+ / 8.4. Aplicar despues de 001_create_inventory_schema.sql.
-- Este archivo es idempotente y no contiene credenciales.

CREATE TABLE IF NOT EXISTS inventory_schema_migrations (
  version VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

-- Las modificaciones deben fallar si existen datos invalidos; no se relajan
-- las restricciones para hacer pasar un despliegue.
ALTER TABLE inventory_items
  MODIFY COLUMN quantity INT NOT NULL DEFAULT 0;

ALTER TABLE inventory_movements
  MODIFY COLUMN quantity INT NOT NULL;

SET @sql_inventory_item_check = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE()
        AND table_name = 'inventory_items'
        AND constraint_name = 'chk_inventory_items_quantity_nonnegative'
        AND constraint_type = 'CHECK'
    ),
    'SELECT 1',
    'ALTER TABLE inventory_items ADD CONSTRAINT chk_inventory_items_quantity_nonnegative CHECK (quantity >= 0)'
  )
);
PREPARE stmt_inventory_item_check FROM @sql_inventory_item_check;
EXECUTE stmt_inventory_item_check;
DEALLOCATE PREPARE stmt_inventory_item_check;

SET @sql_inventory_movement_check = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE()
        AND table_name = 'inventory_movements'
        AND constraint_name = 'chk_inventory_movements_quantity_positive'
        AND constraint_type = 'CHECK'
    ),
    'SELECT 1',
    'ALTER TABLE inventory_movements ADD CONSTRAINT chk_inventory_movements_quantity_positive CHECK (quantity > 0)'
  )
);
PREPARE stmt_inventory_movement_check FROM @sql_inventory_movement_check;
EXECUTE stmt_inventory_movement_check;
DEALLOCATE PREPARE stmt_inventory_movement_check;

-- La clave unica protege la idempotencia aun si una peticion evade la API.
SET @sql_inventory_operation_unique = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'inventory_movements'
        AND column_name = 'id_operacion_local'
        AND non_unique = 0
    ),
    'SELECT 1',
    'ALTER TABLE inventory_movements ADD CONSTRAINT uq_inventory_movements_local_operation UNIQUE (id_operacion_local)'
  )
);
PREPARE stmt_inventory_operation_unique FROM @sql_inventory_operation_unique;
EXECUTE stmt_inventory_operation_unique;
DEALLOCATE PREPARE stmt_inventory_operation_unique;

DELIMITER $$

DROP TRIGGER IF EXISTS tg_prevent_negative_stock$$
CREATE TRIGGER tg_prevent_negative_stock
BEFORE UPDATE ON inventory_items
FOR EACH ROW
BEGIN
  IF NEW.quantity < 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se permite stock negativo.';
  END IF;
END$$

DELIMITER ;

INSERT INTO inventory_schema_migrations (version)
VALUES ('002_harden_inventory_integrity')
ON DUPLICATE KEY UPDATE applied_at = CURRENT_TIMESTAMP(3);

-- ---------------------------------------------------------------------------------------------
-- Complementos para bases creadas con versiones anteriores (todo condicional/idempotente)
-- ---------------------------------------------------------------------------------------------
SET @fk_area = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE inventory_movements ADD CONSTRAINT fk_movements_area FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL',
    'SELECT 1')
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE() AND table_name = 'inventory_movements'
    AND constraint_name = 'fk_movements_area' AND constraint_type = 'FOREIGN KEY'
);
PREPARE stmt_fk_area FROM @fk_area;
EXECUTE stmt_fk_area;
DEALLOCATE PREPARE stmt_fk_area;

SET @idx_area = (
  SELECT IF(COUNT(*) = 0,
    'CREATE INDEX idx_movements_area_id ON inventory_movements (area_id)',
    'SELECT 1')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'inventory_movements' AND index_name = 'idx_movements_area_id'
);
PREPARE stmt_idx_area FROM @idx_area;
EXECUTE stmt_idx_area;
DEALLOCATE PREPARE stmt_idx_area;
