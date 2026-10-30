CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS sedes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(30) NOT NULL UNIQUE,
  address VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'activo',
  role_id INT,
  sede_id INT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_users_sede FOREIGN KEY (sede_id) REFERENCES sedes(id)
);

CREATE TABLE IF NOT EXISTS terminals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'activo'
);

CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  type VARCHAR(20) NOT NULL,
  registered_at DATETIME(3) NOT NULL,
  id_operacion_local VARCHAR(150) UNIQUE,
  sync_status VARCHAR(30) NOT NULL DEFAULT 'sincronizado',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  terminal_id VARCHAR(100) NOT NULL,
  sync_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  status VARCHAR(30) NOT NULL,
  records_processed INT NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS sync_sedes (
  id CHAR(36) PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  estado BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS sync_terminales (
  id VARCHAR(50) PRIMARY KEY,
  sede_id CHAR(36) NOT NULL,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_sync_terminales_sede FOREIGN KEY (sede_id) REFERENCES sync_sedes(id)
);

CREATE TABLE IF NOT EXISTS sync_usuarios (
  id VARCHAR(50) PRIMARY KEY,
  dni VARCHAR(9) NOT NULL UNIQUE,
  nombre_completo VARCHAR(255) NOT NULL,
  estado BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS sync_asistencias (
  id CHAR(36) PRIMARY KEY,
  id_operacion_local VARCHAR(150) NOT NULL UNIQUE,
  usuario_id VARCHAR(50) NOT NULL,
  terminal_id VARCHAR(50) NOT NULL,
  sede_id CHAR(36) NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  fecha_hora_marca DATETIME(3) NOT NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  observacion TEXT,
  CONSTRAINT fk_sync_asistencias_usuario FOREIGN KEY (usuario_id) REFERENCES sync_usuarios(id),
  CONSTRAINT fk_sync_asistencias_terminal FOREIGN KEY (terminal_id) REFERENCES sync_terminales(id),
  CONSTRAINT fk_sync_asistencias_sede FOREIGN KEY (sede_id) REFERENCES sync_sedes(id)
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_attendance_user_id ON attendance (user_id);
CREATE INDEX idx_attendance_id_operacion_local ON attendance (id_operacion_local);
CREATE INDEX idx_attendance_registered_at ON attendance (registered_at);

INSERT IGNORE INTO roles (id, name, description) VALUES
(1, 'administrador', 'Administrador del sistema de asistencia'),
(2, 'operador', 'Encargado de control de personal'),
(3, 'usuario', 'Personal administrativo o docente general');

INSERT IGNORE INTO sedes (id, name, code, address) VALUES
(1, 'Sede Universitaria', 'SEDE_UNI', 'Av. Venezuela s/n'),
(2, 'Centro Historico', 'SEDE_CENTRO', 'Calle Santa Catalina 117');

INSERT IGNORE INTO terminals (id, name, code, status) VALUES
(1, 'Lector Entrada A', 'TERM_ENT_A', 'activo'),
(2, 'Lector Salida B', 'TERM_SAL_B', 'activo');

-- Los usuarios deben provisionarse mediante el seed de la API con
-- SEED_ADMIN_PASSWORD fuera del repositorio.

INSERT IGNORE INTO attendance (user_id, type, registered_at, id_operacion_local, sync_status) VALUES
(NULL, 'entrada', DATE_ADD(DATE_SUB(NOW(3), INTERVAL 3 DAY), INTERVAL 8 HOUR), 'loc-ast-0001', 'sincronizado'),
(NULL, 'salida', DATE_ADD(DATE_SUB(NOW(3), INTERVAL 3 DAY), INTERVAL 17 HOUR), 'loc-ast-0002', 'sincronizado'),
(NULL, 'entrada', DATE_ADD(DATE_SUB(NOW(3), INTERVAL 2 DAY), INTERVAL 8 HOUR), 'loc-ast-0003', 'sincronizado'),
(NULL, 'salida', DATE_ADD(DATE_SUB(NOW(3), INTERVAL 2 DAY), INTERVAL 17 HOUR), 'loc-ast-0004', 'sincronizado');

INSERT IGNORE INTO sync_logs (id, terminal_id, sync_at, status, records_processed, error_message) VALUES
(1, 'TERM-001', DATE_SUB(NOW(3), INTERVAL 2 DAY), 'success', 2, NULL),
(2, 'TERM-001', DATE_SUB(NOW(3), INTERVAL 5 HOUR), 'error', 0, 'Timeout connection to server');

INSERT IGNORE INTO sync_sedes (id, nombre, estado) VALUES
('84c8a8ca-8ea4-41e9-add6-2b077bcd701a', 'Sede Universitaria', TRUE);

INSERT IGNORE INTO sync_terminales (id, sede_id, estado) VALUES
('TERM-001', '84c8a8ca-8ea4-41e9-add6-2b077bcd701a', TRUE);

INSERT IGNORE INTO sync_usuarios (id, dni, nombre_completo, estado) VALUES
('11111111', '11111111', 'Yoset Cozco Mauri', TRUE),
('22222222', '22222222', 'Luis Quispe', TRUE),
('33333333', '33333333', 'Melvin Castro', TRUE),
('USR-101', '10101010', 'Usuario de Prueba', TRUE);
