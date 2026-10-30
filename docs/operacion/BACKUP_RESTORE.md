# Manual de Copias de Seguridad y Restauración — Plataforma InfoUNSA
**Proyecto:** Plataforma InfoUNSA  
**Fecha:** 2026-06-21

---

## 1. Copias de Seguridad Centrales (PostgreSQL)
Se realizan volcados lógicos diarios de las bases de datos de asistencia e inventario.

### Script de Respaldos
Ejecución diaria programada en cron:
```bash
docker exec -t asistencia-db pg_dump -U infounsa -d infounsa_asistencia -F c -b -v -f /backups/asistencia_$(date +%F).dump
docker exec -t inventario-db pg_dump -U infounsa -d infounsa_inventario -F c -b -v -f /backups/inventario_$(date +%F).dump
```

### Procedimiento de Restauración
Para restaurar una base desde un archivo `.dump`:
```bash
docker exec -t asistencia-db pg_restore -U infounsa -d infounsa_asistencia --clean --no-owner /backups/asistencia_target.dump
```

---

## 2. Copias de Seguridad de Clientes Locales (SQLite Cifrado)
En caso de fallo en las terminales físicas (Kioscos):
* La base de datos local `local_db.sqlite` se encuentra en el directorio de datos de usuario de la aplicación.
* Si el terminal se daña físicamente y el disco duro es legible, se puede copiar el archivo de base de datos a un dispositivo de repuesto.
* Para descifrar e inspeccionar el archivo local en una estación de administración, se debe recuperar la clave de cifrado local almacenada de forma segura mediante el módulo de `safeStorage` del sistema operativo origen, o utilizar el procedimiento de recuperación administrativa con la clave de respaldo del terminal.
* Las marcas que ya se sincronizaron con el servidor central no necesitan ser recuperadas ya que se conservan en PostgreSQL.
