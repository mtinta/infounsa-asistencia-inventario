# Guía de Instalación, Despliegue, Mantenimiento y Pruebas - API de Inventario
**Plataforma InfoUNSA**

---

## 1. Requisitos Previos del Sistema

Asegúrese de tener instalados y configurados los siguientes componentes en el servidor o estación de desarrollo:

* **Node.js**: Versión LTS recomendada (v18, v20 o v24 de 64 bits).  
  * Descarga: [Node.js Official Downloads](https://nodejs.org/en/download)
* **npm**: Gestor de paquetes de Node (incluido automáticamente con Node.js).
* **MySQL Server**: Versión 8.0.x de 64 bits.  
  * Descarga: [MySQL Installer Community](https://dev.mysql.com/downloads/installer/)
* **Git**: Cliente de control de versiones.  
  * Descarga: [Git for Windows](https://git-scm.com/download/win)

---

## 2. Clonación del Repositorio

Abra la terminal de comandos (PowerShell o Git Bash) y clone el repositorio del proyecto:

```bash
git clone https://github.com/mtinta/infounsa-asistencia-inventario.git
cd infounsa-asistencia-inventario
git checkout develop
```

---

## 3. Instalación de Dependencias

Navegue al directorio de la API del módulo de Inventario e instale las dependencias necesarias:

```bash
cd apps/inventario/api
npm install
```

---

## 4. Configuración de la Base de Datos MySQL

### 4.1. Creación de la Base de Datos y Usuario

Acceda al cliente de **MySQL Command Line Client** o su gestor visual (Workbench, DBeaver) como usuario administrador `root` y ejecute:

```sql
-- 1. Crear base de datos dedicada para Inventario
CREATE DATABASE infounsa_inventario CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Crear usuario y otorgar privilegios de acceso
CREATE USER 'infounsa'@'localhost' IDENTIFIED BY 'contraseña_usuario_infounsa';
GRANT ALL PRIVILEGES ON infounsa_inventario.* TO 'infounsa'@'localhost';
FLUSH PRIVILEGES;
```

### 4.2. Inicialización del Esquema (Opcional)

Si cuenta con un script SQL de inicialización directa:

```sql
USE infounsa_inventario;
SOURCE apps/inventario/database/init/001_create_inventory_schema.sql;
```

---

## 5. Configuración del Archivo de Entorno `.env`

Cree el archivo `.env` dentro de la carpeta `apps/inventario/api/.env` agregando las siguientes variables de entorno (cada parámetro en una línea separada):

```env
PORT=43001
INVENTARIO_API_PORT=43001
NODE_ENV=development
DATABASE_URL="mysql://infounsa:contraseña_usuario_infounsa@localhost:3306/infounsa_inventario"
INVENTARIO_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000"
JWT_SECRET="super_secret_jwt_key_inventario_2026"
```

---

## 6. Generación del Cliente Prisma y Datos Semilla

Ejecute los comandos de ORM para mapear la base de datos e inyectar el catálogo e inventario semilla:

```bash
# 1. Generar cliente Prisma
npx prisma generate

# 2. Inyectar registros semilla (categorías, áreas, usuarios admin/operador y bienes iniciales)
npm run db:seed
```

---

## 7. Compilación Limpia del Proyecto (TypeScript)

Para asegurar un empaquetado libre de archivos antiguos en la carpeta `dist`:

### En Windows (PowerShell):

```powershell
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Remove-Item -Force tsconfig.tsbuildinfo -ErrorAction SilentlyContinue
npx tsc
```

### En Linux / macOS:

```bash
rm -rf dist tsconfig.tsbuildinfo
npx tsc
```

---

## 8. Levantamiento de la API de Inventario

### Modo Desarrollo (Watcher / Recompilación en caliente):

```bash
npm run dev
```

### Modo Producción (Ejecución del bundle compilado):

```bash
npm start
```

**Salida esperada en la consola:**

```text
[Nest] Nest application successfully started
Inventario API escuchando en puerto 43001
```

---

## 9. Guía de Resolución de Problemas

### 9.1. Error de Conexión a MySQL (`P1001: Can't reach database server`)
* Verifique que el servicio de MySQL Server esté iniciado en el puerto `3306`.
* Asegúrese de que la clave del usuario `infounsa` en `DATABASE_URL` sea idéntica a la configurada en la base de datos.

### 9.2. Incompatibilidad de Generación en Cliente Prisma
Si la aplicación no detecta los módulos generados en `../src/generated/prisma`:
1. Abra el archivo `apps/inventario/api/prisma/schema.prisma`.
2. Confirme que la definición del generador coincida con:

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}
```

3. Vuelva a ejecutar `npx prisma generate` y `npx tsc`.

---

## 10. Mantenimiento Periódico del Sistema

Siga estas tareas de mantenimiento preventivo para garantizar la continuidad operativa del sistema de Inventario:

### 10.1. Respaldos Preventivos de la Base de Datos (Backups SQL)
Genere copias de seguridad de la base de datos antes de realizar modificaciones estructurales o importar nuevos catálogos de bienes:

```bash
# Crear un respaldo comprimido de la base de datos de inventario
mysqldump -u infounsa -p infounsa_inventario > backup_inventario_$(date +%Y%m%d_%H%M%S).sql
```

Para restaurar el estado previo en caso de falla:
```bash
mysql -u infounsa -p infounsa_inventario < backup_inventario_YYYYMMDD_HHMMSS.sql
```

### 10.2. Gestión de Logs de Auditoría e Inventario
Los registros de actividad y logs del servidor se gestionan mediante **Winston** en `apps/inventario/api/logs/`.
* Se recomienda revisar mensualmente que los archivos de log antiguos sean archivados o purgados de forma automatizada.

### 10.3. Mantenimiento de Dependencias
```bash
npm audit
npm audit fix
```

---

## 11. Guía para la Implementación de Opciones y Características Futuras

Para expandir el módulo de Inventario con nuevas capacidades (p. ej. transferencias entre sedes, integración con código de barras QR avanzado o proveedores):

### 11.1. Modificación y Extensión del Esquema Prisma
1. Edite `apps/inventario/api/prisma/schema.prisma` agregando o modificando entidades (`InventoryItem`, `InventoryMovement`, `Category`, etc.).
2. Aplique la migración:
   ```bash
   npx prisma migrate dev --name nueva_funcionalidad_inventario
   ```
3. Regenere las tipografías del cliente:
   ```bash
   npx prisma generate
   ```

### 11.2. Desarrollo de Nuevos Módulos y Servicios NestJS
1. Genere los archivos requeridos dentro de `src/modules/`:
   ```bash
   npx nest g module modules/proveedores
   npx nest g controller modules/proveedores
   npx nest g service modules/proveedores
   ```
2. Defina validadores DTO con `@IsString()`, `@IsInt()`, `@IsOptional()` de `class-validator`.
3. Importe el nuevo módulo en `src/app.module.ts`.

### 11.3. Actualización de Orígenes CORS Permitidos
Si se integra un nuevo quiosco o cliente web:
1. Abra `apps/inventario/api/.env`.
2. Actualice la variable `INVENTARIO_ALLOWED_ORIGINS`:
   ```env
   INVENTARIO_ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173,http://localhost:8000,https://inventario-sede2.infounsa.edu.pe"
   ```
3. Reinicie el proceso de Node.js.

### 11.4. Despliegue de Nuevas Versiones en Producción
```bash
git pull origin develop
npm install
npx prisma generate
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
npx tsc
npm start
```

---

## 12. Ejecución de Pruebas de Calidad y Validación de Sistema

Para validar que la API de Inventario y sus flujos de stock, entradas/salidas y alertas responden adecuadamente:

### 12.1. Pruebas Unitarias e Integración de la API (NestJS)
Desde el directorio `apps/inventario/api`, ejecute las pruebas unitarias:

```bash
# Ejecutar pruebas unitarias de controladores y servicios
npm run test

# Ejecutar reporte de cobertura de código (coverage)
npm run test:cov
```

### 12.2. Pruebas de Sistema y E2E (Playwright)
Las pruebas de sistema automatizadas evalúan la consulta del catálogo, movimientos de almacén, alertas de stock mínimo y roles de acceso.

Desde la raíz del módulo de QA (`qa/scripts-pruebas-de-sistema`):

```bash
cd qa/scripts-pruebas-de-sistema

# Ejecutar únicamente la suite de pruebas del sistema de Inventario en navegador Chromium
npx playwright test tests/inventario --project=chromium
```

### 12.3. Visualización de Reportes de Calidad
Tras ejecutar la suite de pruebas, visualice el informe interactivo HTML:

```bash
# Abrir el reporte visual de Playwright en el navegador
npx playwright show-report evidencias/playwright-report
```
