# Inicia las APIs de Asistencia e Inventario en segundo plano (sin ventanas abiertas).
# PIDs y logs en .run\ . Para cerrarlos: scripts\detener-servidores.ps1
# Uso: powershell -ExecutionPolicy Bypass -File scripts\iniciar-servidores.ps1
# Con MySQL nativo (sin Docker): agregar -SinDocker
# -Esperar: no termina hasta que las APIs se detengan (lo usa la tarea de autoarranque)
param([switch]$SinDocker, [switch]$Esperar)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runDir = Join-Path $root ".run"
$logDir = Join-Path $runDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Cargar .env de la raiz (puertos)
$envFile = Join-Path $root ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $k, $v = $line.Split("=", 2)
            [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), "Process")
        }
    }
}
$asistenciaPort = if ($env:ASISTENCIA_API_PORT) { $env:ASISTENCIA_API_PORT } else { "43000" }
$inventarioPort = if ($env:INVENTARIO_API_PORT) { $env:INVENTARIO_API_PORT } else { "43001" }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js no esta instalado." }

if ($SinDocker) {
    Write-Host "-SinDocker: se usa el MySQL nativo configurado en los .env de cada API."
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "Levantando bases de datos (docker compose)..."
    docker compose -f (Join-Path $root "docker-compose.yml") up -d --wait asistencia-db inventario-db
    if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudieron levantar las bases de datos con Docker." }
} else {
    Write-Warning "Docker no encontrado; se asume MySQL disponible en los puertos configurados."
}

$started = @()
function Start-Api($name, $dir) {
    $pidFile = Join-Path $runDir "$name.pid"
    if (Test-Path $pidFile) {
        $existing = Get-Process -Id ([int](Get-Content $pidFile)) -ErrorAction SilentlyContinue
        if ($existing) { Write-Host "$name ya esta en ejecucion (PID $($existing.Id))."; return }
    }
    if (-not (Test-Path (Join-Path $dir "dist\main.js"))) {
        Write-Host "Compilando $name..."
        Push-Location $dir
        try { npm run build; if ($LASTEXITCODE -ne 0) { throw "Fallo la compilacion de $name" } } finally { Pop-Location }
    }
    $p = Start-Process -FilePath "node" -ArgumentList "dist/main.js" -WorkingDirectory $dir `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDir "$name.log") `
        -RedirectStandardError (Join-Path $logDir "$name.err.log")
    $p.Id | Set-Content $pidFile
    $script:started += $p
    Write-Host "$name iniciado (PID $($p.Id)) -> logs en $logDir"
}

Start-Api "asistencia-api" (Join-Path $root "apps\asistencia\api")
Start-Api "inventario-api" (Join-Path $root "apps\inventario\api")

Write-Host ""
Write-Host "Asistencia: http://localhost:$asistenciaPort"
Write-Host "Inventario: http://localhost:$inventarioPort"

if ($Esperar -and $started.Count -gt 0) {
    Wait-Process -Id ($started | ForEach-Object { $_.Id })
    # Si una API se cae sola, terminar con error para que la tarea programada reintente
    exit 1
}
