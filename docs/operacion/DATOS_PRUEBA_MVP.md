# Datos de Prueba para Validación del MVP (InfoUNSA)

Este documento detalla todas las cuentas de usuario y registros sembrados de forma inicial en ambos subsistemas para realizar pruebas funcionales, de autenticación, visuales y de control de roles.

---

## 🔑 Credenciales de Acceso Comunes

> [!IMPORTANT]
> Todas las cuentas de prueba han sido pre-sembradas con la contraseña común: **`admin123`** (encriptada con Bcrypt de 10 rondas).

### 👥 Subsistema de Asistencia (AST)
La base de datos central `infounsa_asistencia` contiene los siguientes usuarios:

| Usuario (`username`) | Correo Electrónico (`email`) | Contraseña (Texto Plano) | Nombre Completo | Rol | ID de Rol | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`admin`** | `admin@unsa.edu.pe` | `admin123` | Administrador General | `administrador` | `1` | Activo |
| **`yoset_pm`** | `yoset@infounsa.edu.pe` | `admin123` | Yoset Cozco Mauri | `administrador` | `1` | Activo |
| **`luis_dev`** | `luis@infounsa.edu.pe` | `admin123` | Luis Quispe | `operador` | `2` | Activo |
| **`melvin_dev`** | `melvin@infounsa.edu.pe` | `admin123` | Melvin Castro | `operador` | `2` | Activo |
| **`carlos_emp`** | `carlos@infounsa.edu.pe` | `admin123` | Carlos Mendoza | `usuario` | `3` | Activo |
| **`ana_emp`** | `ana@infounsa.edu.pe` | `admin123` | Ana Ramirez | `usuario` | `3` | Activo |

### 📦 Subsistema de Gestión de Inventario (INV)
La base de datos central `infounsa_inventario` contiene los siguientes usuarios:

| Usuario (`username`) | Correo Electrónico (`email`) | Contraseña (Texto Plano) | Nombre Completo | Rol | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`admin`** | `admin@unsa.edu.pe` | `admin123` | Administrador General | `administrador` | Activo |
| **`yoset_pm`** | `yoset@infounsa.edu.pe` | `admin123` | Yoset Cozco Mauri | `administrador` | Activo |
| **`luis_dev`** | `luis@infounsa.edu.pe` | `admin123` | Luis Quispe | `operador` | Activo |
| **`melvin_dev`** | `melvin@infounsa.edu.pe` | `admin123` | Melvin Castro | `operador` | Activo |

---

## 📅 Datos Sembrados: Control de Asistencia (AST)

### 🏫 Sedes Pre-cargadas
* **Sede Universitaria** (Código: `SEDE_UNI`, Dirección: `Av. Venezuela s/n`)
* **Centro Histórico** (Código: `SEDE_CENTRO`, Dirección: `Calle Santa Catalina 117`)

### 📋 Historial de Marcas de Asistencia (`attendance`)
Los registros abarcan marcas de Entrada/Salida para los últimos 3 días:

| ID | Usuario | Tipo | Fecha y Hora | Estado Sync | ID Operación Local |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `admin` | Entrada | Hace 3 días - 08:00 | Sincronizado | `loc-ast-0001` |
| 2 | `admin` | Salida | Hace 3 días - 17:00 | Sincronizado | `loc-ast-0002` |
| 3 | `carlos_emp` | Entrada | Hace 2 días - 07:55 | Sincronizado | `loc-ast-0003` |
| 4 | `carlos_emp` | Salida | Hace 2 días - 16:05 | Sincronizado | `loc-ast-0004` |
| 5 | `ana_emp` | Entrada | Hace 2 días - 08:05 | Sincronizado | `loc-ast-0005` |
| 6 | `ana_emp` | Salida | Hace 2 días - 17:10 | Sincronizado | `loc-ast-0006` |
| 7 | `admin` | Entrada | Hace 1 día - 08:01 | Sincronizado | `loc-ast-0007` |
| 8 | `admin` | Salida | Hace 1 día - 17:02 | Sincronizado | `loc-ast-0008` |
| 9 | `carlos_emp` | Entrada | Hace 1 día - 07:50 | Sincronizado | `loc-ast-0009` |
| 10 | `carlos_emp` | Salida | Hace 1 día - 16:00 | Sincronizado | `loc-ast-0010` |
| 11 | `ana_emp` | Entrada | Hace 1 día - 08:15 | Sincronizado | `loc-ast-0011` |
| 12 | `ana_emp` | Salida | Hace 1 día - 17:00 | Sincronizado | `loc-ast-0012` |

---

## 🏢 Datos Sembrados: Gestión de Inventario (INV)

### 🗂️ Categorías de Bienes
1. **Escritorio**: Útiles de oficina, cuadernos, folders, etc.
2. **Limpieza**: Materiales de aseo y mantenimiento.
3. **Material de Oficina**: Consumibles de computación, tintas, toners, equipos de cómputo.

### 💻 Catálogo de Bienes Patrimoniales (`inventory_items`)

| ID | Código Barras | Nombre del Bien | Descripción | Cantidad | Stock Mín | Unidad | Categoría |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `7501055310884` | Monitor Dell 24 | Monitor IPS Full HD de 24 pulgadas | 10 | 3 | unidad | Material de Oficina |
| 2 | `7501055310990` | Folder Manila A4 | Paquete de 100 unidades de folders | 25 | 5 | paquete | Escritorio |
| 3 | `7501055310111` | Papel Bond A4 80g | Millar de papel bond A4 de 80 gramos | 15 | 8 | millar | Escritorio |
| 4 | `7501055310222` | Laptop HP ProBook | Laptop Core i5 16GB RAM para docentes | 8 | 2 | unidad | Material de Oficina |
| 5 | `7501055310333` | Jabon Liquido 5L | Galón de jabón líquido de 5 litros | 12 | 4 | galón | Limpieza |
| 6 | `7501055310444` | Lapicero Faber Castell | Caja de 50 unidades de lapiceros azul | 40 | 10 | caja | Escritorio |
| 7 | `7501055310555` | Archivador Palanca A4 | Archivador de palanca ancho de cartón | 18 | 5 | unidad | Escritorio |
| 8 | `7501055310666` | Desinfectante Piso 5L | Galón de desinfectante aroma pino | 3 | 5 | galón | Limpieza |

### 📈 Historial de Movimientos de Almacén (`inventory_movements`)

| Item ID | Tipo | Cantidad | Operador | Destinatario | Fecha | ID Op Local | Observaciones |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 (Monitor) | Entrada | 10 | `admin` | - | Hace 5 días | `local-op-0001` | Carga inicial de monitores para el laboratorio |
| 2 (Folder) | Entrada | 30 | `yoset_pm` | - | Hace 3 días | `local-op-0002` | Compra de folders manila para archivo central |
| 2 (Folder) | Salida | 5 | `yoset_pm` | Mesa de Partes | Hace 2 días | `local-op-0003` | Entrega para atención al público |
| 3 (Papel) | Entrada | 15 | `luis_dev` | - | Hace 1 día | `local-op-0004` | Abastecimiento de papel bond para impresión |
| 4 (Laptop) | Entrada | 8 | `admin` | - | Hace 4 días | `local-op-0005` | Adquisición de laptops para docentes |
| 5 (Jabón) | Entrada | 15 | `luis_dev` | - | Hace 2 días | `local-op-0006` | Compra de insumos de limpieza mensuales |
| 5 (Jabón) | Salida | 3 | `luis_dev` | Servicios Generales | Hace 1 día | `local-op-0007` | Salida para baños de pabellón B |
| 6 (Lapicero) | Entrada | 50 | `yoset_pm` | - | Hace 6 días | `local-op-0008` | Ingreso de cajas de lapiceros |
| 6 (Lapicero) | Salida | 10 | `yoset_pm` | Decanato Ingeniería | Hace 3 días | `local-op-0009` | Entrega de útiles a secretaría |
| 7 (Archivador)| Entrada | 20 | `yoset_pm` | - | Hace 3 days | `local-op-0010` | Ingreso de archivadores de palanca |
| 7 (Archivador)| Salida | 2 | `yoset_pm` | Dirección Escuela | Hace 12 horas| `local-op-0011` | Archivadores para legajos de alumnos |
| 8 (Desinfect.)| Entrada | 5 | `luis_dev` | - | Hace 5 días | `local-op-0012` | Compra inicial de desinfectante de pisos |
| 8 (Desinfect.)| Salida | 2 | `luis_dev` | Personal Limpieza | Hace 1 día | `local-op-0013` | Uso en mantenimiento de laboratorios |

---

## 🛠️ Guía de Pruebas y Aseguramiento de Calidad (QA)

### 🔐 1. Validación de Login Vulnerabilidad (Resuelta)
* **Caso de Prueba 1.1 (Credenciales Incorrectas):**
  * Intenta iniciar sesión con `admin` y contraseña `password_errado`.
  * **Resultado Esperado:** La aplicación **debe mostrar el mensaje de error** "Credenciales inválidas" o similar, y **denegar** el acceso a la aplicación de escritorio.
* **Caso de Prueba 1.2 (Credenciales Correctas):**
  * Inicia sesión con `admin` y contraseña `admin123`.
  * **Resultado Esperado:** Acceso exitoso, visualización del Dashboard general con los Bento grids poblados con la data pre-sembrada.
* **Caso de Prueba 1.3 (Restricción de Roles):**
  * Inicie sesión en Asistencia Desktop con `luis_dev` (rol Operador: `role_id: 2`).
  * **Resultado Esperado:** Acceso concedido al dashboard y al kiosco, pero la pestaña de **Ajustes** (Settings) debe bloquear la gestión de usuarios y terminales, reservando dichas vistas exclusivamente para los administradores (`role_id: 1`).

### 🌐 2. Simulación Offline y Heartbeat
* **Caso de Prueba 2.1 (Estado Online):**
  * Con las API Docker Compose ejecutándose en el background.
  * **Resultado Esperado:** El icono de la red en la esquina superior derecha debe aparecer como conectado (color verde, Wifi icon).
* **Caso de Prueba 2.2 (Transición Offline Contingente):**
  * Apague las APIs Docker ejecutando: `docker compose stop asistencia-api inventario-api`.
  * **Resultado Esperado:** En un lapso máximo de 5 segundos, el indicador de conectividad de los clientes de escritorio debe conmutar a **Desconectado** (color rojo, WifiOff icon).
  * Intente iniciar sesión ahora con el servidor caído.
  * **Resultado Esperado:** La aplicación debe permitir el inicio de sesión bajo el **Modo Contingencia** de forma local, mostrando un toast informativo de inicio sin conexión.
