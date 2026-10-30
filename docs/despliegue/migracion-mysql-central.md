# Migracion central a MySQL

## Alcance

Esta rama migra las bases centrales de Asistencia e Inventario a MySQL 8. Los clientes desktop mantienen almacenamiento local SQLite/SQLCipher para preservar el modo offline.

La rama `feature/asistencia/base-de-datos` queda como referencia historica, pero no se integra de forma directa porque no conectaba el cambio con las APIs reales.

## Variables principales

- `ASISTENCIA_DATABASE_URL=mysql://infounsa:infounsa_asistencia_dev@asistencia-db:3306/infounsa_asistencia`
- `INVENTARIO_DATABASE_URL=mysql://infounsa:infounsa_inventario_dev@inventario-db:3306/infounsa_inventario`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`

Puertos locales:

- Asistencia MySQL: `3306`
- Inventario MySQL: `3307`

## Validacion local ejecutada

Fecha de evidencia: `2026-06-24`.

La promocion de esta migracion se valida manualmente con runners locales. El pipeline remoto de GitLab queda restringido por ahorro de computo y solo debe ejecutarse si un commit incluye `[deploy-importante]`.

Comandos ejecutados correctamente:

```powershell
docker compose config
cd apps/asistencia/api
npx prisma validate
npx prisma generate
npm run build

cd ../../inventario/api
npx prisma validate
npx prisma generate
npm run build

cd ../../asistencia/desktop
npm run build

cd ../../inventario/desktop
npm run build

$job = Start-Job -ScriptBlock { Set-Location 'D:\INFOUNSA-GITLAB\INFOUNSA-GITLAB-PROJECT'; node qa/mock-server.js }
Start-Sleep -Seconds 3
npx.cmd -y newman run qa/postman/asistencia_api_collection.json --env-var baseUrl=http://127.0.0.1:3000 -r cli
npx.cmd -y newman run qa/postman/inventario_api_collection.json --env-var baseUrl=http://127.0.0.1:3001 -r cli
Stop-Job $job
Remove-Job $job -Force
```

Resultado:

- Compose valida con MySQL 8 para `asistencia-db` e `inventario-db`.
- `docker compose up -d --force-recreate asistencia-db inventario-db` deja ambos contenedores `healthy`.
- Prisma valida y genera cliente en Asistencia e Inventario.
- APIs de Asistencia e Inventario compilan.
- Desktops de Asistencia e Inventario compilan.
- Newman pasa contra mock local:
  - Asistencia: 3 requests, 5 assertions, 0 fallos.
  - Inventario: 3 requests, 6 assertions, 0 fallos.
- No quedan imports activos de `pg` ni `PG_CONNECTION` en APIs centrales.

## Rollback

1. Revertir los commits de esta rama antes del merge a `develop`.
2. Restaurar imagenes PostgreSQL, variables `POSTGRES_*` y URLs `postgresql://`.
3. Restaurar scripts init PostgreSQL desde `develop`.
4. Recrear volumenes locales de base de datos si ya fueron inicializados con MySQL.

## Notas operativas

- Los clientes desktop no deben instalar MySQL local.
- Los bind mounts centrales usan `db-data-mysql` para no mezclar datos MySQL con carpetas PostgreSQL antiguas (`db-data`).
- Los scripts `prisma generate` deben ejecutarse antes de `npm run build`, porque el cliente generado no debe tratarse como fuente principal.
- En Docker dev, los contenedores API ejecutan `npx prisma generate` al iniciar para que los bind mounts de `src` no oculten el cliente Prisma generado.
- Las correcciones de revision cubren los riesgos detectados sobre los commits `02b399af`, `4df6e087`, `9880de97`, `d43184b4` y `f0c83836`.
- WordPress conserva su base MariaDB separada y no forma parte de esta migracion central.

## Checklist deploy-ready de estructura MySQL

Esta checklist debe ejecutarse antes de promover cambios de base de datos hacia `develop` o antes de activar un despliegue productivo. Los scripts `database/init/*.sql` solo se ejecutan automaticamente cuando el volumen MySQL esta vacio; por eso no deben tratarse como migraciones incrementales para bases existentes.

### Escenario A: ambiente nuevo o volumen vacio

1. Confirmar que el volumen objetivo no contiene datos previos.
2. Levantar la base con `docker compose up -d asistencia-db inventario-db` o con el compose productivo equivalente.
3. Verificar que los scripts `database/init/asistencia-mysql.sql` e `database/init/inventario-mysql.sql` se aplicaron sin errores.
4. Ejecutar `npx prisma validate` en `apps/asistencia/api` y `apps/inventario/api`.
5. Ejecutar los builds de APIs y desktops antes de cargar datos reales.

### Escenario B: base existente con datos

1. Generar backup verificable antes de cualquier cambio:

```powershell
docker exec asistencia-db mysqldump -u root -p infounsa_asistencia > asistencia_backup.sql
docker exec inventario-db mysqldump -u root -p infounsa_inventario > inventario_backup.sql
```

2. Comparar `schema.prisma` contra la estructura real de la base.
3. Preparar SQL incremental versionado para cambios de tablas, columnas, indices o restricciones.
4. Aplicar el SQL primero en staging o en una copia restaurada del backup.
5. Validar endpoints criticos: health, login/JWT, registros de asistencia, visitantes, movimientos de inventario y reportes.
6. Conservar el SQL incremental junto con la evidencia de pruebas antes de promover.

### Verificaciones minimas

- `npx prisma validate` pasa en ambas APIs.
- `npm run build` pasa en ambas APIs y ambos desktops.
- Las tablas esperadas existen y no hay columnas faltantes para los DTOs actuales.
- Las rutas protegidas devuelven `401` sin token y funcionan con JWT valido.
- Los seeds o datos iniciales no sobrescriben informacion real.
- Los compose productivos no exponen MySQL al host ni incluyen secretos por defecto.

### Rollback de base existente

1. Detener los servicios API para cortar escrituras.
2. Restaurar el dump verificado en una base limpia o volumen nuevo.
3. Reapuntar las APIs al volumen restaurado.
4. Ejecutar healthchecks y pruebas de autenticacion antes de reabrir trafico.

### Deuda tecnica aceptada temporalmente

La estructura actual usa Prisma para validar modelo y scripts SQL de inicializacion para crear bases nuevas. Para despliegues con datos existentes, la deuda pendiente es formalizar migraciones incrementales con Prisma Migrate o con scripts SQL versionados por release. Hasta cerrar esa deuda, ningun cambio estructural debe promoverse solo modificando `database/init/*.sql`.
