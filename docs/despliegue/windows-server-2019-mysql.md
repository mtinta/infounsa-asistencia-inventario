# Despliegue de Asistencia e Inventario en Windows Server 2019 con MySQL

Fecha de revision: 2026-09-16

> **Estado:** documento historico para una alternativa de contenedores Windows. No es la ruta aprobada para produccion. La ruta aprobada se preparara en `release/windows-native-services` con servicios nativos de Windows; consulte [el flujo de ramas y validacion](./flujo-docker-qa-y-windows-nativo.md).

Este documento aplica unicamente a las APIs de **Asistencia** e **Inventario**, sus bases MySQL y los contenedores Windows. WordPress queda fuera de alcance.

## Arquitectura de produccion

- MySQL 8.x se ejecuta como servicio Windows en el servidor y escucha localmente en el puerto 3306.
- Docker Engine se ejecuta como servicio Windows con Windows Containers habilitado.
- Las APIs se ejecutan como los contenedores `infounsa-asistencia-container` y `infounsa-inventario-container`.
- Los contenedores acceden al MySQL del host mediante `host.docker.internal`; no se usa `network_mode: host`.
- `docker compose` mantiene los contenedores con `restart: always` y sus healthchecks.

El orden recomendado es: MySQL -> Docker -> tarea programada de inicio -> Compose -> healthchecks.
No se deben registrar las APIs Node como servicios Windows adicionales porque duplicaria el runtime y el control de reinicio de Docker.

## Cambios aplicados al codigo

- TLS de MySQL es obligatorio cuando `NODE_ENV=production`.
- `MYSQL_SSL_REJECT_UNAUTHORIZED=false` queda bloqueado en produccion.
- La CA puede cargarse desde `MYSQL_SSL_CA_FILE`.
- El pool por API queda en 10 conexiones por defecto, con timeouts configurables.
- Se retiro el pool `mysql2` duplicado que no era consumido por los modulos Nest; Inventario conserva `mysql2` solo para su prueba de integracion MySQL.
- Compose exige las variables de seguridad, monta una carpeta dedicada de CA en solo lectura y publica healthchecks.

## Preparacion de MySQL en el servidor

1. Instalar MySQL como servicio, por ejemplo `MySQL80`, y confirmar el nombre real con:

   ```powershell
   Get-Service -Name 'MySQL*'
   ```

2. Configurar el servidor MySQL con certificado TLS y exigir conexiones cifradas para los usuarios de runtime.
3. Crear usuarios separados para cada API, con permisos solo sobre su base respectiva. No usar `root` en `DATABASE_URL`.
4. Restringir el firewall a la conectividad necesaria del servidor y validar que el puerto 3306 no quede publicado a redes externas.
5. Respaldar ambas bases antes de aplicar migraciones y conservar una prueba de restauracion.

La inicializacion SQL de otros Compose no se ejecuta automaticamente en una base MySQL existente del host. Las migraciones deben verificarse y aplicarse como paso separado y respaldado.

## Secretos y CA

Crear fuera del repositorio:

```powershell
New-Item -ItemType Directory -Force C:\ProgramData\InfoUNSA\config
New-Item -ItemType Directory -Force C:\ProgramData\InfoUNSA\secrets\mysql
Copy-Item .\windows-server-deploy\.env.example C:\ProgramData\InfoUNSA\config\infounsa-production.env
```

Editar el archivo de variables con credenciales reales y copiar la CA de MySQL como:

```text
C:\ProgramData\InfoUNSA\secrets\mysql\mysql-ca.pem
```

La carpeta se monta como solo lectura en ambos contenedores en `C:\run\secrets\mysql`. No copiar certificados ni contrasenas al repositorio.

## Registro del arranque

Desde PowerShell como Administrador, en la carpeta del despliegue:

```powershell
Set-Service -Name MySQL80 -StartupType Automatic
.\register-startup-task.ps1 -MySqlServiceName MySQL80 -EnvFile C:\ProgramData\InfoUNSA\config\infounsa-production.env
```

La tarea `InfoUNSA-APIs-Startup` se ejecuta como `SYSTEM`, espera MySQL y Docker, valida el Compose y ejecuta:

```text
docker compose up -d --remove-orphans
```

Para revisar el registro:

```powershell
Get-ScheduledTask -TaskName InfoUNSA-APIs-Startup
Start-ScheduledTask -TaskName InfoUNSA-APIs-Startup
docker compose --env-file C:\ProgramData\InfoUNSA\config\infounsa-production.env -f .\docker-compose.yml ps
```

## Actualizacion controlada

```powershell
docker compose --env-file C:\ProgramData\InfoUNSA\config\infounsa-production.env -f .\docker-compose.yml build
docker compose --env-file C:\ProgramData\InfoUNSA\config\infounsa-production.env -f .\docker-compose.yml up -d --remove-orphans
docker compose --env-file C:\ProgramData\InfoUNSA\config\infounsa-production.env -f .\docker-compose.yml ps
```

Antes de promover una nueva version: respaldo, migracion revisada, healthcheck de ambas APIs, prueba de login y prueba de una operacion de lectura/escritura en cada sistema.

## Validacion y rollback

- `docker compose config --quiet` debe pasar con el archivo de variables real.
- Ambos contenedores deben quedar `running` y `healthy`.
- `GET /health` debe responder sin exponer detalles internos de la base.
- La aplicacion debe iniciar con TLS validado; una CA ausente o invalida debe hacer fallar el arranque de forma segura.
- Para rollback, conservar la imagen anterior, restaurar el respaldo si hubo migracion no compatible y volver a ejecutar `up -d` con la version anterior.

La validacion de registro de servicios y conectividad MySQL debe ejecutarse en el Windows Server 2019 real; este equipo local solo puede validar sintaxis, tests y builds.
