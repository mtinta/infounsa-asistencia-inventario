# Plan de Mitigación y Preservación de MySQL
**Estatus:** Mitigación y pruebas aisladas completadas; despliegue persistente pendiente de ventana, respaldo y credenciales autorizadas
**Ámbito:** Bases de datos centrales de Asistencia e Inventario  

Este documento detalla el plan de mitigación técnica para conservar **MySQL 8** como motor de base de datos relacional centralizado del proyecto, abordando proactivamente los riesgos de concurrencia, bloqueos mutuos (deadlocks) e integridad de datos bajo el estándar **ISO/IEC 29110**.

## Estado de la ejecución

- Las migraciones de Asistencia e Inventario son versionadas e idempotentes.
- La prueba real de Inventario confirmó trigger, `CHECK`, bloqueo `FOR UPDATE`, rollback e idempotencia.
- Los seeds y los endpoints `/health` de ambas APIs pasaron en un runtime Docker aislado.
- Las imágenes API fueron reconstruidas con `npm ci`, Prisma 7.10.0 y ejecución no-root.
- `asistencia-db` e `inventario-db` persistentes permanecen saludables; no se eliminaron volúmenes.
- Las APIs persistentes no se promovieron porque las credenciales actuales no coinciden con los volúmenes existentes. Antes de aplicar migraciones se requiere respaldo y cuenta autorizada.

El detalle de evidencias está en [2026-09-15-resultado-despliegue-mitigacion.md](../auditoria/2026-09-15-resultado-despliegue-mitigacion.md).

---

## 0. Despliegue controlado de la migracion de Inventario

La migracion versionada [002_harden_inventory_integrity.sql](../../apps/inventario/database/init/002_harden_inventory_integrity.sql) se ejecuta automaticamente en una base nueva porque esta dentro de `database/init`. En una base existente, los scripts de inicializacion de MySQL no se repiten al conservar el volumen; debe aplicarse manualmente con una cuenta de migracion autorizada:

```powershell
mysql --host 127.0.0.1 --port 3307 --user <usuario-migracion> --password <nombre-base-inventario> < apps/inventario/database/init/002_harden_inventory_integrity.sql
```

La orden solicita la contrasena de forma interactiva. No se deben guardar credenciales en el comando, en el repositorio ni en los logs. La migracion falla si encuentra datos incompatibles y no elimina datos ni volumenes.

Para validar el esquema, trigger, bloqueo e idempotencia en una base aislada, cree previamente una base cuyo nombre contenga `test`, `integration` o `ci` y ejecute:

```powershell
$env:INVENTARIO_INTEGRATION_DATABASE_URL = "mysql://usuario:contrasena@127.0.0.1:3307/infounsa_inventario_test"
npm.cmd run test:integration:mysql --prefix apps/inventario/api
```

El script rechaza nombres de base que no parezcan de pruebas y limpia unicamente el item temporal que crea.

Para Asistencia, el init de Docker incluye [002_align_prisma_mysql_schema.sql](../../apps/asistencia/database/init/002_align_prisma_mysql_schema.sql), que agrega de forma idempotente las columnas que exige el Prisma actual. En una base existente debe aplicarse con la cuenta de migracion autorizada:

```powershell
mysql --host 127.0.0.1 --port 3306 --user <usuario-migracion> --password <nombre-base-asistencia> < apps/asistencia/database/init/002_align_prisma_mysql_schema.sql
```

La migracion de Asistencia no agrega logica de stock; solo alinea el esquema de usuarios y sincronizacion con la API.

## 1. Riesgos de Deuda y Mitigaciones Técnicas

### A. Condiciones de Carrera e Integridad del Stock (Race Conditions)
*   **Problema:** En operaciones altamente concurrentes de salida de inventario, múltiples peticiones pueden leer la cantidad disponible simultáneamente (`SELECT`) y proceder a realizar transacciones de descuento, provocando que `quantity` sea menor que cero a nivel lógico.
*   **Mitigación:**
    1.  **Bloqueo Pesimista (SELECT FOR UPDATE):** En la API de NestJS, utilizar sentencias `$queryRaw` o consultas nativas parametrizadas para ejecutar `SELECT quantity FROM inventory_items WHERE id = ? FOR UPDATE` durante el flujo de creación de movimientos. Esto bloqueará la fila correspondiente hasta que la transacción se complete o haga rollback.
    2.  **Triggers de Seguridad Física:** Crear un disparador (`BEFORE UPDATE`) en la tabla `inventory_items` de MySQL que verifique la integridad y arroje un error estructurado si la nueva `quantity` es negativa:
        ```sql
        DELIMITER $$
        CREATE TRIGGER tg_prevent_negative_stock
        BEFORE UPDATE ON inventory_items
        FOR EACH ROW
        BEGIN
            IF NEW.quantity < 0 THEN
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Error: cantidad insuficiente. La transacción ha sido cancelada.';
            END IF;
        END$$
        DELIMITER ;
        ```

### B. Bloqueos Mutuos (Deadlocks) y Reintentos Automáticos
*   **Problema:** El uso de bloqueos pesimistas incrementa la probabilidad de transacciones bloqueadas mutuamente (`Deadlock found when trying to get lock; try restarting transaction`).
*   **Mitigación:**
    1.  **Mecanismo de Reintento Exponencial (NestJS):** Implementar un interceptor o decorador de reintentos en los servicios transaccionales de NestJS. Si la excepción de base de datos es de tipo deadlock (Código de error de MySQL `1213`), el servicio reintentará automáticamente la transacción hasta 3 veces con una espera aleatoria (backoff exponencial con jitter).
    2.  **Alineación de Índices:** Garantizar que los queries transaccionales utilicen índices compuestos (`(sede_id, category_id, barcode)`) para evitar que InnoDB bloquee páginas completas o realice búsquedas secuenciales de filas (table scans), lo que eleva el riesgo de deadlock.

### C. Conexiones Abiertas y Agotamiento de Pool (Connection Pooling)
*   **Problema:** Múltiples terminales Kiosco locales e interfaces de escritorio de Inventario realizando sincronizaciones periódicas concurrentes pueden saturar la capacidad máxima de conexiones abiertas del servidor MySQL.
*   **Mitigación:**
    1.  **Límite Estricto en Prisma:** Configurar el límite de conexiones en el URL de la cadena de conexión de Prisma (`&connection_limit=20` por cada API centralizada) para no sobrepasar el límite configurado del servidor (`max_connections = 150`).
    2.  **Control de Tiempos de Espera (Timeouts):** Ajustar las variables de configuración de MySQL en el arranque del contenedor de la base de datos:
        *   `interactive_timeout = 300` (segundos para cerrar conexiones interactivas inactivas).
        *   `wait_timeout = 120` (segundos para cerrar conexiones no interactivas inactivas).

---

## 2. Plan de Verificación de Estabilidad MySQL

*   **Prueba de Concurrencia Newman:** Ejecutar aserciones concurrentes enviando lotes masivos desde múltiples hilos Newman simultáneos simulando 50 operadores descontando el mismo ítem.
*   **Inspección de Logs:** Verificar en los logs del contenedor de base de datos MySQL que no se registren fallos de consistencia física ni fugas de memoria del buffer pool.
