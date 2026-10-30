# Manual de Despliegue en Producción — Plataforma InfoUNSA
**Proyecto:** Plataforma InfoUNSA  
**Fecha:** 2026-06-21

---

## 1. Requisitos Previos
* Servidor con Linux (Ubuntu Server LTS recomendado) con Docker 25+ y Docker Compose v2.20+.
* Acceso de red saliente para descargar imágenes desde el registro de contenedores de GitLab.
* Puertos `80` y `443` abiertos en el cortafuegos.
* Certificado SSL/TLS válido para los subdominios de la institución.

---

## 2. Configuración de Variables de Entorno
Copia el archivo `.env.example` en la máquina destino y configura los valores de producción:
```bash
cp .env.example .env
```
* **Variables Críticas:**
  * `JWT_SECRET`: Llave secreta del token JWT para control de asistencia.
  * `JWT_SECRET_INVENTARIO`: Llave secreta para gestión de inventario.
  * `ASISTENCIA_DB_PASSWORD` e `INVENTARIO_DB_PASSWORD`: Contraseñas robustas para PostgreSQL.

---

## 3. Despliegue de Servicios
Para levantar la infraestructura en producción, ejecuta:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
Este comando construirá y desplegará:
1. Las bases de datos PostgreSQL internas en redes aisladas.
2. Las APIs NestJS (`asistencia-api` e `inventario-api`) configuradas en modo producción (`NODE_ENV=production`) sin montar volúmenes locales.
3. El proxy inverso Nginx que actúa como único punto de entrada de red.

---

## 4. Ejecución de Migraciones de Base de Datos
Las migraciones de Prisma se ejecutan automáticamente en el arranque de la API mediante la directiva `entrypoint`.
Si necesitas ejecutarlas manualmente:
```bash
docker compose exec asistencia-api npx prisma migrate deploy
```
