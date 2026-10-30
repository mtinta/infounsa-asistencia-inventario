# Módulo de Control de Asistencia (AST) - InfoUNSA

Gestiona la marcación de entrada/salida del personal y de visitantes en los terminales asignados (kioscos). Opera **offline-first**: si la red institucional cae, el kiosco sigue registrando y sincroniza cuando vuelve la conexión.

---

## Estructura del módulo

```
apps/asistencia/
├── api/        # Backend NestJS + Prisma 7 sobre MySQL (puerto 43000)
│   ├── prisma/       # schema.prisma, migraciones y seed (data-usuarios.json)
│   └── src/modules/  # attendance, auth, barcode, health, sedes, stats, terminals, users
├── database/   # Scripts SQL de referencia (init/) para MySQL
└── desktop/    # Kiosco Electron 42 + React 19 + SQLCipher
```

---

## Datos y persistencia

Hay dos bases de datos:

1. **Local (en cada kiosco, modo offline)**
   - Motor: **SQLite cifrado con SQLCipher** (`@journeyapps/sqlcipher`).
   - Tablas principales (`desktop/schema.sql`): `attendance` (marcas locales con `sync_status`: Pendiente, Enviando, Sincronizado, Error, Conflicto), `sync_queue` (cola de envío), `sync_logs`, `device_config`, `local_users` y `offline_auth_cache` (acceso sin conexión).
   - Cifrado: la clave se genera en el primer arranque y se protege con el sistema operativo (`safeStorage`; DPAPI en Windows).
   - Ubicación en Windows: `%APPDATA%\infounsa-asistencia-desktop`. **Actualizar o reinstalar el cliente no borra esta carpeta.**

2. **Central (servidor)**
   - Motor: **MySQL 8.x**, administrado con Prisma (`api/prisma/schema.prisma`).
   - Modelos: `roles`, `sedes`, `terminals`, `users`, `attendance` (con `id_operacion_local` único para evitar duplicados al reintentar) y `sync_logs`.

---

## Flujo de sincronización

- **Detección de red:** la app escucha los eventos `online`/`offline` y comprueba `GET /health`.
- **Envío por lotes:** cada 30 s empaqueta hasta **500** marcas pendientes y las envía con JWT a `POST /attendance/sync`.
- **Confirmación:** la API inserta en una transacción y devuelve los IDs procesados; el kiosco marca esos registros como sincronizados.
- **Fallo:** si el envío falla, las marcas vuelven a `Pendiente` y se reintentan. El `id_operacion_local` único impide duplicados.

---

## Ejecución

Ver el [README principal](../../README.md) para instalar con o sin Docker. Resumen para desarrollo:

```bash
cd apps/asistencia/api
npx prisma db push
npm run db:seed          # crea admin / admin123 (o la de SEED_ADMIN_PASSWORD)
npm run dev                      # API en http://localhost:43000

cd ../desktop
npm run electron:dev             # kiosco
npm run dist                     # instalador (NSIS) en dist-electron/ (compilar en Windows)
npm run reset:local-data         # SOLO desarrollo: borra la base local de esta máquina
```
