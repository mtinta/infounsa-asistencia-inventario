# Aseguramiento de Calidad y Pruebas (QA) - InfoUNSA

Esta carpeta centraliza el código ejecutable y las configuraciones de automatización de pruebas para asegurar la calidad de la plataforma institucional bajo los estándares **ISO/IEC 29110**.

---

## Estructura de QA

```
qa/
├── inventario/      # Suite reproducible de integración del módulo de Inventario
├── postman/        # Colecciones de Postman (.json) para pruebas de integración de las APIs
├── newman/         # Configuraciones y scripts para correr Postman de forma automatizada
├── stress/         # Scripts para pruebas de estrés concurrente
├── test-cases/     # Hojas de casos de prueba formateadas
└── reports/        # Reportes generados por Newman y herramientas de cobertura de pruebas
```

## Pruebas de Inventario en Docker

La suite valida el catálogo, movimientos, alertas, idempotencia, concurrencia, seguridad y configuración de infraestructura contra los servicios locales:

```bash
./qa/inventario/run-docker-tests.sh
```

Los resultados consolidados se registran en `docs/07_aseguramiento_calidad/EJECUCION_PRUEBAS_INVENTARIO.md` y la evidencia de consola en `docs/09_evidencias/`.

---

## Ejecución de Pruebas Automatizadas de API (Newman)

Las colecciones de Postman están configuradas para ejecutarse contra los contenedores locales. Para correr las pruebas locales de APIs, sigue estos pasos:

1. Asegúrate de tener instalado Newman globalmente:
   ```bash
   npm install -g newman newman-reporter-html
   ```
2. Ejecuta la colección de inventario o asistencia:
   ```bash
   newman run postman/inventario_api_collection.json -e postman/local_environment.json -r cli,html --reporter-html-export qa/reports/report-inventario.html
   ```
3. Revisa el reporte html generado en `qa/reports/`.

---

## Pruebas de Estrés Concurrente

El módulo de Asistencia e Inventario soporta operaciones concurrentes de alto volumen (e.g. lotes de 500 registros simultáneos de marcas o movimientos). Los scripts de simulación de carga se ejecutan desde la carpeta `qa/stress/` para verificar que PostgreSQL no caiga en deadlock bajo cargas concurrentes intensas (requisitos RNF-ASI-02 e RNF-INV-02).
