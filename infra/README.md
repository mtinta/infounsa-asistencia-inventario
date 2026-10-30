# Infraestructura y Despliegue - InfoUNSA

Esta carpeta centraliza todos los recursos de configuración de infraestructura, despliegue, virtualización por contenedores y pipelines de Integración Continua (CI/CD).

---

## Estructura de Directorios

```
infra/
├── docker/              # Dockerfiles oficiales de compilación
│   ├── asistencia-api/  # Dockerfile para NestJS (Asistencia)
│   └── inventario-api/  # Dockerfile para NestJS (Inventario)
│
├── compose/             # Fragmentos auxiliares de Docker Compose
│   └── inventario-compose.yml  # Configuración original de inventario
│
├── nginx/               # Configuraciones del proxy inverso local (Nginx)
├── ci/                  # Scripts e integraciones para GitLab CI
├── env/                 # Plantillas de variables de entorno para staging/producción
└── deploy/              # Scripts automatizados de despliegue en servidor
```

---

## Diseño de Aislamiento de Redes (Redes Docker)

Para garantizar la seguridad de los datos de la plataforma institucional, la infraestructura orquesta tres redes lógicas independientes:

1. **`asistencia-net`**: Red aislada dedicada para la base de datos central MySQL (`asistencia-db`), el backend API NestJS (`asistencia-api`) y su panel de control Adminer.
2. **`inventario-net`**: Red aislada dedicada para la base de datos central MySQL (`inventario-db`), el backend API NestJS (`inventario-api`) y su panel de control Adminer.
3. **`portal-net`**: Red de cara al usuario que orquesta el servidor Nginx del `portal-general`.

---

## Administración Local de Contenedores

- Levantar todos los servicios:
  ```bash
  docker compose up -d --build
  ```
- Detener todos los servicios:
  ```bash
  docker compose down
  ```
- Ver los logs del API de Inventario:
  ```bash
  docker compose logs -f inventario-api
  ```
- Ver los logs del API de Asistencia:
  ```bash
  docker compose logs -f asistencia-api
  ```
