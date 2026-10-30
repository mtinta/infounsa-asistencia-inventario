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
