# Manual de Generación de Instaladores de Windows — Asistencia e Inventario

**Plataforma InfoUNSA** · Para el administrador de sistemas / desarrollador · Windows 10/11 x64

Este manual explica cómo generar los **instaladores `.exe`** de las aplicaciones de escritorio (kioscos): *InfoUNSA Asistencia* e *InfoUNSA Inventario*, cómo verificarlos y cómo instalarlos en los equipos. Los instaladores se generan **una vez por versión** y se copian a cada kiosco.

## Contenido

1. [Qué se genera](#1-qué-se-genera)
2. [Requisitos](#2-requisitos)
3. [Generación automática (recomendada)](#3-generación-automática-recomendada)
4. [Generación manual, aplicación por aplicación](#4-generación-manual-aplicación-por-aplicación)
5. [Verificar los instaladores](#5-verificar-los-instaladores)
6. [Instalar en un kiosco](#6-instalar-en-un-kiosco)
7. [Publicar una versión nueva](#7-publicar-una-versión-nueva)
8. [Firma digital y advertencias de Windows](#8-firma-digital-y-advertencias-de-windows)
9. [Problemas frecuentes](#9-problemas-frecuentes)

---

## 1. Qué se genera

| Aplicación | Instalador | Carpeta del código |
| :--- | :--- | :--- |
| Asistencia | `InfoUNSA-Asistencia-Setup-<versión>-x64.exe` | `apps\asistencia\desktop` |
| Inventario | `InfoUNSA-Inventario-Setup-<versión>-x64.exe` | `apps\inventario\desktop` |

Los instaladores quedan en la carpeta **`instaladores\`** (en la raíz del repositorio) junto con `release-manifest.json`, un archivo que registra para cada instalador su versión, tamaño, **huella SHA-256**, estado de firma y el commit del que se generó.

Cada instalador es un asistente **NSIS**: permite elegir la carpeta de instalación, crea accesos directos en el Escritorio y en el Menú Inicio, y se puede desinstalar desde *Configuración > Aplicaciones*. Reinstalar o actualizar **conserva los datos locales** del kiosco.

---

## 2. Requisitos

Se genera **en Windows** (la compilación de la base de datos local cifrada está pensada para el sistema donde se instala).

| Requisito | Detalle |
| :--- | :--- |
| Sistema | Windows 10/11 (o Server 2019+) de 64 bits |
| Node.js | 22.12 o superior (se recomienda 24 LTS): `node -v` |
| pnpm | 9 o superior: `pnpm -v` (`npm install -g pnpm`) |
| Git | Para clonar el repositorio |
| Internet | La primera vez se descargan Electron (unos 100 MB) y las herramientas de NSIS |
| Espacio en disco | Al menos 3 GB libres |
| Permisos | Abrir PowerShell **como administrador** (ver [problemas frecuentes](#9-problemas-frecuentes)) |

No hace falta MySQL ni tener las APIs instaladas en el equipo donde se generan los instaladores.

Antes de empezar, el repositorio debe estar clonado (manual 01, paso a) y con Node y pnpm instalados. Las dependencias las instala el propio script, o puedes hacerlo tú con `pnpm install`.

---

## 3. Generación automática (recomendada)

En **PowerShell** como administrador, desde la raíz del repositorio:

```powershell
cd C:\Plataforma\infounsa-asistencia-inventario
powershell -ExecutionPolicy Bypass -File scripts\generar-instaladores-windows.ps1
```

(Ajusta la ruta a la carpeta donde clonaste el repositorio.)

El script realiza estos pasos:

1. Comprueba que existan `node` y `pnpm`.
2. Ejecuta `pnpm install --frozen-lockfile` (instala dependencias y prepara el módulo nativo SQLCipher para Electron).
3. Compila los paquetes compartidos (`pnpm run build:packages`).
4. Para **cada aplicación**: borra su carpeta `dist-electron`, compila la interfaz (`tsc` + `vite build`) y empaqueta el instalador con `electron-builder`.
5. Copia cada instalador a `instaladores\` con el nombre `InfoUNSA-<Aplicación>-Setup-<versión>-x64.exe` y calcula su SHA-256.
6. Escribe `instaladores\release-manifest.json` y lo muestra en pantalla.

**Opciones:**

| Opción | Efecto |
| :--- | :--- |
| `-SkipInstall` | Omite `pnpm install` (útil si ya lo ejecutaste) |
| `-OutputDir D:\Entrega` | Deja los instaladores en otra carpeta |

La primera ejecución tarda varios minutos (descargas). Las siguientes son más rápidas. Al terminar verás el contenido del manifiesto y la ruta de salida.

---

## 4. Generación manual, aplicación por aplicación

Útil para generar solo uno de los instaladores o para ver los errores de cada paso. Funciona en **CMD y PowerShell**, desde la raíz del repositorio:

```powershell
pnpm install
pnpm run build:packages

pnpm --filter infounsa-asistencia-desktop run dist
pnpm --filter infounsa-inventario-desktop run dist
```

Los archivos se crean en la carpeta de cada aplicación:

| Aplicación | Ruta de salida |
| :--- | :--- |
| Asistencia | `apps\asistencia\desktop\dist-electron\` → `InfoUNSA-Asistencia-Instalador-<versión>.exe` |
| Inventario | `apps\inventario\desktop\dist-electron\` → `InfoUNSA-Inventario Setup <versión>.exe` |

(Los nombres que genera `electron-builder` difieren entre las dos aplicaciones; el script automático los unifica al copiarlos a `instaladores\`.) También aparecen archivos auxiliares (`win-unpacked\`, `.blockmap`): no se distribuyen.

> **Importante:** no ejecutes `npm ci` ni `npm install` dentro de las carpetas `desktop`. El proyecto es un monorepo y se instala con `pnpm` desde la raíz.

---

## 5. Verificar los instaladores

1. **Comprueba que existen** los dos `.exe` en `instaladores\` y que su tamaño es razonable (del orden de cien megabytes cada uno; un archivo de pocos KB indica un error).
2. **Verifica la huella SHA-256** y compárala con `release-manifest.json`. En CMD o PowerShell:

   ```powershell
   certutil -hashfile instaladores\InfoUNSA-Asistencia-Setup-1.3.10-x64.exe SHA256
   ```

   El resultado debe coincidir con el campo `sha256` del manifiesto. Esta comprobación sirve también para confirmar que una copia en USB o por red llegó intacta.
3. **Prueba la instalación en un equipo limpio** (no el equipo de desarrollo) antes de distribuirlos: instala, abre la aplicación y comprueba que muestra la pantalla de inicio de sesión.

---

## 6. Instalar en un kiosco

1. Copia el `.exe` al equipo (USB o carpeta compartida) y ejecútalo con doble clic.
2. En el asistente, elige la carpeta de instalación (o acepta la propuesta) y pulsa *Instalar*. Se crean los accesos directos en el Escritorio y el Menú Inicio con el nombre **InfoUNSA-Asistencia** o **InfoUNSA-Inventario**.
3. Abre la aplicación. En la pantalla de inicio de sesión, abre la **configuración del servidor** (icono de la rueda dentada) e indica la dirección de la API:
   - Asistencia: `http://<ip-del-servidor>:43000`
   - Inventario: `http://<ip-del-servidor>:43001`

   Debe aparecer el indicador **SERVIDOR ONLINE**. Si aparece OFFLINE, revisa la conexión de red y la regla de firewall del servidor (manuales 01 y 02, paso g).
4. Inicia sesión con el usuario administrador (`admin`; en una instalación nueva, contraseña `admin123`, que debe cambiarse en el primer ingreso).

Para **actualizar** un kiosco ejecuta el instalador nuevo sobre el existente: no se pierden las marcas ni los movimientos pendientes. Detalles de uso en los manuales de usuario (03 y 04) y de mantenimiento (05, sección 6.2).

---

## 7. Publicar una versión nueva

1. **Sube el número de versión** de la aplicación que cambió, en el campo `"version"` de su `package.json`:
   - `apps\asistencia\desktop\package.json`
   - `apps\inventario\desktop\package.json`

   El nombre del instalador y la actualización sobre equipos ya instalados dependen de este número (debe ser **mayor** que el instalado, por ejemplo `1.3.10` → `1.3.11`).
2. Haz commit de los cambios y genera los instaladores (sección 3).
3. Verifica las huellas (sección 5) y prueba en un equipo limpio y en uno con la versión anterior (actualización).
4. Distribuye la carpeta `instaladores\` (incluido `release-manifest.json`) y conserva una copia de cada versión entregada.

---

## 8. Firma digital y advertencias de Windows

Los instaladores **no están firmados digitalmente**. Por eso, al ejecutarlos, Windows puede mostrar *"Windows protegió su PC"* (SmartScreen) o el antivirus puede analizarlos. Para continuar: **Más información > Ejecutar de todas formas**. En el manifiesto, el campo `signatureStatus` aparece como `NotSigned`.

Para eliminar la advertencia hay que firmar con un **certificado de firma de código** (adquirido a una entidad certificadora). Con el certificado instalado, `electron-builder` lo usa al generar el instalador (variables `CSC_LINK` y `CSC_KEY_PASSWORD`); consulta la documentación de *electron-builder, Code Signing* antes de configurarlo.

---

## 9. Problemas frecuentes

| Síntoma | Causa y solución |
| :--- | :--- |
| `Cannot create symbolic link: A required privilege is not held by the client` al descargar las herramientas de NSIS | Windows impide crear enlaces simbólicos sin permisos. Abre PowerShell **como administrador** o activa el **Modo de desarrollador** (Windows 11: *Configuración > Sistema > Para programadores*; Windows 10: *Configuración > Actualización y seguridad > Para programadores*), y repite |
| `No se encontro 'pnpm'` / `'pnpm' no se reconoce` | Instala pnpm (`npm install -g pnpm`) y abre una terminal nueva |
| `ERR_PNPM_IGNORED_BUILDS`, `styleText is not a function`, `Cannot find module '@infounsa/shared-config'` | Ver los manuales 01 y 02 (sección *Problemas frecuentes*): actualizar Node, `git pull` y `pnpm build:packages` |
| `cp no se reconoce` | Repositorio desactualizado: haz `git pull` (el script `build` de `shared-types` se corrigió) |
| El script se detiene con "scripts deshabilitados" | Usa `powershell -ExecutionPolicy Bypass -File ...` como en los ejemplos |
| Falla la descarga de Electron o de NSIS (errores de red, `ETIMEDOUT`) | Comprueba internet, proxy o antivirus y repite; la descarga se reanuda y queda en caché |
| El instalador se genera pero el antivirus lo elimina | Falso positivo por no estar firmado: agrega una excepción para la carpeta `instaladores\` o firma el instalador |
| La aplicación instalada no abre o se cierra al iniciar | Comprueba que el equipo es de 64 bits; revisa el Visor de eventos de Windows; si persiste, genera de nuevo el instalador en un equipo limpio |
| No se encuentra ningún `.exe` en `dist-electron` | Falló el empaquetado: ejecuta la generación manual (sección 4) para ver el error completo |

**Alternativa en Linux:** `scripts/generar-instaladores-windows.sh` intenta generar los instaladores desde Linux, pero requiere `wine` y no se recomienda como método de entrega; los instaladores de producción deben generarse en Windows.
