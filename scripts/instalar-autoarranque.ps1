# Registra una tarea programada que inicia las APIs de Asistencia e Inventario al arrancar Windows.
# Ejecutar como ADMINISTRADOR:
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-autoarranque.ps1 [-SinDocker]
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-autoarranque.ps1 -Quitar
param(
    [string]$TaskName = "InfoUNSA-Servidores",
    [switch]$SinDocker,
    [switch]$Quitar
)
$ErrorActionPreference = "Stop"

$principalActual = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principalActual.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ejecuta PowerShell como Administrador."
}

if ($Quitar) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Tarea '$TaskName' eliminada."
    exit 0
}

$script = Join-Path $PSScriptRoot "iniciar-servidores.ps1"
$argumentos = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`" -Esperar"
if ($SinDocker) { $argumentos += " -SinDocker" }

$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument $argumentos -WorkingDirectory (Split-Path $PSScriptRoot)
$trigger = New-ScheduledTaskTrigger -AtStartup
# Retraso para que MySQL / Docker ya esten arriba
$trigger.Delay = "PT1M"
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
# Sin limite de tiempo (por defecto Windows detiene las tareas a las 72 h); reintenta si falla
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings -Description "Inicia las APIs de Asistencia e Inventario de InfoUNSA al arrancar el servidor." -Force | Out-Null
Write-Host "Tarea '$TaskName' registrada. Se ejecutara en el proximo reinicio."
Write-Host "Probar ahora: Start-ScheduledTask -TaskName $TaskName   |   Logs: $(Join-Path (Split-Path $PSScriptRoot) '.run\logs')"
