# Manual de Monitoreo y Alertas — Plataforma InfoUNSA
**Proyecto:** Plataforma InfoUNSA  
**Fecha:** 2026-06-21

---

## 1. Métricas Clave de Operación
Para asegurar la continuidad operativa de la plataforma, se monitorizan los siguientes indicadores principales:

* **Tasa de Errores HTTP 5xx:** Si supera el 2% en un periodo de 5 minutos, se dispara una alerta de severidad crítica.
* **Profundidad de la Cola de Sincronización:** Registros marcados como `Pendiente` en el cliente Electron que excedan las 24 horas sin actualizarse al estado `Sincronizado`.
* **Disponibilidad de PostgreSQL:** Healthcheck `/health` de ambas APIs respondiendo con estado "connected" para base de datos.
* **Uso de Almacenamiento Local:** Alertar si el disco del Kiosco físico supera el 90% de capacidad para evitar pérdidas de base SQLite.

---

## 2. Alertas del Sistema
* **Alerta: API_UNAVAILABLE**
  * *Condición:* Endpoint `/health` no responde (HTTP 502/504 o sin respuesta) por más de 3 minutos.
  * *Acción:* Notificar al equipo de operaciones y reiniciar el contenedor mediante Docker restart policy.
* **Alerta: DB_CONNECTION_LOST**
  * *Condición:* Endpoint `/health` devuelve `database: unavailable`.
  * *Acción:* Validar salud del contenedor PostgreSQL y sockets del pool de conexiones.
* **Alerta: SYNC_QUEUE_BLOCKED**
  * *Condición:* Cantidad de registros locales con estado `Error` o `Conflicto` > 50 en un terminal.
  * *Acción:* Alerta administrativa en el dashboard para resolución manual del stock o descarte de datos duplicados.
