# Módulo de Gestión de Inventario (INV) - InfoUNSA

El Módulo de Inventario gestiona la catalogación de bienes consumibles institucionales, el registro de movimientos de entrada (abastecimiento) y salida (distribución a áreas/usuarios) y el control de stock crítico (alertas).

---

## Estructura del Módulo

```
apps/inventario/
├── api/             # Backend API NestJS y consultas PostgreSQL 18.4
├── database/        # Scripts SQL de inicialización y migración central
└── desktop/         # Código de la aplicación de escritorio React 19 + Electron 42
```

---

## Arquitectura de Datos y Persistencia

El inventario opera bajo un esquema multi-sede segmentado lógicamente:

1. **Base de Datos Local (Modo Offline-First)**:
   - Motor: **SQLite 3.53.2** con cifrado **SQLCipher 4.16.0**.
   - Tablas locales: `inventory_items`, `inventory_movements`, `sync_queue`.
   - Propósito: Permite consultar el catálogo y registrar movimientos cuando no hay conexión. Los movimientos quedan en estado `pendiente`.

2. **Base de Datos Central (Fuente Oficial de Existencias)**:
   - Motor: **PostgreSQL 18.4 (LTS)**.
   - Tablas oficiales: `categories`, `inventory_items` (bienes), `inventory_movements` (entradas/salidas), `alerts` (bienes con stock < stock mínimo), `audit_logs`.
   - Concurrencia de stock: El stock oficial reside **únicamente** en PostgreSQL central. Durante la sincronización de una salida offline, el backend ejecuta una transacción SQL para validar el stock real y evitar sobre-giros.

---

## Endpoints del Backend NestJS

- **CRUD de Categorías**: `GET`/`POST`/`PUT`/`DELETE` en `/categories`.
- **CRUD de Catálogo de Bienes**: `GET`/`POST`/`PUT`/`DELETE` en `/inventory-items`.
- **Registro de Movimientos**:
  - Entrada: `POST /inventory-movements/in` (incrementa stock).
  - Salida: `POST /inventory-movements/out` (valida stock mínimo, decrementa stock o hace rollback si es insuficiente).
- **Dashboard de Alertas**: `GET /alerts` (bienes con `quantity < min_stock`).
- **Sincronización masiva**: `POST /inventory-movements/sync` (inserción por lotes transaccionales con handshake seguro).
