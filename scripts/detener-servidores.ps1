# Detiene las APIs iniciadas con iniciar-servidores.ps1
# Uso: powershell -ExecutionPolicy Bypass -File scripts\detener-servidores.ps1 [-ConDb]
param([switch]$ConDb)
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runDir = Join-Path $root ".run"

# Si el autoarranque esta instalado, detener tambien la tarea para que no reinicie las APIs
Stop-ScheduledTask -TaskName "InfoUNSA-Servidores" -ErrorAction SilentlyContinue

foreach ($name in @("asistencia-api", "inventario-api")) {
    $pidFile = Join-Path $runDir "$name.pid"
    $proc = $null
    if (Test-Path $pidFile) { $proc = Get-Process -Id ([int](Get-Content $pidFile)) -ErrorAction SilentlyContinue }
    if ($proc) {
        Stop-Process -Id $proc.Id -Force
        Write-Host "$name detenido (PID $($proc.Id))."
    } else {
        Write-Host "$name no estaba en ejecucion."
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}

if ($ConDb -and (Get-Command docker -ErrorAction SilentlyContinue)) {
    docker compose -f (Join-Path $root "docker-compose.yml") stop asistencia-db inventario-db
}
