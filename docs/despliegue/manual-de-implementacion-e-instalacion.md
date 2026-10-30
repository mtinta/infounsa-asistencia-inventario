# Manual de Implementación e Instalación — Plataforma InfoUNSA
**Módulos:** Control de Asistencia y Gestión de Inventario  
**Versión del Documento:** 1.0.0  
**Fecha de Publicación:** 2026-10-29  
**Estándar de Calidad:** ISO/IEC 29110 (Perfiles de Ingeniería de Software para VSE) e ISO/IEC 25010 (Calidad del Producto Software)  
**Clasificación:** Documentación Técnica de Despliegue e Infraestructura  

---

## 1. Introducción y Objetivos del Manual

El presente **Manual de Implementación e Instalación** proporciona la guía técnica oficial, exhaustiva y paso a paso para el aprovisionamiento, compilación, despliegue y puesta en marcha de la **Plataforma InfoUNSA** en sus dos subsistemas críticos:
1. **Subsistema de Control de Asistencia (AST):** API REST centralizada en NestJS y aplicación cliente de escritorio Kiosco basada en Electron + React con capacidades de marcación offline (Outbox Pattern) y sincronización con SQLite cifrado.
2. **Subsistema de Gestión de Inventario (INV):** API REST centralizada en NestJS y aplicación cliente de escritorio de administración/almacén basada en Electron + React con control transaccional de existencias, prevención de stock negativo mediante bloqueo pesimista y lectura de códigos de barras EAN.

### 1.1 Audiencia Objetivo
Este documento está dirigido a:
- **Ingenieros de DevOps y Administradores de Sistemas:** Responsables de aprovisionar la infraestructura del servidor central, configurar contenedores Docker, bases de datos MySQL y proxies inversos.
- **Técnicos de Soporte y Operaciones de TI:** Responsables de desplegar e instalar los paquetes de escritorio `.exe` en los terminales de usuario y kioscos de las distintas sedes universitarias, así como de configurar la conectividad y verificar la sincronización de datos.

### 1.2 Alcance del Sistema
El alcance comprende el despliegue tanto en entornos de pruebas/calidad (QA) como en servidores de producción institucional, así como la distribución asistida de instaladores de escritorio interactivos NSIS para el sistema operativo Microsoft Windows (Windows 10 / Windows 11).

---

## 2. Topología de Red y Arquitectura de Despliegue

La solución adopta una arquitectura cliente-servidor distribuida con tolerancia a fallos de red local:

```mermaid
flowchart TD
    subgraph Kioscos["Terminales Kiosco y Almacén (Windows 10/11)"]
        K1["Kiosco Asistencia Electron<br/>(Ruta personalizada / SQLite local)"]
        K2["Kiosco Inventario Electron<br/>(Ruta personalizada / SQLite local)"]
    end

    subgraph RedLAN["Red Institucional InfoUNSA (LAN / VPN / HTTPS)"]
        K1 -->|HTTP/HTTPS :43000| NGINX["Proxy Inverso Nginx / Balanceador"]
        K2 -->|HTTP/HTTPS :43001| NGINX
    end

    subgraph ServidorCentral["Servidor Central (Linux / Windows Server)"]
        NGINX -->|Reverse Proxy| API_AST["API Asistencia (NestJS)<br/>Puerto interno: 43000"]
        NGINX -->|Reverse Proxy| API_INV["API Inventario (NestJS)<br/>Puerto interno: 43001"]

        API_AST -->|Conexión Prisma / Pool 10 conn| DB_AST[("MySQL 8.4 Server<br/>infounsa_asistencia<br/>Puerto: 3306 / 43306")]
        API_INV -->|Conexión Prisma / Pool 10 conn| DB_INV[("MySQL 8.4 Server<br/>infounsa_inventario<br/>Puerto: 3307 / 43307")]
    end
```

### 2.1 Distribución de Puertos de Red

| Servicio / Componente | Puerto Predeterminado | Protocolo | Tipo de Tráfico | Ámbito de Red |
| :--- | :--- | :--- | :--- | :--- |
| **API Asistencia** | `43000` | HTTP / TCP | REST API JSON | Red Universitaria / Interna |
| **API Inventario** | `43001` | HTTP / TCP | REST API JSON | Red Universitaria / Interna |
| **MySQL Asistencia** | `3306` (host: `43306`) | TCP | Consultas SQL | Solo Servidor / Contenedores |
| **MySQL Inventario** | `3307` (host: `43307`) | TCP | Consultas SQL | Solo Servidor / Contenedores |
| **Proxy Inverso Nginx** | `80` / `443` | HTTP / HTTPS | Tráfico Web Kioscos | Red Institucional General |
| **Adminer Asistencia** | `48080` (opcional dev/qa) | HTTP | Panel de Gestión BD | Solo Administración TI |
| **Adminer Inventario** | `48081` (opcional dev/qa) | HTTP | Panel de Gestión BD | Solo Administración TI |

---

## 3. Requisitos del Entorno

### 3.1 Servidor Central (Backend y Bases de Datos)

#### Requisitos de Hardware Mínimos y Recomendados
* **Procesador (CPU):** 4 núcleos (x86_64) mínimo; 8 núcleos recomendados para alta concurrencia.
* **Memoria RAM:** 8 GB mínimo (4 GB asignados a Docker/MySQL); 16 GB recomendados.
* **Almacenamiento:** 100 GB en disco SSD de alto rendimiento (para persistencia de logs, base de datos y volumen de transacciones de auditoría).
* **Adaptador de Red:** Interfaz Gigabit Ethernet (1000 Mbps) con IP estática asignada.

#### Requisitos de Software
* **Sistema Operativo:** Ubuntu Server 22.04 LTS / 24.04 LTS o Windows Server 2019 / 2022.
* **Node.js:** Versión LTS compatible (`v18.x`, `v20.x` o `v24.x` de 64 bits).
* **Gestor de Paquetes:** `npm` v9+ o `pnpm` v9+.
* **Motor de Contenedores:** Docker Engine v25.0+ y Docker Compose v2.20+.
* **Motor de Base de Datos:** MySQL Server 8.0.x u 8.4 LTS (o instancias Docker oficiales de MySQL 8.4). *Nota:* Si se despliega con Docker Compose de producción institucional, se incluyen contenedores MySQL 8.4 preconfigurados.
* **Git:** Cliente de control de versiones v2.30+.

### 3.2 Terminales de Trabajo y Kioscos (Clientes de Escritorio)

#### Requisitos de Hardware
* **Procesador (CPU):** Intel Core i3 / AMD Ryzen 3 o superior (x64).
* **Memoria RAM:** 4 GB mínimo (8 GB recomendados para estaciones de trabajo de almacén).
* **Almacenamiento Libre:** Mínimo 2 GB de espacio libre en disco para la aplicación, librerías Chromium/Electron y caché SQLite.
* **Periféricos:**
  * Lector de código de barras USB/Inalámbrico (configurado en modo emulación de teclado HID / terminador CR).
  * Pantalla táctil o monitor con resolución mínima de `1024x768` (óptimo `1920x1080`).
* **Conectividad:** Tarjeta de red Ethernet o Wi-Fi conectada a la red interna institucional.

#### Requisitos de Software
* **Sistema Operativo:** Microsoft Windows 10 (versión 21H2 o superior) o Windows 11 (64 bits).
* **Permisos de Cuenta:** Privilegios de administrador local para la ejecución del instalador NSIS (si se instala en `Archivos de Programa` o rutas de sistema) o permisos de usuario estándar si se instala en directorio de usuario.

---

## 4. Configuración de Variables de Entorno (`.env`)

Toda la infraestructura centralizada se parametriza mediante un archivo `.env` ubicado en la raíz del repositorio o montado en el servidor de producción.

> [!IMPORTANT]
> Nunca versione el archivo `.env` real en el repositorio Git. Copie la plantilla `.env.example` y establezca contraseñas y llaves JWT criptográficamente seguras (mínimo 32 caracteres generados aleatoriamente).

### 4.1 Creación del Archivo de Entorno

```bash
# En el servidor central:
cp .env.example .env
chmod 600 .env
```

### 4.2 Matriz y Diccionario de Variables de Configuración

```ini
# ==============================================================================
# CONFIGURACIÓN GENERAL DEL MONOREPO INFOUNSA
# ==============================================================================
# Directorio externo de almacenamiento de volúmenes persistentes y logs de BD
INFOUNSA_CONTAINERS_PATH=../containers

# Contraseña maestra de seguridad para la ejecución de los seeders iniciales
# Requerida obligatoriamente al poblar tablas maestras en Asistencia e Inventario
SEED_ADMIN_PASSWORD=GenerarPasswordMaestroAdmin2026!

# ==============================================================================
# SUBSISTEMA DE CONTROL DE ASISTENCIA (AST)
# ==============================================================================
# Puerto de escucha de la API NestJS de Asistencia
ASISTENCIA_API_PORT=43000

# Puerto de red expuesto por MySQL de Asistencia en el host
ASISTENCIA_DB_PORT=43306

# Parámetros de base de datos MySQL
ASISTENCIA_DB_NAME=infounsa_asistencia
ASISTENCIA_DB_USER=infounsa
ASISTENCIA_DB_PASSWORD=PasswordSeguroAsistencia2026*
ASISTENCIA_DB_ROOT_PASSWORD=PasswordRootAsistencia2026*

# Cadena de conexión JDBC/Prisma consumida por la API de Asistencia
# Si se ejecuta con Docker Compose: host "asistencia-db", puerto interno 3306
ASISTENCIA_DATABASE_URL=mysql://infounsa:PasswordSeguroAsistencia2026*@asistencia-db:3306/infounsa_asistencia

# Llave criptográfica secreta para firma y verificación de tokens JWT
JWT_SECRET=c2VjdXJlX2p3dF9hc2lzdGVuY2lhX3NlY3JldF9rZXlfMjAyNg==

# Puerto para interfaz administrativa web Adminer (opcional, QA/Dev)
ASISTENCIA_ADMINER_PORT=48080

# Orígenes permitidos por CORS (separados por coma)
ASISTENCIA_ALLOWED_ORIGINS=http://localhost:48000,http://127.0.0.1:48000,http://localhost:43000,http://localhost:5173,http://localhost:8088

# Límites del pool de conexiones MySQL
ASISTENCIA_DB_CONNECTION_LIMIT=10
ASISTENCIA_DB_CONNECT_TIMEOUT_MS=5000
ASISTENCIA_DB_ACQUIRE_TIMEOUT_MS=5000
ASISTENCIA_DB_IDLE_TIMEOUT_MS=60000

# ==============================================================================
# SUBSISTEMA DE GESTIÓN DE INVENTARIO (INV)
# ==============================================================================
# Puerto de escucha de la API NestJS de Inventario
INVENTARIO_API_PORT=43001
INVENTARIO_API_HOST_PORT=3011
INVENTARIO_WEB_PORT=5173

# Puerto de red expuesto por MySQL de Inventario en el host
INVENTARIO_DB_PORT=43307

# Parámetros de base de datos MySQL
INVENTARIO_DB_NAME=infounsa_inventario
INVENTARIO_DB_USER=infounsa
INVENTARIO_DB_PASSWORD=PasswordSeguroInventario2026*
INVENTARIO_DB_ROOT_PASSWORD=PasswordRootInventario2026*

# Cadena de conexión Prisma consumida por la API de Inventario
# Si se ejecuta con Docker Compose: host "inventario-db", puerto interno 3306
INVENTARIO_DATABASE_URL=mysql://infounsa:PasswordSeguroInventario2026*@inventario-db:3306/infounsa_inventario

# Llave criptográfica secreta para tokens JWT de Inventario
JWT_SECRET_INVENTARIO=c2VjdXJlX2p3dF9pbnZlbnRhcmlvX3NlY3JldF9rZXlfMjAyNg==

# Puerto para interfaz administrativa web Adminer (opcional, QA/Dev)
INVENTARIO_ADMINER_PORT=48081

# Orígenes permitidos por CORS (separados por coma)
INVENTARIO_ALLOWED_ORIGINS=http://localhost:48000,http://127.0.0.1:48000,http://localhost:43001,http://localhost:5173,http://localhost:8088

# Límites del pool de conexiones MySQL
INVENTARIO_DB_CONNECTION_LIMIT=10
INVENTARIO_DB_CONNECT_TIMEOUT_MS=5000
INVENTARIO_DB_ACQUIRE_TIMEOUT_MS=5000
INVENTARIO_DB_IDLE_TIMEOUT_MS=60000
```

---

## 5. Compilación y Despliegue de las APIs Backend

Se describen a continuación las dos metodologías de despliegue homologadas:
* **Método A (Recomendado):** Despliegue en Contenedores mediante Docker Compose.
* **Método B:** Despliegue Nativo en Servidor (Linux / Windows Server) con Node.js y MySQL host.

---

### 5.1 Método A: Despliegue con Docker Compose (Recomendado)

El despliegue con Docker Compose encapsula las APIs NestJS y los servidores MySQL 8.4 en redes aisladas (`asistencia-net` e `inventario-net`), garantizando la paridad exacta entre ambientes.

#### Paso 1: Clonar el Repositorio
```bash
git clone https://github.com/mtinta/infounsa-asistencia-inventario.git
cd plataforma-infounsa
git checkout develop
```

#### Paso 2: Configurar el Archivo de Entorno
Cree y edite el archivo `.env` según lo indicado en la Sección 4:
```bash
cp .env.example .env
nano .env
```

#### Paso 3: Construcción e Inicio de Contenedores
Ejecute la construcción de imágenes y levantamiento en segundo plano:
```bash
# Para entorno de desarrollo / QA integrado:
docker compose up -d --build

# O para entorno de producción con compose dedicado:
docker compose -f docker-compose.prod.yml up -d --build
```

#### Paso 4: Verificación de Contenedores y Healthchecks
Compruebe que todos los contenedores reporten estado `healthy` o `Up`:
```bash
docker compose ps
```
Debe visualizar los siguientes servicios en ejecución:
- `asistencia-db` (healthy)
- `asistencia-api` (Up)
- `inventario-db` (healthy)
- `inventario-api` (Up)

#### Paso 5: Inicialización de Migraciones y Semillas de Datos (Seeds)
Las migraciones de esquemas Prisma se aplican ejecutando los comandos dentro de los contenedores respectivos:

```bash
# --- Módulo de Asistencia ---
# Ejecutar migraciones de base de datos
docker compose exec asistencia-api npx prisma migrate deploy

# Poblar catálogo maestro inicial de usuarios, roles y sedes
docker compose exec -e SEED_ADMIN_PASSWORD="<SuPasswordAdmin>" asistencia-api npm run db:seed

# --- Módulo de Inventario ---
# Ejecutar migraciones de base de datos
docker compose exec inventario-api npx prisma migrate deploy

# Poblar categorías y catálogo inicial de bienes
docker compose exec -e SEED_ADMIN_PASSWORD="<SuPasswordAdmin>" inventario-api npm run db:seed
```

---

### 5.2 Método B: Despliegue Nativo en Servidor (Node.js + MySQL Host)

Este método es idóneo cuando el servidor central ejecuta MySQL como servicio del sistema (por ejemplo, servicio `MySQL80` en Windows Server o `mysql.service` en Ubuntu) y las APIs se ejecutan gestionadas por **PM2** o **NSSM**.

#### 5.2.1 Preparación de la Base de Datos MySQL en el Host
Inicie sesión en el cliente MySQL administrativo y cree los esquemas y usuarios dedicados:

```sql
-- Base de datos y usuario de Asistencia
CREATE DATABASE IF NOT EXISTS infounsa_asistencia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'infounsa_asistencia'@'localhost' IDENTIFIED BY 'PasswordSeguroAsistencia2026*';
GRANT ALL PRIVILEGES ON infounsa_asistencia.* TO 'infounsa_asistencia'@'localhost';

-- Base de datos y usuario de Inventario
CREATE DATABASE IF NOT EXISTS infounsa_inventario CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'infounsa_inventario'@'localhost' IDENTIFIED BY 'PasswordSeguroInventario2026*';
GRANT ALL PRIVILEGES ON infounsa_inventario.* TO 'infounsa_inventario'@'localhost';

FLUSH PRIVILEGES;
```

#### 5.2.2 Despliegue de la API de Asistencia (`apps/asistencia/api`)
```bash
cd apps/asistencia/api

# 1. Instalar dependencias de producción y desarrollo
npm install

# 2. Configurar el archivo .env específico de la API si no usa el root
# Asegurar DATABASE_URL=mysql://infounsa_asistencia:Password...@localhost:3306/infounsa_asistencia
# y PORT=43000

# 3. Generar el cliente de Prisma para MySQL
npx prisma generate

# 4. Desplegar migraciones del esquema
npx prisma migrate deploy

# 5. Ejecutar la semilla inicial
npm run db:seed

# 6. Compilar el código TypeScript a JavaScript
npm run build

# 7. Iniciar con PM2 (en segundo plano y reinicio ante caídas)
pm2 start dist/main.js --name "infounsa-asistencia-api"
pm2 save
```

#### 5.2.3 Despliegue de la API de Inventario (`apps/inventario/api`)
```bash
cd apps/inventario/api

# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno (PORT=43001)
# Asegurar DATABASE_URL=mysql://infounsa_inventario:Password...@localhost:3306/infounsa_inventario

# 3. Generar el cliente de Prisma para MySQL
npx prisma generate

# 4. Desplegar migraciones del esquema
npx prisma migrate deploy

# 5. Ejecutar la semilla inicial
npm run db:seed

# 6. Compilar TypeScript
npm run build

# 7. Iniciar con PM2
pm2 start dist/main.js --name "infounsa-inventario-api"
pm2 save
```

---

## 6. Empaquetado y Distribución de Instaladores Desktop Windows NSIS (`.exe`)

Los clientes Kiosco de Asistencia e Inventario están construidos con Electron y React/Vite. El empaquetado genera instaladores ejecutables de Windows autónomos (`.exe`) basados en el estándar industrial **NSIS** (Nullsoft Scriptable Install System).

### 6.1 Configuración de Instalador con Selección de Directorio Personalizado
De acuerdo a las directivas de control y despliegue del proyecto (Ticket `03`), ambos archivos `package.json` de escritorio disponen de la configuración interactiva de NSIS:

```json
"build": {
  "win": {
    "target": "nsis",
    "artifactName": "InfoUNSA-${name}-Instalador-${version}.${ext}"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  }
}
```

* **`oneClick: false`:** Desactiva la instalación en segundo plano de un solo clic, habilitando un asistente paso a paso con pantallas explicativas.
* **`allowToChangeInstallationDirectory: true`:** Habilita el control interactivo para que el administrador o usuario pueda elegir la ruta destino deseada (por ejemplo, `D:\Sistemas\InfoUNSA\Asistencia` en equipos con particiones secundarias o políticas institucionales específicas).
* **`createDesktopShortcut: true` / `createStartMenuShortcut: true`:** Garantiza la creación de accesos directos tanto en el Escritorio de Windows como en el Menú Inicio.

### 6.2 Compilación y Generación de los Instaladores `.exe`

> [!NOTE]
> Se recomienda compilar los instaladores ejecutables en una estación de desarrollo o runner CI con **Windows 10 / 11** o Windows Server.

#### 6.2.1 Generar Instalador de Control de Asistencia
```powershell
# Navegar al directorio de escritorio de Asistencia
cd apps/asistencia/desktop

# Instalar dependencias si no se ha hecho previamente
npm install

# Ejecutar el script dist (ejecuta reset-local-data.js, tsc, vite build y electron-builder)
npm run dist
```
* **Artefacto generado:** `apps/asistencia/desktop/dist/InfoUNSA-Asistencia-Instalador-1.0.0.exe`

#### 6.2.2 Generar Instalador de Gestión de Inventario
```powershell
# Navegar al directorio de escritorio de Inventario
cd apps/inventario/desktop

# Instalar dependencias
npm install

# Ejecutar el script dist (ejecuta tsc, vite build y electron-builder)
npm run dist
```
* **Artefacto generado:** `apps/inventario/desktop/dist/InfoUNSA-Inventario-Instalador-1.0.0.exe`

---

### 6.3 Proceso de Instalación Paso a Paso en Windows

A continuación se detalla la guía visual para el personal técnico que instalará el ejecutable en cada kiosco o estación:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Administrador de TI / Operador
    participant EXE as InfoUNSA-*-Instalador.exe (NSIS)
    participant OS as Sistema Operativo Windows
    participant Disk as Disco / Directorio de Destino

    Admin->>EXE: Ejecuta como Administrador
    EXE->>Admin: Pantalla 1: Asistente de Bienvenida
    Admin->>EXE: Clic en "Siguiente"
    EXE->>Admin: Pantalla 2: Elegir Lugar de Instalación
    Note over Admin,EXE: Permite ruta por defecto o pulsar "Examinar..."<br/>(ej. D:\InfoUNSA\Kiosco)
    Admin->>EXE: Selecciona ruta deseada y pulsa "Instalar"
    EXE->>Disk: Descomprime binarios, Chromium y módulos locales
    EXE->>OS: Registra accesos directos en Escritorio e Inicio
    EXE->>Admin: Pantalla 3: Instalación Completada
    Admin->>EXE: Marca "Ejecutar Aplicación" y pulsa "Terminar"
```

#### Paso 1: Ejecución del Instalador
1. Copie el archivo `.exe` en el equipo de destino mediante memoria USB segura o recurso de red compartido.
2. Haga clic derecho sobre el instalador (`InfoUNSA-Asistencia-Instalador-1.0.0.exe` o `InfoUNSA-Inventario-Instalador-1.0.0.exe`) y seleccione **"Ejecutar como administrador"**.
3. Si Windows Defender SmartScreen muestra una advertencia preventiva de aplicación desconocida, haga clic en *"Más información"* y luego en *"Ejecutar de todas formas"*.

#### Paso 2: Asistente de Bienvenida
Aparecerá el asistente NSIS con el mensaje de bienvenida oficial de **Plataforma InfoUNSA**. Haga clic en **Siguiente**.

#### Paso 3: Selección de Directorio de Instalación (Ruta Personalizada)
El asistente mostrará el cuadro de diálogo para la selección de carpeta de destino:
* **Ruta por defecto:** `C:\Program Files\InfoUNSA Asistencia` (o `InfoUNSA Inventario`).
* **Personalización:** Haga clic en el botón **"Examinar..."** (*Browse...*) para elegir cualquier otra unidad o partición (por ejemplo `D:\Programas\InfoUNSA\Asistencia`).
* El asistente validará en tiempo real el espacio libre requerido y el espacio disponible en la unidad seleccionada.
* Haga clic en **Instalar**.

#### Paso 4: Progreso y Creación de Accesos Directos
El instalador extraerá los componentes empaquetados y creará automáticamente:
* Acceso directo en el **Escritorio**.
* Acceso directo en la carpeta **Plataforma InfoUNSA** del **Menú Inicio**.
* Desinstalador registrado en el Panel de Control (*Agregar o quitar programas*).

#### Paso 5: Finalización
Haga clic en **Terminar**. Puede mantener marcada la opción *"Ejecutar InfoUNSA"* para abrir la aplicación de inmediato.

---

## 7. Configuración de Conectividad Kiosco - API

Una vez abierta la aplicación de escritorio en el Kiosco o estación de trabajo, se debe enlazar con el servidor central donde se encuentran alojadas las APIs.

### 7.1 Configuración Pre-Empaquetado (`desktop-config.json`)
Si se conoce previamente la IP o nombre de host del servidor central, puede preconfigurarse en el archivo `desktop-config.json` de cada módulo antes de ejecutar `npm run dist`:
```json
{
  "api_host": "192.168.1.100"
}
```
Esto establecerá que la aplicación busque por defecto `http://192.168.1.100:43000` (Asistencia) o `http://192.168.1.100:43001` (Inventario).

### 7.2 Configuración Interactiva desde la Interfaz de Usuario
El personal técnico puede modificar la URL de la API y los parámetros del terminal directamente en la pantalla de la aplicación sin necesidad de reinstalar:

#### En el Kiosco de Asistencia:
1. Inicie sesión con la cuenta de administrador inicial (DNI: `00000000` o la cuenta provista en el seeder).
2. Diríjase a la pestaña **Configuración** (ícono de engranaje).
3. En la tarjeta **Interoperabilidad y Sincronización**, complete los siguientes campos:
   * **Ruta API Principal (Servidor):** Ingrese la URL completa del backend, por ejemplo `http://192.168.1.100:43000` o `https://asistencia.infounsa.edu.pe`.
   * **Terminal ID:** Identificador único del Kiosco (ej. `KIOSCO-SEDE-CENTRAL-01`).
   * **Sede ID:** Identificador UUID de la sede universitaria a la que pertenece el terminal.
   * **Intervalo de Sincronización:** Frecuencia en segundos de la cola Outbox (Recomendado: `30` segundos).
4. Guarde los cambios. El sistema verificará de inmediato la comunicación con el servidor central mostrando una notificación flotante de confirmación.

#### En el Kiosco de Inventario:
1. Inicie sesión con credenciales administrativas o de almacenero.
2. Abra el menú de **Ajustes / Conexión**.
3. Verifique o modifique la URL de la API de Inventario (`http://192.168.1.100:43001`).
4. Pulse en **"Probar Conexión"**.

---

## 8. Checklist de Validación Post-Instalación y Pruebas de Humo

Utilice la siguiente lista de verificación técnica antes de entregar el sistema a los usuarios operativos finales:

### 8.1 Verificación de Infraestructura y Backend

- [ ] **Servicio MySQL:** El motor MySQL 8.x se encuentra en ejecución y escuchando peticiones en los puertos asignados (`43306` / `43307` o `3306`).
- [ ] **Esquemas de Base de Datos:** Las bases de datos `infounsa_asistencia` e `infounsa_inventario` tienen todas las tablas creadas tras la ejecución de `prisma migrate deploy`.
- [ ] **Datos Maestros (Seeds):** Existen los roles administrativos y usuarios maestros predeterminados generados por `npm run db:seed`.
- [ ] **Healthcheck API Asistencia:** Al consultar `curl http://localhost:43000/api/v1/health` (o la ruta raíz de la API) se obtiene código de estado HTTP `200 OK`.
- [ ] **Healthcheck API Inventario:** Al consultar `curl http://localhost:43001/api/v1/health` se obtiene código de estado HTTP `200 OK`.
- [ ] **Políticas CORS:** El archivo `.env` incluye la IP o dominio de los clientes que accederán a los servicios en `ASISTENCIA_ALLOWED_ORIGINS` e `INVENTARIO_ALLOWED_ORIGINS`.

### 8.2 Verificación de los Clientes de Escritorio Windows

- [ ] **Instalación en Ruta Personalizada:** El instalador NSIS permitió seleccionar una carpeta distinta de la predeterminada y los binarios quedaron alojados correctamente en dicha ubicación.
- [ ] **Accesos Directos:** Se crearon los accesos directos en el Escritorio y Menú Inicio con el ícono corporativo de InfoUNSA.
- [ ] **Inicio de la Aplicación:** La aplicación arranca sin pantallas en blanco ni advertencias de librerías DLL faltantes.
- [ ] **Enlace con la API:** En la vista de Configuración, la prueba de conexión a la API reporta estado "En línea" / "Conectado".
- [ ] **Persistencia Local SQLite:** La base de datos local SQLite/SQLCipher se crea en el directorio de datos de usuario (`%AppData%/infounsa-asistencia/` o `%AppData%/infounsa-inventario/`).
- [ ] **Prueba de Marcación / Transacción Online:**
  - En Asistencia: Ingrese un DNI válido; la marca se registra y la cola Outbox se sincroniza inmediatamente con el servidor central.
  - En Inventario: Registre un movimiento de entrada o consulte el catálogo de bienes; los datos se reflejan en tiempo real.
- [ ] **Prueba de Resiliencia Fuera de Línea (Offline):**
  1. Desconecte el cable de red o apague el Wi-Fi del Kiosco.
  2. Registre una marcación de asistencia en el Kiosco.
  3. Verifique que la aplicación informe: *"Guardado localmente (Offline)"* y que la cola muestre `1 pendiente`.
  4. Reconecte la red del equipo.
  5. Espere el intervalo de sincronización o pulse *"Sincronizar ahora"*; verifique que el contador de pendientes retorne a `0` y que la marca se visualice en la bitácora central.
- [ ] **Generación de Reportes:** Se comprueba la descarga satisfactoria de reportes en PDF y exportación en Excel sin errores de formato.

---

## 9. Diagnóstico y Resolución de Problemas Frecuentes (Troubleshooting)

### Problema 1: El Kiosco muestra "Error de Conexión con el Servidor" (`ECONNREFUSED` / `ETIMEDOUT`)
* **Causa:** La API central está detenida, el firewall del servidor bloquea el puerto, o la URL configurada en el cliente es incorrecta.
* **Solución:**
  1. Verifique en el servidor que la API esté corriendo: `docker compose ps` o `pm2 status`.
  2. En el servidor, valide que el puerto esté abierto en el firewall:
     ```bash
     # En Ubuntu Server UFW:
     sudo ufw allow 43000/tcp
     sudo ufw allow 43001/tcp
     
     # En Windows Server PowerShell:
     New-NetFirewallRule -DisplayName "InfoUNSA APIs" -Direction Inbound -LocalPort 43000,43001 -Protocol TCP -Action Allow
     ```
  3. Desde el terminal de Windows del Kiosco, ejecute un test de conectividad por PowerShell:
     ```powershell
     Test-NetConnection -ComputerName <IP_SERVIDOR> -Port 43000
     ```

### Problema 2: Error de CORS en el navegador o consola de Electron (`Access-Control-Allow-Origin`)
* **Causa:** El origen desde el cual emite solicitudes el cliente no está autorizado en las variables de entorno de la API.
* **Solución:** Agregue el origen correspondiente en `.env` (variable `ASISTENCIA_ALLOWED_ORIGINS` e `INVENTARIO_ALLOWED_ORIGINS`) y reinicie la API:
  ```bash
  docker compose restart asistencia-api inventario-api
  ```

### Problema 3: Error de autenticación o token expirado en la sincronización
* **Causa:** Las llaves `JWT_SECRET` cambiaron en el servidor, o el reloj del Kiosco está desfasado respecto al servidor NTP institucional.
* **Solución:**
  1. Asegúrese de sincronizar la hora y fecha del equipo Kiosco con el servidor de hora de Windows (`w32tm /resync`).
  2. Cierre sesión e inicie sesión nuevamente en el Kiosco para renovar las credenciales en el almacén seguro.

### Problema 4: La base de datos local SQLite está corrupta o bloqueada
* **Causa:** Apagado abrupto de energía en el terminal durante una escritura en disco.
* **Solución:**
  1. En la pestaña de Configuración del Kiosco, use la opción técnica *"Restablecer Datos Locales / Limpiar Cola"*.
  2. Alternativamente, cierre la aplicación y elimine el archivo `.db` en `%AppData%/infounsa-asistencia/database.sqlite`; al reiniciar, la aplicación reconstruirá la estructura limpia y descargará el padrón desde el servidor central.

---

## 10. Procedimiento de Actualización y Mantenimiento

### 10.1 Actualización de las APIs Backend
1. Incorpore los cambios desde el repositorio Git:
   ```bash
   git pull origin develop
   ```
2. Ejecute nuevas migraciones si las hubiera:
   ```bash
   docker compose exec asistencia-api npx prisma migrate deploy
   docker compose exec inventario-api npx prisma migrate deploy
   ```
3. Reinicie los servicios sin pérdida de disponibilidad prolongada:
   ```bash
   docker compose up -d --build
   ```

### 10.2 Actualización de Clientes de Escritorio
1. Genere el nuevo instalador NSIS incrementando la versión en `package.json` (ejemplo: `1.0.1`).
2. Distribuya y ejecute el nuevo `.exe` en los Kioscos.
3. El instalador interactivo detectará la instalación previa y actualizará los binarios respetando la base de datos local SQLite y las configuraciones de ruta preestablecidas.
