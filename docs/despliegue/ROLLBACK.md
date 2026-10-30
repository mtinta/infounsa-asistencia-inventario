# Procedimiento de Rollback — Plataforma InfoUNSA
**Proyecto:** Plataforma InfoUNSA  
**Fecha:** 2026-06-21

---

## 1. Criterios de Disparo de Rollback
Se debe revertir el despliegue a una versión anterior si:
* El healthcheck de las APIs responde con código HTTP `503` u otros errores del sistema por más de 5 minutos seguidos.
* Se detectan fallos de integridad de datos críticos en el log de las APIs.
* Falla la conectividad de red desde los clientes Electron hacia los proxies de producción.

---

## 2. Reversión de Imágenes y Contenedores
Para revertir a la versión anterior estable usando el hash de commit estable de Git:
```bash
# Cambiar la etiqueta de la variable de entorno en el archivo .env
export COMMIT_TAG=commit_anterior_estable

# Re-desplegar contenedores con la imagen inmutable previa
docker compose -f docker-compose.prod.yml up -d --no-deps
```

---

## 3. Restauración de Base de Datos (PostgreSQL)
Si la nueva migración causó inconsistencias lógicas irreversibles, restaura la copia de seguridad anterior a la migración:
```bash
# Detener el servicio API temporalmente
docker compose stop asistencia-api

# Restaurar la copia sql cifrada
docker compose exec -T asistencia-db psql -U infounsa -d infounsa_asistencia < backup_asistencia_previo.sql

# Iniciar nuevamente la API
docker compose start asistencia-api
```
---

## 4. Contactos y Responsabilidades
* **Yoset Cozco Mauri** (CI/CD Engineer / Project Manager) - Responsable de la ejecución técnica de la reversión.
* **Emerson Danny Mendoza** (Technical Lead) - Responsable de la validación del estado del software post-rollback.
