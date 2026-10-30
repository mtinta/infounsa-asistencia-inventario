# Instala las APIs de Asistencia e Inventario como SERVICIOS de Windows usando NSSM
# (https://nssm.cc). Ejecutar como ADMINISTRADOR:
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-servicios-nssm.ps1 [-NssmPath C:\nssm\nssm.exe] [-MySqlService MySQL80]
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-servicios-nssm.ps1 -Quitar
# Cada API lee su configuracion de apps\<modulo>\api\.env (carpeta de trabajo del servicio).
param(
    [string]$NssmPath = "nssm.exe",
    [string]$MySqlService = "MySQL80",
    [switch]$Quitar
)
$ErrorActionPreference = "Stop"

$principalActual = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principalActual.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ejecuta PowerShell como Administrador."
}
if (-not (Get-Command $NssmPath -ErrorAction SilentlyContinue)) {
    throw "No se encontro NSSM ('$NssmPath'). Descargalo de https://nssm.cc y usa -NssmPath <ruta\nssm.exe>."
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$servicios = @(
    @{ Name = "AsistenciaAPI"; Dir = Join-Path $root "apps\asistencia\api"; Log = "asistencia-api" },
    @{ Name = "InventarioAPI"; Dir = Join-Path $root "apps\inventario\api"; Log = "inventario-api" }
)

if ($Quitar) {
    foreach ($svc in $servicios) {
        & $NssmPath stop $svc.Name 2>$null | Out-Null
        & $NssmPath remove $svc.Name confirm 2>$null | Out-Null
        Write-Host "Servicio $($svc.Name) eliminado."
    }
    exit 0
}

$node = (Get-Command node -ErrorAction Stop).Source
$logDir = Join-Path $root ".run\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$dependencia = if (Get-Service -Name $MySqlService -ErrorAction SilentlyContinue) { $MySqlService } else { $null }
if (-not $dependencia) { Write-Warning "No existe el servicio '$MySqlService'; se instala sin dependencia de MySQL." }

foreach ($svc in $servicios) {
    if (-not (Test-Path (Join-Path $svc.Dir "dist\main.js"))) {
        Write-Host "Compilando $($svc.Name)..."
        Push-Location $svc.Dir
        try { npm run build; if ($LASTEXITCODE -ne 0) { throw "Fallo la compilacion de $($svc.Name)" } } finally { Pop-Location }
    }
    if (Get-Service -Name $svc.Name -ErrorAction SilentlyContinue) {
        & $NssmPath stop $svc.Name 2>$null | Out-Null
        & $NssmPath remove $svc.Name confirm | Out-Null
    }
    & $NssmPath install $svc.Name $node "dist\main.js" | Out-Null
    & $NssmPath set $svc.Name AppDirectory $svc.Dir | Out-Null
    & $NssmPath set $svc.Name DisplayName $svc.Name | Out-Null
    & $NssmPath set $svc.Name Description "InfoUNSA - $($svc.Log)" | Out-Null
    & $NssmPath set $svc.Name Start SERVICE_AUTO_START | Out-Null
    & $NssmPath set $svc.Name AppExit Default Restart | Out-Null
    & $NssmPath set $svc.Name AppRestartDelay 5000 | Out-Null
    & $NssmPath set $svc.Name AppStdout (Join-Path $logDir "$($svc.Log).log") | Out-Null
    & $NssmPath set $svc.Name AppStderr (Join-Path $logDir "$($svc.Log).err.log") | Out-Null
    & $NssmPath set $svc.Name AppRotateFiles 1 | Out-Null
    & $NssmPath set $svc.Name AppRotateBytes 10485760 | Out-Null
    if ($dependencia) { & $NssmPath set $svc.Name DependOnService $dependencia | Out-Null }
    & $NssmPath start $svc.Name | Out-Null
    Write-Host "Servicio $($svc.Name) instalado e iniciado."
}
Write-Host "Verificar: Get-Service InfoUNSA-*   |   Logs: $logDir"
