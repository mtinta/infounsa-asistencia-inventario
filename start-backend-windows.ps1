# start-backend-windows.ps1
# Script para iniciar los servicios backend de InfoUNSA nativamente en Windows / Windows Server (sin Docker)

Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "       INFOUNSA - INICIANDO BACKEND NATIVO EN WINDOWS SERVER" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green

# 1. Comprobar requisitos
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js no está instalado en el sistema. Por favor instálalo para continuar."
    exit 1
}

# 2. Cargar variables de entorno del archivo .env de la raíz
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Write-Host "Cargando configuración de variables de entorno desde .env..." -ForegroundColor Cyan
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and !$line.StartsWith("#") -and $line.Contains("=")) {
            $key, $value = $line.Split("=", 2)
            $key = $key.Trim()
            $value = $value.Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value, [System.EnvironmentVariableTarget]::Process)
        }
    }
} else {
    Write-Warning "No se encontró el archivo .env en la raíz. Se usarán los puertos y configuraciones por defecto."
}

# 3. Leer y resolver puertos y URLs de bases de datos para ejecución local (localhost)
$asistenciaPort = [System.Environment]::GetEnvironmentVariable("ASISTENCIA_API_PORT")
if (!$asistenciaPort) { $asistenciaPort = "43000" }

$inventarioPort = [System.Environment]::GetEnvironmentVariable("INVENTARIO_API_PORT")
if (!$inventarioPort) { $inventarioPort = "43001" }

$asistenciaDbPort = [System.Environment]::GetEnvironmentVariable("ASISTENCIA_DB_PORT")
if (!$asistenciaDbPort) { $asistenciaDbPort = "43306" }

$inventarioDbPort = [System.Environment]::GetEnvironmentVariable("INVENTARIO_DB_PORT")
if (!$inventarioDbPort) { $inventarioDbPort = "43307" }

# Ajustar DATABASE_URL a '127.0.0.1' con protocolo mariadb:// y allowPublicKeyRetrieval=true para resiliencia en reinicios
$asistenciaDbUrl = "mariadb://infounsa:infounsa_2026@127.0.0.1:$asistenciaDbPort/infounsa_asistencia?allowPublicKeyRetrieval=true&connectTimeout=5000&acquireTimeout=5000"
$inventarioDbUrl = "mariadb://infounsa:infounsa_2026@127.0.0.1:$inventarioDbPort/infounsa_inventario?allowPublicKeyRetrieval=true&connectTimeout=5000&acquireTimeout=5000"

[System.Environment]::SetEnvironmentVariable("DATABASE_URL", $asistenciaDbUrl, [System.EnvironmentVariableTarget]::Process)
[System.Environment]::SetEnvironmentVariable("PORT", $asistenciaPort, [System.EnvironmentVariableTarget]::Process)

Write-Host "Servicio Asistencia API: Puerto $asistenciaPort | BD: 127.0.0.1:$asistenciaDbPort" -ForegroundColor Yellow
Write-Host "Servicio Inventario API: Puerto $inventarioPort | BD: 127.0.0.1:$inventarioDbPort" -ForegroundColor Yellow

# 4. Iniciar con PM2 si está disponible
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    Write-Host "`nPM2 detectado. Iniciando servicios mediante PM2..." -ForegroundColor Green
    
    # Detener servicios anteriores si existen
    pm2 stop "asistencia-api" 2>$null | Out-Null
    pm2 stop "inventario-api" 2>$null | Out-Null
    pm2 delete "asistencia-api" 2>$null | Out-Null
    pm2 delete "inventario-api" 2>$null | Out-Null

    # Iniciar Asistencia
    $asistenciaScript = Join-Path $PSScriptRoot "apps/asistencia/api/dist/main.js"
    if (!(Test-Path $asistenciaScript)) {
        Write-Host "Compilando Asistencia API..." -ForegroundColor Cyan
        npm run build --prefix apps/asistencia/api
    }
    pm2 start $asistenciaScript --name "asistencia-api" --env PORT=$asistenciaPort --env DATABASE_URL=$asistenciaDbUrl

    # Iniciar Inventario
    $inventarioScript = Join-Path $PSScriptRoot "apps/inventario/api/dist/main.js"
    if (!(Test-Path $inventarioScript)) {
        Write-Host "Compilando Inventario API..." -ForegroundColor Cyan
        npm run build --prefix apps/inventario/api
    }
    pm2 start $inventarioScript --name "inventario-api" --env PORT=$inventarioPort --env DATABASE_URL=$inventarioDbUrl

    pm2 list
    Write-Host "`n¡Servicios levantados en segundo plano con PM2!" -ForegroundColor Green
    Write-Host "Usa 'pm2 logs' para ver la salida en tiempo real." -ForegroundColor Green
} else {
    # 5. Fallback a procesos nativos de node independientes si no hay PM2
    Write-Host "`nPM2 no detectado en el sistema. Iniciando procesos nativos de Node en ventanas de PowerShell separadas..." -ForegroundColor Yellow
    
    # Compilar si es necesario
    if (!(Test-Path (Join-Path $PSScriptRoot "apps/asistencia/api/dist/main.js"))) {
        Write-Host "Compilando Asistencia API..." -ForegroundColor Cyan
        npm run build --prefix apps/asistencia/api
    }
    if (!(Test-Path (Join-Path $PSScriptRoot "apps/inventario/api/dist/main.js"))) {
        Write-Host "Compilando Inventario API..." -ForegroundColor Cyan
        npm run build --prefix apps/inventario/api
    }

    # Lanzar Asistencia en nueva ventana
    $asistenciaCmd = "cd '$PSScriptRoot\apps\asistencia\api'; `$env:PORT='$asistenciaPort'; `$env:DATABASE_URL='$asistenciaDbUrl'; node dist/main.js"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $asistenciaCmd -WindowStyle Normal

    # Lanzar Inventario en nueva ventana
    $inventarioCmd = "cd '$PSScriptRoot\apps\inventario\api'; `$env:PORT='$inventarioPort'; `$env:DATABASE_URL='$inventarioDbUrl'; node dist/main.js"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $inventarioCmd -WindowStyle Normal

    Write-Host "`n¡Servicios iniciados en ventanas de PowerShell separadas!" -ForegroundColor Green
}
