-- Migración de unificación de esquema canónico de Asistencia (ARQ-04)
-- Unifica modelos administrativos y modelos de sincronización en las tablas canónicas principales.

-- 1. Tabla de roles
CREATE TABLE IF NOT EXISTS `roles` (
    `id` INT AUTO_INCREMENT NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(255) NULL,
    UNIQUE INDEX `roles_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Tabla de sedes
CREATE TABLE IF NOT EXISTS `sedes` (
    `id` VARCHAR(50) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `name` VARCHAR(100) NULL,
    `code` VARCHAR(50) NULL,
    `direccion` VARCHAR(255) NULL,
    `address` VARCHAR(255) NULL,
    `estado` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `sedes_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. Tabla de terminales
CREATE TABLE IF NOT EXISTS `terminals` (
    `id` VARCHAR(50) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL DEFAULT '',
    `name` VARCHAR(100) NULL,
    `code` VARCHAR(50) NULL,
    `sede_id` VARCHAR(50) NULL,
    `estado` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(30) NOT NULL DEFAULT 'activo',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `terminals_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. Tabla de usuarios (users)
CREATE TABLE IF NOT EXISTS `users` (
    `id` VARCHAR(50) NOT NULL,
    `dni` VARCHAR(20) NULL,
    `username` VARCHAR(50) NULL,
    `email` VARCHAR(100) NULL,
    `password` VARCHAR(255) NULL,
    `nombres` VARCHAR(100) NOT NULL DEFAULT '',
    `apellido_paterno` VARCHAR(100) NOT NULL DEFAULT '',
    `apellido_materno` VARCHAR(100) NOT NULL DEFAULT '',
    `nombre_completo` VARCHAR(255) NULL,
    `full_name` VARCHAR(255) NULL,
    `condicion` VARCHAR(50) NULL,
    `cargo` VARCHAR(100) NULL,
    `estado` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(30) NOT NULL DEFAULT 'activo',
    `role_id` INT NULL,
    `sede_id` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `users_dni_key`(`dni`),
    UNIQUE INDEX `users_username_key`(`username`),
    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5. Tabla de asistencia (attendance)
CREATE TABLE IF NOT EXISTS `attendance` (
    `id` VARCHAR(50) NOT NULL,
    `id_operacion_local` VARCHAR(150) NULL,
    `usuario_id` VARCHAR(50) NULL,
    `terminal_id` VARCHAR(50) NULL,
    `sede_id` VARCHAR(50) NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `fecha_hora_marca` DATETIME(3) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `observacion` TEXT NULL,
    `sync_status` VARCHAR(30) NOT NULL DEFAULT 'sincronizado',
    `estado_auditoria` VARCHAR(30) NOT NULL DEFAULT 'normal',
    UNIQUE INDEX `attendance_id_operacion_local_key`(`id_operacion_local`),
    INDEX `attendance_fecha_hora_marca_idx`(`fecha_hora_marca`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 6. Tabla de sync_logs
CREATE TABLE IF NOT EXISTS `sync_logs` (
    `id` INT AUTO_INCREMENT NOT NULL,
    `terminal_id` VARCHAR(100) NOT NULL,
    `sync_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(30) NOT NULL,
    `records_processed` INT NOT NULL DEFAULT 0,
    `error_message` TEXT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 7. Claves foráneas
ALTER TABLE `terminals` ADD CONSTRAINT `terminals_sede_id_fkey` FOREIGN KEY (`sede_id`) REFERENCES `sedes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `users` ADD CONSTRAINT `users_sede_id_fkey` FOREIGN KEY (`sede_id`) REFERENCES `sedes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_terminal_id_fkey` FOREIGN KEY (`terminal_id`) REFERENCES `terminals`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_sede_id_fkey` FOREIGN KEY (`sede_id`) REFERENCES `sedes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
