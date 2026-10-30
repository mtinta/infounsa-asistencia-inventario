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

INSERT IGNORE INTO areas (id, name, responsable) VALUES
(1, 'Administracion', 'Administrador General'),
(2, 'Mesa de Partes', 'Encargado de Mesa de Partes'),
(3, 'Servicios Generales', 'Responsable de Servicios Generales');


INSERT IGNORE INTO categories (id, name, description) VALUES
(1, 'Escritorio', 'Utiles de oficina, lapiceros, cuadernos, folders, etc.'),
(2, 'Limpieza', 'Materiales de aseo y mantenimiento de oficinas y locales.'),
(3, 'Material de Oficina', 'Consumibles de computacion, tintas, papeles y toners');

-- Los usuarios deben provisionarse mediante el seed de la API con
-- SEED_ADMIN_PASSWORD fuera del repositorio.

INSERT IGNORE INTO inventory_items (id, barcode, name, description, quantity, min_stock, unit, category_id, sede_id) VALUES
(1, '7501055310884', 'Monitor Dell 24', 'Monitor IPS Full HD de 24 pulgadas para oficinas', 10, 3, 'unidad', 3, 1),
(2, '7501055310990', 'Folder Manila A4', 'Paquete de 100 unidades de folders manila tamano A4', 25, 5, 'paquete', 1, 1),
(3, '7501055310111', 'Papel Bond A4 80g', 'Millar de papel bond A4 de 80 gramos marca Report', 15, 8, 'millar', 1, 1),
(4, '7501055310222', 'Laptop HP ProBook', 'Laptop de 14 pulgadas Core i5 16GB RAM para personal docente', 8, 2, 'unidad', 3, 1),
(5, '7501055310333', 'Jabon Liquido 5L', 'Galon de jabon liquido de 5 litros para limpieza de banos', 12, 4, 'galon', 2, 1),
(6, '7501055310444', 'Lapicero Faber Castell Azul', 'Caja de 50 unidades de lapiceros de tinta azul Faber Castell', 40, 10, 'caja', 1, 1),
(7, '7501055310555', 'Archivador de Palanca A4', 'Archivador de palanca ancho de carton forrado en plastico', 18, 5, 'unidad', 1, 1),
(8, '7501055310666', 'Desinfectante de Piso 5L', 'Galon de desinfectante de pisos con aroma a pino', 3, 5, 'galon', 2, 1);

INSERT IGNORE INTO inventory_movements (item_id, type, quantity, user_id, destinatario_name, registered_at, id_operacion_local, sync_status, observations) VALUES
(1, 'entrada', 10, NULL, NULL, DATE_SUB(NOW(3), INTERVAL 5 DAY), 'local-op-0001', 'sincronizado', 'Carga inicial de monitores para el laboratorio'),
(2, 'entrada', 30, NULL, NULL, DATE_SUB(NOW(3), INTERVAL 3 DAY), 'local-op-0002', 'sincronizado', 'Compra de folders manila para archivo central'),
(2, 'salida', 5, NULL, 'Mesa de Partes', DATE_SUB(NOW(3), INTERVAL 2 DAY), 'local-op-0003', 'sincronizado', 'Entrega para atencion al publico'),
(3, 'entrada', 15, NULL, NULL, DATE_SUB(NOW(3), INTERVAL 1 DAY), 'local-op-0004', 'sincronizado', 'Abastecimiento de papel bond para impresion'),
(4, 'entrada', 8, NULL, NULL, DATE_SUB(NOW(3), INTERVAL 4 DAY), 'local-op-0005', 'sincronizado', 'Adquisicion de laptops para docentes'),
(5, 'entrada', 15, NULL, NULL, DATE_SUB(NOW(3), INTERVAL 2 DAY), 'local-op-0006', 'sincronizado', 'Compra de insumos de limpieza mensuales'),
(5, 'salida', 3, NULL, 'Servicios Generales', DATE_SUB(NOW(3), INTERVAL 1 DAY), 'local-op-0007', 'sincronizado', 'Salida de jabon liquido para banos de pabellon B'),
(6, 'entrada', 50, NULL, NULL, DATE_SUB(NOW(3), INTERVAL 6 DAY), 'local-op-0008', 'sincronizado', 'Ingreso de cajas de lapiceros'),
(6, 'salida', 10, NULL, 'Decanato de Ingenieria', DATE_SUB(NOW(3), INTERVAL 3 DAY), 'local-op-0009', 'sincronizado', 'Entrega de utiles a secretaria'),
(7, 'entrada', 20, NULL, NULL, DATE_SUB(NOW(3), INTERVAL 3 DAY), 'local-op-0010', 'sincronizado', 'Ingreso de archivadores de palanca'),
(7, 'salida', 2, NULL, 'Direccion de Escuela', DATE_SUB(NOW(3), INTERVAL 12 HOUR), 'local-op-0011', 'sincronizado', 'Archivadores para legajos de alumnos'),
(8, 'entrada', 5, NULL, NULL, DATE_SUB(NOW(3), INTERVAL 5 DAY), 'local-op-0012', 'sincronizado', 'Compra inicial de desinfectante de pisos'),
(8, 'salida', 2, NULL, 'Personal de Limpieza', DATE_SUB(NOW(3), INTERVAL 1 DAY), 'local-op-0013', 'sincronizado', 'Uso en mantenimiento de laboratorios');
