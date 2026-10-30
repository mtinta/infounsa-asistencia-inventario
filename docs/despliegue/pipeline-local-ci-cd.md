# Pipeline local CI/CD de Asistencia e Inventario

## Objetivo

Este pipeline permite validar localmente los cambios de los dos sistemas en el orden correcto antes de subirlos a `develop`:

1. Validar dependencias, Prisma y compilacion.
2. Ejecutar pruebas unitarias de las APIs.
3. Levantar solo Asistencia e Inventario con el Compose QA aislado.
4. Ejecutar healthchecks y contratos Newman contra las APIs reales en Docker.
5. Verificar migraciones, claves, restricciones e idempotencia contra MySQL QA.
6. Ejecutar auditoria de dependencias y herramientas de seguridad.
7. Construir instaladores EXE solo cuando las excepciones de empaquetado esten resueltas.
8. Revisar el reporte y aprobar el despliegue de forma manual.

El alcance esta limitado a estas rutas:

- `apps/asistencia/api`
- `apps/asistencia/desktop`
- `apps/inventario/api`
- `apps/inventario/desktop`

WordPress no se valida, escanea, inicia ni despliega con este runner.

## Ejecucion recomendada

Desde la raiz del repositorio:

```powershell
.\tools\dev\run-local-ci.ps1
```

Para la validacion completa previa a `develop`, crear primero el archivo local ignorado y ejecutar:

```powershell
Copy-Item .\docker-compose.asistencia-inventario.qa.env.example .\qa\config\asistencia-inventario.docker.env
# Editar el archivo anterior y reemplazar todos los valores CAMBIAR_*.
.\tools\dev\run-local-ci.ps1 -RunDockerQa -ResetDockerQaData -BuildInstallers
```

Los artefactos se generan en una carpeta fechada dentro de `qa/reports/local-ci/`:

- `summary.md`: resumen con estados y enlaces.
- `pipeline.log`: salida completa de los comandos.
- `npm-audit-*.json`: auditorias de dependencias de produccion.
- `trivy-*.json`: vulnerabilidades, secretos y misconfiguraciones por componente.
- `semgrep.json` y `semgrep-state/`: analisis SAST y diagnostico del motor.
- `zap-report.html`: DAST opcional, solo si se proporciona una URL autorizada.

## Opciones

```powershell
# Reutilizar el pipeline sin construir imagenes Docker
.\tools\dev\run-local-ci.ps1 -SkipDockerBuild

# Ejecutar el empaquetado de los dos instaladores EXE
.\tools\dev\run-local-ci.ps1 -BuildInstallers

# Ejecutar la integracion MySQL sobre URLs de bases de pruebas aisladas ya iniciadas
$env:INVENTARIO_INTEGRATION_DATABASE_URL = "mysql://usuario:password@127.0.0.1:3307/infounsa_inventario_ci"
$env:ASISTENCIA_INTEGRATION_DATABASE_URL = "mysql://usuario:password@127.0.0.1:3306/infounsa_asistencia_ci"
.\tools\dev\run-local-ci.ps1 -RunMySqlIntegration

# Ejecutar solo el Compose QA, contratos Newman e integracion MySQL
.\tools\dev\validate-docker-asistencia-inventario.ps1 -EnvFile .\qa\config\asistencia-inventario.docker.env -ResetData

# Ejecutar ZAP contra una API local controlada, nunca contra WordPress
.\tools\dev\run-local-ci.ps1 -ZapTargetUrl "http://127.0.0.1:43001"

# Repetir solo auditorias y escaneos de seguridad durante una correccion
.\tools\dev\run-local-ci.ps1 -SecurityOnly -SkipDockerBuild

# Convertir los hallazgos altos/criticos y la indisponibilidad de Semgrep en fallo
.\tools\dev\run-local-ci.ps1 -StrictSecurity
```

Con `-RunDockerQa`, el runner usa exclusivamente las bases indicadas en el archivo QA y ejecuta la integracion MySQL de ambos sistemas. `-ResetDockerQaData` elimina solo los volumenes del proyecto QA antes de iniciar y, al terminar, para que la corrida sea reproducible. Nunca apunta a la base persistente de Windows Server.

## Herramientas de seguridad locales

El runner reutiliza las herramientas instaladas en `D:\security-cf`:

- Trivy 0.74.0: escaneo local de dependencias, secretos y configuraciones usando la cache disponible.
- Semgrep 1.177.0: reglas locales de SAST en `tools/security/semgrep-rules.yml`.
- OWASP ZAP 2.17.0: escaneo rapido DAST opcional de una API local.

Los hallazgos quedan como `WARN` en la ejecucion normal para permitir su comparacion con las excepciones documentadas. `-StrictSecurity` se usa como compuerta previa al merge cuando las excepciones ya fueron atendidas.

No se ejecuta `npm audit fix --force`; las correcciones de dependencias deben ser revisadas, probadas y registradas en un commit separado cuando corresponda.

## Criterio para subir a `develop`

No se debe hacer merge solo porque el build termine. Antes de subir:

1. El `summary.md` debe tener `OK` en validacion, pruebas y builds requeridos.
2. Los `WARN` de `npm audit`, Trivy, Semgrep o ZAP deben tener un issue, excepcion aprobada o correccion asociada.
3. La prueba MySQL de ambos sistemas debe ejecutarse con `-RunDockerQa` o con `-RunMySqlIntegration` y URLs aisladas para cambios de esquema, Prisma o transacciones.
4. Si se modifican instaladores, se debe ejecutar `-BuildInstallers`, revisar hashes y probar la instalacion en una maquina limpia.
5. El despliegue y la migracion productiva requieren respaldo, ventana autorizada y validacion posterior de `/health`.

## Separacion de CI y CD

Este runner implementa CI local y un `deploy-check` documental. No publica imagenes, no ejecuta migraciones productivas y no levanta los servicios persistentes del `docker-compose.yml`. El CD queda como paso manual posterior a la aprobacion del reporte, respaldo de las bases y confirmacion de variables de entorno.
