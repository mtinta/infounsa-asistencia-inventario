# Manuales — Plataforma InfoUNSA

| # | Manual | Para quién |
| :--- | :--- | :--- |
| 01 | [Manual técnico de instalación — API de Asistencia](01-manual-tecnico-instalacion-api-asistencia.md) | Administrador de sistemas |
| 02 | [Manual técnico de instalación — API de Inventario](02-manual-tecnico-instalacion-api-inventario.md) | Administrador de sistemas |
| 03 | [Manual de usuario — Sistema de Asistencia](03-manual-usuario-asistencia.md) | Operadores y administradores del kiosco |
| 04 | [Manual de usuario — Sistema de Inventario](04-manual-usuario-inventario.md) | Almacenero y administradores |
| 05 | [Manual de mantenimiento](05-manual-mantenimiento.md) | Administrador de sistemas |
| Anexo | [Servicios de Windows: NSSM y script](Anexo-servicios-windows.md) | Administrador de sistemas |

Los manuales técnicos incluyen la regla de firewall y la conversión de la API en servicio de Windows con **dos métodos**: NSSM y script de Windows (tarea programada). Las capturas están en `img/` y las versiones PDF en `pdf/` (se regeneran con `pip install markdown-it-py` y `python scripts/generar-manuales-pdf.py`).

Otras guías: `docs/despliegue/` (producción, rollback) y `docs/operacion/` (respaldos, monitoreo).
