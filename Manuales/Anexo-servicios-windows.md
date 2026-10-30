# Manual de Servicios de Windows — APIs de Asistencia e Inventario

**Plataforma InfoUNSA** · Windows 10/11 y Windows Server 2019+

Una API ejecutada con `node dist/main.js` se detiene al cerrar la sesión o reiniciar el servidor. Este manual explica cómo dejar las dos APIs funcionando **de forma permanente**: arranque automático al encender el equipo y reinicio si se caen. Hay dos métodos; elige uno (no los combines).

| | **Método 1 — NSSM** (servicio real de Windows) | **Método 2 — Script de Windows** (tarea programada) |
| :--- | :--- | :--- |
| Software extra | NSSM (gratuito, un `.exe`) | Ninguno |
| Aparece en `services.msc` | Sí (`AsistenciaAPI`, `InventarioAPI`) | No (tarea `InfoUNSA-Servidores`) |
| Inicia antes del inicio de sesión | Sí | Sí (corre como `SYSTEM`) |
| Reinicio si una API se cae | Sí, a los 5 s, cada servicio por separado | Sí, hasta 3 reintentos, reinicia ambas APIs |
| Dependencia de MySQL | Sí (`DependOnService`) | Espera 1 min tras el arranque |
| Recomendado para | Servidores en producción | Equipos donde no se puede instalar software |

## 0. Antes de empezar

1. Completa la instalación de cada API (manuales [01](01-manual-tecnico-instalacion-api-asistencia.md) y [02](02-manual-tecnico-instalacion-api-inventario.md)): bases creadas, `.env` de cada API configurado y `npm run build` ejecutado. Comprueba que arrancan a mano con `node dist/main.js`.
2. Si usas **MySQL nativo**, confirma el nombre de su servicio: `Get-Service -Name 'MySQL*'` (normalmente `MySQL80`) y que esté en inicio automático.
3. Abre **PowerShell como Administrador** en la raíz del repositorio. Si PowerShell bloquea scripts, usa `-ExecutionPolicy Bypass` como en los ejemplos.
4. Cada API lee su configuración de `apps\<modulo>\api\.env`; los servicios usan esa carpeta como directorio de trabajo, así que no hay que repetir variables.

---

## Método 1 — NSSM

### 1.1. Instalar NSSM

1. Descarga NSSM desde <https://nssm.cc/download> y descomprime el zip.
2. Copia `win64\nssm.exe` a una ruta estable, por ejemplo `C:\nssm\nssm.exe` (o agrégalo al `PATH`).

### 1.2. Instalación automática (recomendada)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\instalar-servicios-nssm.ps1 -NssmPath C:\nssm\nssm.exe -MySqlService MySQL80
```

El script compila la API si falta `dist\`, crea los dos servicios, los configura como se detalla en 1.3 y los inicia. Omite `-NssmPath` si `nssm.exe` está en el `PATH`; omite `-MySqlService` si no usas MySQL nativo (aparece una advertencia y se instala sin dependencia).

### 1.3. Instalación manual (equivalente)

Repite para cada API cambiando los valores de la tabla:

| | Asistencia | Inventario |
| :--- | :--- | :--- |
| Nombre del servicio | `AsistenciaAPI` | `InventarioAPI` |
| Directorio | `C:\infounsa\infounsa-asistencia-inventario\apps\asistencia\api` | `C:\infounsa\infounsa-asistencia-inventario\apps\inventario\api` |
| Log | `asistencia-api` | `inventario-api` |

```powershell
$nssm = "C:\nssm\nssm.exe"
$node = (Get-Command node).Source
$svc  = "AsistenciaAPI"
$dir  = "C:\infounsa\infounsa-asistencia-inventario\apps\asistencia\api"
$logs = "C:\infounsa\infounsa-asistencia-inventario\.run\logs"
New-Item -ItemType Directory -Force $logs | Out-Null

& $nssm install $svc $node "dist\main.js"
& $nssm set $svc AppDirectory $dir
& $nssm set $svc Start SERVICE_AUTO_START
& $nssm set $svc AppExit Default Restart
& $nssm set $svc AppRestartDelay 5000
& $nssm set $svc AppStdout "$logs\asistencia-api.log"
& $nssm set $svc AppStderr "$logs\asistencia-api.err.log"
& $nssm set $svc AppRotateFiles 1
& $nssm set $svc AppRotateBytes 10485760
& $nssm set $svc DependOnService MySQL80
& $nssm start $svc
```

También puedes usar la interfaz gráfica: `nssm install AsistenciaAPI` abre una ventana (pestaña *Application*: ruta de `node.exe`, directorio y argumento `dist\main.js`; *I/O*: archivos de log; *Exit actions*: reinicio).

### 1.4. Operación

```powershell
Get-Service InfoUNSA-*                       # estado
Restart-Service AsistenciaAPI      # reiniciar (p. ej. tras actualizar)
Stop-Service InventarioAPI         # detener
nssm edit AsistenciaAPI            # editar configuración (GUI)
```

### 1.5. Desinstalar

```powershell
powershell -ExecutionPolicy Bypass -File scripts\instalar-servicios-nssm.ps1 -NssmPath C:\nssm\nssm.exe -Quitar
```

---

## Método 2 — Script de Windows (tarea programada, sin software adicional)

Registra una tarea que, al arrancar el equipo, ejecuta `scripts\iniciar-servidores.ps1`, que levanta ambas APIs en segundo plano.

### 2.1. Instalar

```powershell
# Con Docker para las bases de datos:
powershell -ExecutionPolicy Bypass -File scripts\instalar-autoarranque.ps1

# Con MySQL nativo (sin Docker):
powershell -ExecutionPolicy Bypass -File scripts\instalar-autoarranque.ps1 -SinDocker
```

La tarea `InfoUNSA-Servidores` corre como `SYSTEM`, 1 minuto después del arranque (para que MySQL o Docker ya estén listos), sin límite de tiempo. Si una API se cae, termina con error y Windows la reinicia hasta 3 veces (con 1 minuto entre intentos).

### 2.2. Probar sin reiniciar y operar

```powershell
Start-ScheduledTask -TaskName InfoUNSA-Servidores     # iniciar ahora
Get-ScheduledTask   -TaskName InfoUNSA-Servidores     # estado
powershell -File scripts\detener-servidores.ps1       # detener (también detiene la tarea)
```

### 2.3. Desinstalar

```powershell
powershell -ExecutionPolicy Bypass -File scripts\instalar-autoarranque.ps1 -Quitar
```

---

## 3. Verificación (ambos métodos)

1. Comprueba las respuestas: `Invoke-WebRequest http://localhost:43000/health` y `http://localhost:43001/health`.
2. Revisa los logs en `.run\logs\` (`asistencia-api.log`, `inventario-api.log` y los `*.err.log`).
3. **Prueba real:** reinicia el servidor y repite el paso 1 sin iniciar sesión.

## 4. Actualizar la versión en un servidor con servicios

```powershell
git pull
pnpm install
npm run build --prefix apps\asistencia\api
npm run build --prefix apps\inventario\api
Restart-Service AsistenciaAPI, InventarioAPI      # Método 1
Stop-ScheduledTask InfoUNSA-Servidores; Start-ScheduledTask InfoUNSA-Servidores   # Método 2
```

## 5. Problemas frecuentes

| Síntoma | Solución |
| :--- | :--- |
| El servicio se detiene al instante | Lee `.run\logs\*.err.log`. Casi siempre falta el `.env` de la API o MySQL no está disponible. |
| `Service MySQL80 does not exist` | El servicio MySQL tiene otro nombre: `Get-Service MySQL*` y pásalo en `-MySqlService`. |
| Puerto 43000/43001 ocupado | Hay una API iniciada a mano: `scripts\detener-servidores.ps1` o `Stop-Process -Id <PID>`. |
| Con el Método 2 las APIs no suben tras reiniciar | `node` debe estar en el `PATH` del **sistema** (no solo del usuario). Reinstala Node.js marcando "Add to PATH". |
| `nssm` no se reconoce | Usa `-NssmPath` con la ruta completa a `nssm.exe`. |
