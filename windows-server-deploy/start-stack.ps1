[CmdletBinding()]
param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot 'docker-compose.yml'),
    [Parameter(Mandatory = $true)]
    [string]$EnvFile,
    [string]$MySqlServiceName = 'MySQL80',
    [int]$MySqlPort = 3306
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ComposeFile -PathType Leaf)) {
    throw "No existe el archivo Compose: $ComposeFile"
}
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    throw "No existe el archivo de variables de produccion: $EnvFile"
}

$mysqlService = Get-Service -Name $MySqlServiceName -ErrorAction SilentlyContinue
if (-not $mysqlService) {
    throw "No existe el servicio MySQL '$MySqlServiceName'. Use -MySqlServiceName con el nombre real del servicio."
}

if ($mysqlService.Status -ne 'Running') {
    Start-Service -Name $mysqlService.Name
    $mysqlService.WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
}

$dockerService = Get-Service | Where-Object {
    $_.Name -in @('docker', 'docker-msft') -or $_.DisplayName -match '^Docker'
} | Select-Object -First 1
if (-not $dockerService) {
    throw 'No se encontro el servicio de Docker.'
}
if ($dockerService.Status -ne 'Running') {
    Start-Service -Name $dockerService.Name
    $dockerService.WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
}

$databaseReady = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    if (Test-NetConnection -ComputerName '127.0.0.1' -Port $MySqlPort -InformationLevel Quiet) {
        $databaseReady = $true
        break
    }
    Start-Sleep -Seconds 2
}
if (-not $databaseReady) {
    throw "MySQL no acepta conexiones en 127.0.0.1:$MySqlPort despues de 60 segundos."
}

$composeMode = 'plugin'
& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
        throw 'No se encontro Docker Compose V2 ni docker-compose.exe.'
    }
    $composeMode = 'standalone'
}

function Invoke-InfoUnsaCompose {
    param([string[]]$Arguments)

    if ($composeMode -eq 'plugin') {
        & docker compose --env-file $EnvFile -f $ComposeFile @Arguments
    } else {
        & docker-compose --env-file $EnvFile -f $ComposeFile @Arguments
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose fallo con codigo $LASTEXITCODE."
    }
}

Invoke-InfoUnsaCompose @('config', '--quiet')
Invoke-InfoUnsaCompose @('up', '-d', '--remove-orphans')
Invoke-InfoUnsaCompose @('ps')
