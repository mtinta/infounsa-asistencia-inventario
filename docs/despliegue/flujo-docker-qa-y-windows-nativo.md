# Flujo de entrega: Docker QA y Windows Server nativo

Fecha de definicion: 2026-09-16

Este flujo aplica solamente a los sistemas **Asistencia** e **Inventario**: sus clientes EXE, APIs y bases MySQL. WordPress y el portal institucional no forman parte de esta validacion.

## Ramas y responsabilidades

| Rama | Uso | Despliegue permitido |
| --- | --- | --- |
| `feature/docker-qa-asistencia-inventario` | Desarrollo, integracion y pruebas reproducibles | Docker Linux local/CI |
| `feature/windows-native-services` | Preparacion de scripts, variables y documentacion de servicios Windows | No se despliega directamente |
| `develop` | Integracion del codigo que supero la puerta QA; conserva builds Docker y EXE | No se despliega directamente a produccion |
| `release/windows-native-services` | Candidato exacto para la ventana de preproduccion/produccion | Servicios nativos de Windows Server 2019 |

La rama `release/windows-native-services` se crea desde el commit exacto de `develop` que haya pasado el Compose QA. No se crea antes para evitar que una configuracion de entrega se pruebe contra un codigo distinto.

## Comportamiento controlado de `develop`

`develop` sigue siendo la rama de integracion. El pipeline existente conserva estas puertas:

- cambios en APIs, Dockerfiles o infraestructura ejecutan la compilacion de las imagenes Docker de Asistencia e Inventario;
- cambios en los clientes desktop ejecutan la compilacion de los instaladores EXE en el runner Windows;
- los tags semanticos publican los instaladores mediante el job de release;
- `develop` no registra servicios Windows ni ejecuta una actualizacion productiva;
- los resultados y artefactos se revisan antes de crear `release/windows-native-services`.

Esto permite integrar cambios pequenos sin mezclar el runtime Linux de QA con el runtime nativo de Windows.

## Validacion Docker QA

1. Crear un archivo local de variables y no versionarlo:

   ```powershell
   New-Item -ItemType Directory -Force qa/config | Out-Null
   Copy-Item .\docker-compose.asistencia-inventario.qa.env.example qa/config/asistencia-inventario.docker.env
   notepad qa/config/asistencia-inventario.docker.env
   ```

2. Mantener las URLs internas de Docker con los nombres de servicio:

   ```text
   ASISTENCIA_DATABASE_URL=mysql://usuario:password@asistencia-db:3306/infounsa_asistencia
   INVENTARIO_DATABASE_URL=mysql://usuario:password@inventario-db:3306/infounsa_inventario
   ```

3. Ejecutar la puerta de validacion:

   ```powershell
   .\tools\dev\validate-docker-asistencia-inventario.ps1 `
     -EnvFile qa/config/asistencia-inventario.docker.env
   ```

   El runner valida el Compose, construye ambas imagenes, levanta MySQL y las APIs, verifica `GET /health`, ejecuta las pruebas unitarias dentro de los contenedores y vuelve a compilar cada API dentro de su contenedor.

4. Si se necesita inspeccionar los servicios despues de la corrida:

   ```powershell
   .\tools\dev\validate-docker-asistencia-inventario.ps1 `
     -EnvFile qa/config/asistencia-inventario.docker.env `
     -KeepServices
   docker compose --project-name infounsa-asistencia-inventario-qa `
     --env-file qa/config/asistencia-inventario.docker.env `
     -f docker-compose.asistencia-inventario.qa.yml logs --tail=100
   ```

   `docker compose down` no elimina los volumenes QA. Para reiniciar las bases de datos de prueba desde cero, usar `down -v` solamente con el nombre de proyecto QA.

## Puerta antes de crear la rama de produccion

La promocion requiere:

- Compose QA valido y sin servicios fuera de alcance.
- Ambas bases en estado `healthy`.
- Ambas APIs respondiendo `/health` con HTTP 200.
- Pruebas unitarias y build dentro de los contenedores en verde.
- `npm audit`, Trivy y Semgrep revisados; los WARN documentados con responsable y fecha.
- Pruebas de contrato/API y de integracion MySQL aprobadas cuando corresponda.
- Revision de migraciones, respaldo y procedimiento de rollback.

La rama nativa se crea entonces con:

```powershell
git switch develop
git pull --ff-only origin develop
git switch -c release/windows-native-services
```

En esa rama se conserva solamente la entrega compatible con Windows Server nativo: Node.js, MySQL como servicio Windows, variables externas, certificado CA y NSSM/servicios Windows. No se usa `host.docker.internal`, Compose de Windows ni Docker Desktop.

## Compatibilidad de configuracion

El codigo de las APIs es comun en ambas ramas. Cambian unicamente las variables de entorno y el mecanismo de arranque:

| Entorno | Host de MySQL en `DATABASE_URL` | Arranque |
| --- | --- | --- |
| Docker QA | `asistencia-db` / `inventario-db` | `docker compose up` |
| Windows Server | `127.0.0.1` o `localhost` | Servicios Windows nativos |

En produccion nativa se mantienen `NODE_ENV=production`, `MYSQL_SSL=true` y `MYSQL_SSL_REJECT_UNAUTHORIZED=true`. La CA se entrega desde una ruta protegida del servidor. TLS de MySQL protege API -> DB; el acceso de los EXE hacia la API debe resolverse aparte con HTTPS antes de abrir la red a clientes.

## Criterio de no promocion

No se promociona si el Compose no puede arrancar, si una API no confirma conexion a MySQL, si falta una migracion o si los secretos/TLS no estan configurados. Un build exitoso por si solo no autoriza el despliegue.
