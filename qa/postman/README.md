# Colecciones Postman QA

## Estructura vigente

- `asistencia_api_collection.json`: smoke general de Asistencia
- `inventario_api_collection.json`: smoke general de Inventario
- `cpi-asistencia-auth-api/coleccion-pruebas/`: autenticacion y seguridad de Asistencia
- `cpi-asistencia-sync-api/coleccion-pruebas/`: marcaciones y sincronizacion de Asistencia
- `cpi-asistencia-reportes-api/coleccion-pruebas/`: reportes y auditoria de Asistencia
- `cpi-asistencia-admin-api/coleccion-pruebas/`: administracion, importacion y servicios auxiliares de Asistencia
- `cpi-inventario-auth-api/coleccion_pruebas/`: casos CPI de autenticacion de Inventario
- `cpi-inventario-catalogo-api/coleccion-pruebas/`: casos CPI de catalogo de Inventario
- `cpi-inventario-movimientos/coleccion-pruebas/`: casos CPI de movimientos, sincronizacion y reportes
- `cpi-inventario-admin-api/coleccion-pruebas/`: casos CPI de areas, usuarios y permisos

## Regla de versionado

- Se versionan colecciones y environments reutilizables.
- No se versionan resultados `.postman_test_run.json` dependientes del entorno local.
- Los reportes de corrida deben quedar en `qa/reports/`.

## Uso local sugerido

Ejecutar desde la raiz del repositorio para que Newman resuelva los fixtures de carga:

```powershell
npx newman run qa/postman/cpi-asistencia-auth-api/coleccion-pruebas/cpi-asistencia-auth-api.postman_collection.json --environment qa/postman/cpi-asistencia-auth-api/coleccion-pruebas/cpi-asistencia-auth-local.postman_environment.json
```

```powershell
npx newman run qa/postman/cpi-asistencia-sync-api/coleccion-pruebas/cpi-asistencia-sync-api.postman_collection.json --environment qa/postman/cpi-asistencia-sync-api/coleccion-pruebas/cpi-asistencia-sync-local.postman_environment.json
```

```powershell
npx newman run qa/postman/cpi-asistencia-reportes-api/coleccion-pruebas/cpi-asistencia-reportes-api.postman_collection.json --environment qa/postman/cpi-asistencia-reportes-api/coleccion-pruebas/cpi-asistencia-reportes-local.postman_environment.json
```

```powershell
npx newman run qa/postman/cpi-asistencia-admin-api/coleccion-pruebas/cpi-asistencia-admin-api.postman_collection.json --environment qa/postman/cpi-asistencia-admin-api/coleccion-pruebas/cpi-asistencia-admin-local.postman_environment.json --working-dir .
```

```powershell
npx newman run qa/postman/cpi-inventario-auth-api/coleccion_pruebas/cpi-inventario-auth-api.postman_collection.json --environment qa/postman/cpi-inventario-auth-api/coleccion_pruebas/cpi-inventario-auth-local.postman_environment.json
```

```powershell
npx newman run qa/postman/cpi-inventario-catalogo-api/coleccion-pruebas/cpi-inventario-catalogo-api.postman_collection.json --environment qa/postman/cpi-inventario-catalogo-api/coleccion-pruebas/cpi-inventario-catalogo-local.postman_environment.json
```

```powershell
npx newman run qa/postman/cpi-inventario-movimientos/coleccion-pruebas/cpi-inventario-movimientos-api.postman_collection.json --environment qa/postman/cpi-inventario-movimientos/coleccion-pruebas/cpi-inventario-movimientos-local.postman_environment.json
```

```powershell
npx newman run qa/postman/cpi-inventario-admin-api/coleccion-pruebas/cpi-inventario-admin-api.postman_collection.json --environment qa/postman/cpi-inventario-admin-api/coleccion-pruebas/cpi-inventario-admin-local.postman_environment.json
```
