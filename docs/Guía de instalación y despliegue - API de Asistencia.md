# Guía de Instalación, Despliegue, Mantenimiento y Pruebas - API de Asistencia
**Plataforma InfoUNSA**

---

## 1. Requisitos Previos del Sistema

Asegúrese de tener instalados y configurados los siguientes componentes antes de comenzar:

* **Node.js**: Versión LTS recomendada (v18, v20 o v24 de 64 bits).  
  * Descarga: [Node.js Official Downloads](https://nodejs.org/en/download)
* **npm**: Gestor de paquetes de Node (incluido automáticamente con Node.js).
* **MySQL Server**: Versión 8.0.x de 64 bits.  
  * Descarga: [MySQL Installer Community](https://dev.mysql.com/downloads/installer/)
* **Git**: Cliente de control de versiones.  
  * Descarga: [Git for Windows](https://git-scm.com/download/win)

---

## 2. Clonación del Repositorio

Abra la terminal (PowerShell o Git Bash) y clone el repositorio oficial de la plataforma:

```bash
git clone https://github.com/mtinta/infounsa-asistencia-inventario.git
cd plataforma-infounsa
git checkout develop
```

---

## 3. Instalación de Dependencias

Navegue al directorio de la API del módulo de Asistencia e instale las dependencias del proyecto:

```bash
cd apps/asistencia/api
npm install
```

---

## 4. Configuración de la Base de Datos MySQL

### 4.1. Creación de la Base de Datos y Usuario

Acceda a **MySQL Command Line Client** o su gestor predefinido (MySQL Workbench, DBeaver) con credenciales de administrador `root` y ejecute:

```sql
-- 1. Crear base de datos para Asistencia
CREATE DATABASE infounsa_asistencia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Crear usuario dedicado y otorgar privilegios
CREATE USER 'infounsa'@'localhost' IDENTIFIED BY 'contraseña_usuario_infounsa';
GRANT ALL PRIVILEGES ON infounsa_asistencia.* TO 'infounsa'@'localhost';
FLUSH PRIVILEGES;
```

### 4.2. Ejecución del Esquema Inicial (Opcional)

Si cuenta con un script SQL de inicialización directa:

```sql
USE infounsa_asistencia;
SOURCE apps/asistencia/database/init/001_create_attendance_schema.sql;
```

---

## 5. Configuración del Archivo `.env`

Cree un archivo nombrado `.env` dentro de la carpeta `apps/asistencia/api/.env` con la siguiente estructura (asegúrese de definir cada variable en una línea independiente):

```env
PORT=43000
NODE_ENV=development
DATABASE_URL="mysql://infounsa:contraseña_usuario_infounsa@localhost:3306/infounsa_asistencia"
ASISTENCIA_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://localhost:5174,http://127.0.0.1:5174"
JWT_SECRET="super_secret_jwt_key_infounsa_2026"
```

---

## 6. Generación del Cliente de Prisma y Datos Semilla

Ejecute la lectura del esquema y generación del cliente ORM Prisma dentro de `apps/asistencia/api`:

```bash
# Sincronizar o verificar estado del esquema
npx prisma generate

# Inyectar datos semilla iniciales (usuarios admin, sedes y roles por defecto)
npx prisma db seed
```

---

## 7. Compilación Limpia del Código (TypeScript)

Para evitar conflictos de caché entre compilaciones anteriores y el nuevo código en la carpeta `dist`:

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

## 8. Levantamiento de la API

### Modo Desarrollo (con Hot Reload):

```bash
npm run start:dev
```

### Modo Producción (Ejecución directa del bundle compilado):

```bash
node dist/main.js
```

**Salida esperada en la consola:**

```text
[Nest] Nest application successfully started
Asistencia API escuchando en puerto 43000
```

---

## 9. Resolución de Problemas Frecuentes

### 9.1. Error `P1001: Can't reach database server`
* Verifique que el servicio de MySQL Server esté ejecutándose en el puerto `3306`.
* Valide las credenciales de usuario y clave configuradas en `DATABASE_URL` del archivo `.env`.

### 9.2. Inconsistencias con la ruta del cliente Prisma (`@prisma/client`)
Si la aplicación indica que no encuentra la salida generada de Prisma en `../src/generated/prisma`:
1. Abra el archivo `apps/asistencia/api/prisma/schema.prisma`.
2. Verifique la definición del generador:

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

Para garantizar la estabilidad, seguridad e integridad de la API de Asistencia a lo largo del tiempo, siga estas rutinas de mantenimiento programado:

### 10.1. Respaldos Preventivos de la Base de Datos (Backups SQL)
Se recomienda programar ejecuciones periódicas de respaldo mediante `mysqldump` antes de cualquier mantenimiento o actualización mayor:

```bash
# Crear un respaldo comprimido de la base de datos de asistencia
mysqldump -u infounsa -p infounsa_asistencia > backup_asistencia_$(date +%Y%m%d_%H%M%S).sql
```

Para restaurar una copia de seguridad en caso de contingencia:
```bash
mysql -u infounsa -p infounsa_asistencia < backup_asistencia_YYYYMMDD_HHMMSS.sql
```

### 10.2. Rotación y Limpieza de Registros de Log
La API utiliza un sistema de registro basado en **Winston Daily Rotate File** ubicado en `apps/asistencia/api/logs/`.
* Los logs de error y acceso se rotan diariamente y se conservan por un periodo máximo de 14 días.
* Verifique periódicamente el tamaño del directorio `logs/` para evitar la saturación de espacio en disco.

### 10.3. Auditoría y Actualización de Dependencias
Ejecute mensualmente en la carpeta de la API:
```bash
# Verificar vulnerabilidades conocidas en paquetes de Node
npm audit

# Aplicar parches de seguridad seguros sin romper compatibilidad
npm audit fix
```

---

## 11. Guía para la Implementación de Opciones y Características Futuras

Para extender el módulo de Asistencia e incorporar nuevas funcionalidades en versiones posteriores:

### 11.1. Extensión del Esquema de Base de Datos (Prisma)
1. Modifique o agregue nuevos modelos en `apps/asistencia/api/prisma/schema.prisma`.
2. Cree y aplique la migración de la base de datos:
   ```bash
   npx prisma migrate dev --name adicion_nueva_funcionalidad
   ```
3. Regenere las definiciones TypeScript del cliente ORM:
   ```bash
   npx prisma generate
   ```

### 11.2. Incorporación de Nuevos Módulos y Endpoints en NestJS
1. Genere el módulo, controlador y servicio mediante la CLI de NestJS o manualmente dentro de `src/modules/`:
   ```bash
   # Ejemplo: Agregar módulo de notificaciones de asistencia
   npx nest g module modules/notificaciones
   npx nest g controller modules/notificaciones
   npx nest g service modules/notificaciones
   ```
2. Defina Data Transfer Objects (DTOs) para validar las entradas usando `class-validator` y `class-transformer`.
3. Registre el nuevo módulo dentro de `src/app.module.ts`.

### 11.3. Habilitación de Nuevos Orígenes CORS
Si en el futuro se despliega una nueva aplicación web o móvil que requiera consumir la API:
1. Abra el archivo `.env`.
2. Agregue la nueva URL al parámetro `ASISTENCIA_ALLOWED_ORIGINS` separado por comas:
   ```env
   ASISTENCIA_ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5174,https://nueva-app.infounsa.edu.pe"
   ```
3. Reinicie el servicio de la API para aplicar los cambios sin modificar el código fuente.

### 11.4. Despliegue Continuo de Actualizaciones (CI/CD)
Al subir cambios a las ramas principales (`develop` o `main`), ejecute la secuencia limpia de despliegue:
```bash
git pull origin develop
npm install
npx prisma generate
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
npx tsc
node dist/main.js
```

---

## 12. Ejecución de Pruebas de Calidad y Validación de Sistema

Para asegurar el correcto funcionamiento de las APIs y la integración completa del módulo de Asistencia antes de pasar a producción:

### 12.1. Pruebas Unitarias e Integración de la API (NestJS)
Desde el directorio `apps/asistencia/api`, ejecute la suite de pruebas unitarias:

```bash
# Ejecutar pruebas unitarias de controladores y servicios
npm run test

# Ejecutar cobertura de código (coverage)
npm run test:cov
```

### 12.2. Pruebas de Sistema y E2E (Playwright)
Las pruebas de sistema automatizadas evalúan los flujos completos de escaneo de DNI, filtros por fecha, sincronización offline y generación de reportes PDF.

Desde el directorio raíz de la suite QA (`qa/scripts-pruebas-de-sistema`):

```bash
cd qa/scripts-pruebas-de-sistema

# Ejecutar únicamente la suite de pruebas del sistema de Asistencia en navegador Chromium
npx playwright test tests/asistencia --project=chromium
```

### 12.3. Visualización de Reportes de Calidad
Tras completar la ejecución de las pruebas automatizadas, se genera un informe interactivo HTML:

```bash
# Abrir el reporte visual de Playwright en el navegador
npx playwright show-report evidencias/playwright-report
```
