[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$EnvFile,
  [string]$ComposeFile = '',
  [string]$ProjectName = 'infounsa-asistencia-inventario-qa',
  [string]$ReportRoot = 'qa\reports\docker-qa',
  [int]$TimeoutSeconds = 240,
  [switch]$KeepServices,
  [switch]$SkipContractTests,
  [switch]$SkipMySqlIntegration,
  [switch]$ResetData,
  [string]$AdminUsername = 'admin',
  [string]$AdminPassword = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

if ([string]::IsNullOrWhiteSpace($ComposeFile)) {
  $ComposeFile = Join-Path $repoRoot 'docker-compose.asistencia-inventario.qa.yml'
} elseif (-not [System.IO.Path]::IsPathRooted($ComposeFile)) {
  $ComposeFile = Join-Path $repoRoot $ComposeFile
}

if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile = Join-Path $repoRoot $EnvFile
}

if (-not (Test-Path -LiteralPath $ComposeFile -PathType Leaf)) {
  throw "No existe el Compose QA: $ComposeFile"
}
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
  throw "No existe el archivo de variables QA: $EnvFile"
}

$dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
$standaloneComposeCommand = Get-Command docker-compose.exe -ErrorAction SilentlyContinue
if (-not $dockerCommand -and -not $standaloneComposeCommand) {
  throw 'No se encontro docker.exe ni docker-compose.exe en PATH.'
}

$composeExecutable = $null
$composeBaseArguments = @()
if ($dockerCommand) {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $dockerCommand.Source compose version 2>$null | Out-Null
  $composePluginExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
  $ErrorActionPreference = $previousErrorActionPreference
  if ($composePluginExitCode -eq 0) {
    $composeExecutable = $dockerCommand.Source
    $composeBaseArguments = @('compose')
  }
}
if (-not $composeExecutable -and $standaloneComposeCommand) {
  $composeExecutable = $standaloneComposeCommand.Source
}
if (-not $composeExecutable) {
  throw 'No se encontro un plugin Compose V2 ni docker-compose.exe.'
}

$dockerConfigRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("infounsa-docker-qa-{0}" -f ([guid]::NewGuid().ToString('N')))
New-Item -ItemType Directory -Force -Path $dockerConfigRoot | Out-Null
$env:DOCKER_CONFIG = $dockerConfigRoot

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportRoot = if ([System.IO.Path]::IsPathRooted($ReportRoot)) {
  $ReportRoot
} else {
  Join-Path $repoRoot $ReportRoot
}
$runRoot = Join-Path $reportRoot $timestamp
$summaryPath = Join-Path $runRoot 'summary.md'
$logPath = Join-Path $runRoot 'pipeline.log'
$results = New-Object System.Collections.Generic.List[object]
$started = $false

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

function Write-Log {
  param([string]$Message)
  $line = '[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message
  Write-Host $line
  Add-Content -LiteralPath $logPath -Value $line
}

function Add-Result {
  param(
    [string]$Stage,
    [string]$Name,
    [string]$Status,
    [string]$Notes = ''
  )
  $results.Add([pscustomobject]@{
    Stage = $Stage
    Name = $Name
    Status = $Status
    Notes = $Notes.Replace('|', '/')
  }) | Out-Null
}

$composePrefix = @(
  '--project-name', $ProjectName,
  '--env-file', $EnvFile,
  '--file', $ComposeFile
)

function Invoke-Compose {
  param(
    [string]$Stage,
    [string]$Name,
    [string[]]$Arguments
  )

  Write-Log "START [$Stage] $Name"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = @(& $composeExecutable @composeBaseArguments @composePrefix @Arguments 2>&1)
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
  $ErrorActionPreference = $previousErrorActionPreference
  foreach ($line in $output) {
    Add-Content -LiteralPath $logPath -Value ([string]$line)
  }

  if ($exitCode -ne 0) {
    Add-Result -Stage $Stage -Name $Name -Status 'FAIL' -Notes "exit code $exitCode"
    throw "$Name fallo con codigo $exitCode. Revisar $logPath"
  }

  Add-Result -Stage $Stage -Name $Name -Status 'OK'
  Write-Log "OK [$Stage] $Name"
}

function Invoke-HostCommand {
  param(
    [string]$Stage,
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory = $repoRoot
  )

  Write-Log "START [$Stage] $Name"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  Push-Location $WorkingDirectory
  try {
    $output = @(& $FilePath @Arguments 2>&1)
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
  } finally {
    Pop-Location
    $ErrorActionPreference = $previousErrorActionPreference
  }

  foreach ($line in $output) {
    Add-Content -LiteralPath $logPath -Value ([string]$line)
  }

  if ($exitCode -ne 0) {
    Add-Result -Stage $Stage -Name $Name -Status 'FAIL' -Notes "exit code $exitCode"
    throw "$Name fallo con codigo $exitCode. Revisar $logPath"
  }

  Add-Result -Stage $Stage -Name $Name -Status 'OK'
  Write-Log "OK [$Stage] $Name"
}

function Get-EnvValue {
  param([string]$Key)

  $escapedKey = [regex]::Escape($Key)
  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) {
      continue
    }
    if ($trimmed -match "^$escapedKey\s*=\s*(.*)$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }

  throw "No se encontro $Key en el archivo de variables QA: $EnvFile"
}

function New-IntegrationDatabaseUrl {
  param(
    [string]$Prefix,
    [string]$DatabasePortKey
  )

  $user = Get-EnvValue "${Prefix}_DB_USER"
  $password = Get-EnvValue "${Prefix}_DB_PASSWORD"
  $database = Get-EnvValue "${Prefix}_DB_NAME"
  $port = Get-EnvValue $DatabasePortKey
  if ([string]::IsNullOrWhiteSpace($port)) {
    $port = if ($Prefix -eq 'ASISTENCIA') { '13306' } else { '13307' }
  }

  return 'mysql://{0}:{1}@127.0.0.1:{2}/{3}' -f `
    [uri]::EscapeDataString($user),
    [uri]::EscapeDataString($password),
    $port,
    [uri]::EscapeDataString($database)
}

function Wait-Api {
  param(
    [string]$Name,
    [int]$Port,
    [datetime]$Deadline
  )

  while ((Get-Date) -lt $Deadline) {
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -eq 200) {
        Add-Result -Stage 'health' -Name $Name -Status 'OK' -Notes "GET /health en $Port"
        Write-Log "OK [health] $Name"
        return
      }
    } catch {
      # El servicio puede estar calentando o esperando a MySQL.
    }
    Start-Sleep -Seconds 3
  }

  Add-Result -Stage 'health' -Name $Name -Status 'FAIL' -Notes "sin respuesta 200 en $Port"
  throw "$Name no respondio /health dentro del tiempo limite."
}

Write-Log "Inicio de validacion Docker QA: $timestamp"
Write-Log 'Alcance: Asistencia e Inventario; WordPress y portal fuera de alcance'
Write-Log "Compose: $ComposeFile"
Write-Log "Opciones: contratos=$(-not $SkipContractTests), mysql=$(-not $SkipMySqlIntegration), resetData=$ResetData"

try {
  if ($ResetData) {
    Invoke-Compose -Stage 'cleanup' -Name 'compose-qa-reset-data' -Arguments @('down', '--volumes', '--remove-orphans')
  }

  Invoke-Compose -Stage 'config' -Name 'compose-qa-config' -Arguments @('config', '--quiet')
  Invoke-Compose -Stage 'build' -Name 'compose-qa-build' -Arguments @('build', 'asistencia-api', 'inventario-api')
  Invoke-Compose -Stage 'runtime' -Name 'compose-qa-up' -Arguments @('up', '-d', '--remove-orphans')
  $started = $true

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  Wait-Api -Name 'asistencia-api-health' -Port 43000 -Deadline $deadline
  Wait-Api -Name 'inventario-api-health' -Port 43001 -Deadline $deadline

  Invoke-Compose -Stage 'test' -Name 'unit-tests-asistencia-api' -Arguments @('exec', '-T', 'asistencia-api', 'npm', 'test', '--', '--runInBand')
  Invoke-Compose -Stage 'test' -Name 'unit-tests-inventario-api' -Arguments @('exec', '-T', 'inventario-api', 'npm', 'test', '--', '--runInBand')
  Invoke-Compose -Stage 'build' -Name 'container-build-asistencia-api' -Arguments @('exec', '-T', 'asistencia-api', 'npm', 'run', 'build')
  Invoke-Compose -Stage 'build' -Name 'container-build-inventario-api' -Arguments @('exec', '-T', 'inventario-api', 'npm', 'run', 'build')

  if ($SkipContractTests) {
    Add-Result -Stage 'contract' -Name 'newman-real-apis' -Status 'SKIP' -Notes 'se uso -SkipContractTests'
    Write-Log 'SKIP [contract] newman-real-apis'
  } else {
    $contractPassword = $AdminPassword
    if ([string]::IsNullOrWhiteSpace($contractPassword)) {
      $contractPassword = Get-EnvValue 'SEED_ADMIN_PASSWORD'
    }
    if ([string]::IsNullOrWhiteSpace($contractPassword) -or $contractPassword -match '(?i)^CAMBIAR_') {
      throw 'Defina una SEED_ADMIN_PASSWORD real en el archivo QA para ejecutar Newman contra las APIs reales.'
    }

    $npxCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
    if (-not $npxCommand) {
      throw 'No se encontro npx.cmd para ejecutar las colecciones Newman.'
    }

    $contractRuns = @(
      [pscustomobject]@{
        Name = 'newman-asistencia-api-real'
        Collection = Join-Path $repoRoot 'qa\postman\asistencia_api_collection.json'
        BaseUrl = 'http://127.0.0.1:43000'
      },
      [pscustomobject]@{
        Name = 'newman-inventario-api-real'
        Collection = Join-Path $repoRoot 'qa\postman\inventario_api_collection.json'
        BaseUrl = 'http://127.0.0.1:43001'
      }
    )

    foreach ($contract in $contractRuns) {
      $jsonReport = Join-Path $runRoot "$($contract.Name).json"
      $junitReport = Join-Path $runRoot "$($contract.Name).xml"
      Invoke-HostCommand -Stage 'contract' -Name $contract.Name -FilePath $npxCommand.Source -Arguments @(
        '-y', 'newman', 'run', $contract.Collection,
        '--env-var', "baseUrl=$($contract.BaseUrl)",
        '--env-var', "adminUsername=$AdminUsername",
        '--env-var', "adminPassword=$contractPassword",
        '-r', 'cli,json,junit',
        '--reporter-json-export', $jsonReport,
        '--reporter-junit-export', $junitReport
      )
    }
  }

  if ($SkipMySqlIntegration) {
    Add-Result -Stage 'integration' -Name 'mysql-integracion-asistencia-inventario' -Status 'SKIP' -Notes 'se uso -SkipMySqlIntegration'
    Write-Log 'SKIP [integration] mysql-integracion-asistencia-inventario'
  } else {
    $previousAsistenciaIntegrationUrl = $env:ASISTENCIA_INTEGRATION_DATABASE_URL
    $previousInventarioIntegrationUrl = $env:INVENTARIO_INTEGRATION_DATABASE_URL
    try {
      $env:ASISTENCIA_INTEGRATION_DATABASE_URL = New-IntegrationDatabaseUrl -Prefix 'ASISTENCIA' -DatabasePortKey 'ASISTENCIA_QA_DB_PORT'
      $env:INVENTARIO_INTEGRATION_DATABASE_URL = New-IntegrationDatabaseUrl -Prefix 'INVENTARIO' -DatabasePortKey 'INVENTARIO_QA_DB_PORT'

      Invoke-HostCommand -Stage 'integration' -Name 'mysql-integracion-asistencia' -FilePath 'npm.cmd' -Arguments @('run', 'test:integration:mysql') -WorkingDirectory (Join-Path $repoRoot 'apps\asistencia\api')
      Invoke-HostCommand -Stage 'integration' -Name 'mysql-integracion-inventario' -FilePath 'npm.cmd' -Arguments @('run', 'test:integration:mysql') -WorkingDirectory (Join-Path $repoRoot 'apps\inventario\api')
    } finally {
      if ($null -eq $previousAsistenciaIntegrationUrl) { Remove-Item Env:ASISTENCIA_INTEGRATION_DATABASE_URL -ErrorAction SilentlyContinue } else { $env:ASISTENCIA_INTEGRATION_DATABASE_URL = $previousAsistenciaIntegrationUrl }
      if ($null -eq $previousInventarioIntegrationUrl) { Remove-Item Env:INVENTARIO_INTEGRATION_DATABASE_URL -ErrorAction SilentlyContinue } else { $env:INVENTARIO_INTEGRATION_DATABASE_URL = $previousInventarioIntegrationUrl }
    }
  }

  Invoke-Compose -Stage 'runtime' -Name 'compose-qa-ps' -Arguments @('ps')
} catch {
  Add-Content -LiteralPath $logPath -Value "ERROR: $($_.Exception.Message)"
  if ($results.Count -eq 0 -or @($results | Where-Object { $_.Status -eq 'FAIL' }).Count -eq 0) {
    Add-Result -Stage 'runner' -Name 'docker-qa-runner' -Status 'FAIL' -Notes $_.Exception.Message
  }
} finally {
  if ($started -and -not $KeepServices) {
    try {
      $cleanupArguments = @('down', '--remove-orphans')
      if ($ResetData) { $cleanupArguments += '--volumes' }
      Invoke-Compose -Stage 'cleanup' -Name 'compose-qa-down' -Arguments $cleanupArguments
    } catch {
      Add-Result -Stage 'cleanup' -Name 'compose-qa-down' -Status 'WARN' -Notes $_.Exception.Message
    }
  } elseif ($started) {
    Add-Result -Stage 'cleanup' -Name 'compose-qa-down' -Status 'SKIP' -Notes 'servicios conservados por -KeepServices'
  }
}

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add("# Validacion Docker QA Asistencia e Inventario - $timestamp")
$summary.Add('')
$summary.Add('Alcance: APIs Asistencia e Inventario con MySQL 8.4. WordPress y portal fuera de alcance.')
$summary.Add('')
$summary.Add('Orden: configuracion, build Docker, healthchecks, pruebas unitarias en contenedor, contratos Newman contra APIs reales, integracion MySQL idempotente y estado de servicios.')
$summary.Add('')
$summary.Add('| Etapa | Prueba | Estado | Notas |')
$summary.Add('| --- | --- | --- | --- |')
foreach ($result in $results) {
  $summary.Add("| $($result.Stage) | $($result.Name) | $($result.Status) | $($result.Notes) |")
}
$summary.Add('')
$summary.Add('Log: [pipeline.log](./pipeline.log)')
$summary | Set-Content -LiteralPath $summaryPath -Encoding UTF8

Write-Log "Resumen: $summaryPath"
$failed = @($results | Where-Object { $_.Status -eq 'FAIL' })
if ($failed.Count -gt 0) {
  exit 1
}
exit 0
