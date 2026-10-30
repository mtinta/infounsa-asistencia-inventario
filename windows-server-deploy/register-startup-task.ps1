[CmdletBinding()]
param(
    [string]$TaskName = 'InfoUNSA-APIs-Startup',
    [string]$MySqlServiceName = 'MySQL80',
    [string]$EnvFile = 'C:\ProgramData\InfoUNSA\config\infounsa-production.env',
    [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Ejecute PowerShell como Administrador para registrar la tarea de inicio.'
}

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output "Tarea '$TaskName' eliminada si existia."
    exit 0
}

$mysqlService = Get-Service -Name $MySqlServiceName -ErrorAction SilentlyContinue
if (-not $mysqlService) {
    throw "No existe el servicio MySQL '$MySqlServiceName'. Instale MySQL o indique su nombre con -MySqlServiceName."
}

$dockerService = Get-Service | Where-Object {
    $_.Name -in @('docker', 'docker-msft') -or $_.DisplayName -match '^Docker'
} | Select-Object -First 1
if (-not $dockerService) {
    throw 'No se encontro el servicio de Docker.'
}

if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    throw "No existe el archivo de variables de produccion: $EnvFile"
}

Set-Service -Name $mysqlService.Name -StartupType Automatic
Set-Service -Name $dockerService.Name -StartupType Automatic

$startScript = Join-Path $PSScriptRoot 'start-stack.ps1'
$composeFile = Join-Path $PSScriptRoot 'docker-compose.yml'
$actionArguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$startScript`" -ComposeFile `"$composeFile`" -EnvFile `"$EnvFile`" -MySqlServiceName `"$MySqlServiceName`""
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument $actionArguments
$trigger = New-ScheduledTaskTrigger -AtStartup
$taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Description 'Inicia MySQL y las APIs Asistencia/Inventario de InfoUNSA en contenedores Windows.' -Force | Out-Null
Write-Output "Tarea '$TaskName' registrada para iniciar MySQL y el stack de APIs."
