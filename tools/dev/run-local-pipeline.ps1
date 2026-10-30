param(
  [switch]$IncludeWordPress,
  [switch]$SkipDockerBuild,
  [string]$ArtifactsDir = "qa/reports/local-pipeline",
  [switch]$InPlace
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

if (-not $InPlace) {
  $sourceRoot = $repoRoot
  $workRoot = Join-Path $env:TEMP "infounsa-local-pipeline-$timestamp"
  $artifactRoot = if ([System.IO.Path]::IsPathRooted($ArtifactsDir)) {
    $ArtifactsDir
  } else {
    Join-Path $sourceRoot $ArtifactsDir
  }

  New-Item -ItemType Directory -Force -Path $workRoot | Out-Null
  $qaReportsDir = Join-Path $sourceRoot "qa\reports"
  robocopy $sourceRoot $workRoot /MIR /XD .git node_modules dist .local-develop $qaReportsDir /XF *.tsbuildinfo | Out-Null
  $robocopyCode = $LASTEXITCODE
  if ($robocopyCode -ge 8) {
    throw "robocopy failed with exit code $robocopyCode"
  }

  $argsList = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Join-Path $workRoot "tools/dev/run-local-pipeline.ps1"),
    "-InPlace",
    "-ArtifactsDir",
    $artifactRoot
  )
  if ($IncludeWordPress) { $argsList += "-IncludeWordPress" }
  if ($SkipDockerBuild) { $argsList += "-SkipDockerBuild" }

  & powershell @argsList
  exit $LASTEXITCODE
}

$artifactRoot = if ([System.IO.Path]::IsPathRooted($ArtifactsDir)) {
  $ArtifactsDir
} else {
  Join-Path $repoRoot $ArtifactsDir
}
$runDir = Join-Path $artifactRoot $timestamp
$logFile = Join-Path $runDir "local-pipeline.log"
$summaryFile = Join-Path $runDir "summary.md"
$results = New-Object System.Collections.Generic.List[object]

New-Item -ItemType Directory -Force -Path $runDir | Out-Null

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -Path $logFile -Value $line
}

function Add-Result {
  param(
    [string]$Name,
    [string]$Status,
    [string]$Notes = ""
  )
  $results.Add([pscustomobject]@{
    Name = $Name
    Status = $Status
    Notes = $Notes
  }) | Out-Null
}

function Invoke-Step {
  param(
    [string]$Name,
    [string]$Command,
    [string]$WorkingDirectory = $repoRoot,
    [switch]$AllowFailure
  )

  Write-Log "START $Name"
  Push-Location $WorkingDirectory
  try {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & powershell -NoProfile -ExecutionPolicy Bypass -Command $Command 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    foreach ($line in $output) {
      Add-Content -Path $logFile -Value $line
    }

    if ($exitCode -eq 0) {
      Add-Result -Name $Name -Status "OK"
      Write-Log "OK $Name"
      return
    }

    $message = "exit code $exitCode"
    if ($AllowFailure) {
      Add-Result -Name $Name -Status "WARN" -Notes $message
      Write-Log "WARN $Name ($message)"
      return
    }

    Add-Result -Name $Name -Status "FAIL" -Notes $message
    Write-Log "FAIL $Name ($message)"
    throw "$Name failed with $message"
  } finally {
    Pop-Location
  }
}

function Test-PortAvailable {
  param([int]$Port)
  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  return -not $listener
}

Write-Log "Local pipeline started at $timestamp"
Write-Log "Repository: $repoRoot"
Write-Log "IncludeWordPress=$IncludeWordPress SkipDockerBuild=$SkipDockerBuild"

Invoke-Step -Name "validate-asistencia-api" -WorkingDirectory "$repoRoot/apps/asistencia/api" -Command "npm ci; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; npx prisma validate; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; npx prisma generate; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; npm run build"
Invoke-Step -Name "validate-inventario-api" -WorkingDirectory "$repoRoot/apps/inventario/api" -Command "npm ci; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; npx prisma validate; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; npx prisma generate; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; npm run build"
Invoke-Step -Name "validate-asistencia-desktop" -WorkingDirectory "$repoRoot/apps/asistencia/desktop" -Command "npm ci; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; npm run build"
Invoke-Step -Name "validate-inventario-desktop" -WorkingDirectory "$repoRoot/apps/inventario/desktop" -Command "npm ci; if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }; npm run build"

Invoke-Step -Name "security-audit-asistencia-api" -WorkingDirectory "$repoRoot/apps/asistencia/api" -Command "npm audit --audit-level=moderate"
Invoke-Step -Name "security-audit-inventario-api" -WorkingDirectory "$repoRoot/apps/inventario/api" -Command "npm audit --audit-level=moderate"
Invoke-Step -Name "security-audit-asistencia-desktop" -WorkingDirectory "$repoRoot/apps/asistencia/desktop" -Command "npm audit --audit-level=moderate"
Invoke-Step -Name "security-audit-inventario-desktop" -WorkingDirectory "$repoRoot/apps/inventario/desktop" -Command "npm audit --audit-level=moderate"

Invoke-Step -Name "compose-dev-config" -Command "docker compose config --quiet"
Invoke-Step -Name "compose-prod-required-vars-negative" -Command "Remove-Item Env:CI_REGISTRY_IMAGE,Env:ASISTENCIA_DB_PASSWORD,Env:ASISTENCIA_DB_ROOT_PASSWORD,Env:INVENTARIO_DB_PASSWORD,Env:INVENTARIO_DB_ROOT_PASSWORD,Env:JWT_SECRET,Env:JWT_SECRET_INVENTARIO -ErrorAction SilentlyContinue; docker compose -f docker-compose.prod.yml config --quiet; if (`$LASTEXITCODE -eq 0) { exit 1 }; exit 0"
Invoke-Step -Name "compose-prod-config" -Command "`$env:CI_REGISTRY_IMAGE='local/infounsa'; `$env:ASISTENCIA_DB_PASSWORD='x'; `$env:ASISTENCIA_DB_ROOT_PASSWORD='x'; `$env:INVENTARIO_DB_PASSWORD='x'; `$env:INVENTARIO_DB_ROOT_PASSWORD='x'; `$env:JWT_SECRET='x'; `$env:JWT_SECRET_INVENTARIO='x'; docker compose -f docker-compose.prod.yml config --quiet"

if (-not $SkipDockerBuild) {
  Invoke-Step -Name "build-asistencia-api-docker" -Command "docker build -f infra/docker/asistencia-api/Dockerfile apps/asistencia"
  Invoke-Step -Name "build-inventario-api-docker" -Command "docker build -f infra/docker/inventario-api/Dockerfile apps/inventario"
}

if ((Test-PortAvailable 3000) -and (Test-PortAvailable 3001)) {
  Write-Log "START mock-server for Newman tests"
  $mock = Start-Process -FilePath "node" -ArgumentList "qa/mock-server.js" -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 3
  try {
    Invoke-Step -Name "test-asistencia-api-newman" -Command "npx.cmd -y newman run qa/postman/asistencia_api_collection.json --env-var baseUrl=http://127.0.0.1:3000 -r cli"
    Invoke-Step -Name "test-inventario-api-newman" -Command "npx.cmd -y newman run qa/postman/inventario_api_collection.json --env-var baseUrl=http://127.0.0.1:3001 -r cli"
  } finally {
    Stop-Process -Id $mock.Id -Force -ErrorAction SilentlyContinue
    Write-Log "STOP mock-server"
  }
} else {
  Add-Result -Name "test-newman-mock" -Status "WARN" -Notes "ports 3000 or 3001 are already in use; mock server not started"
  Write-Log "WARN test-newman-mock ports 3000 or 3001 are already in use"
}

if ($IncludeWordPress) {
$phpLintCommand = @'
if (-not (Get-Command php -ErrorAction SilentlyContinue)) { exit 127 }
Get-ChildItem apps/portal-web-infounsa -Recurse -Filter *.php | ForEach-Object {
  php -l $_.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
'@
  Invoke-Step -Name "validate-portal-web-infounsa" -Command $phpLintCommand
} else {
  Add-Result -Name "validate-portal-web-infounsa" -Status "SKIP" -Notes "WordPress validation intentionally skipped"
  Write-Log "SKIP validate-portal-web-infounsa"
}

$markdown = @()
$markdown += "# Local pipeline summary - $timestamp"
$markdown += ""
$markdown += "| Job | Status | Notes |"
$markdown += "| --- | --- | --- |"
foreach ($result in $results) {
  $markdown += "| $($result.Name) | $($result.Status) | $($result.Notes) |"
}
$markdown += ""
$markdown += 'Log file: `' + $logFile + '`'
$markdown | Set-Content -Path $summaryFile -Encoding UTF8

Write-Log "Summary: $summaryFile"
Write-Log "Local pipeline finished"

$failed = $results | Where-Object { $_.Status -eq "FAIL" }
if ($failed.Count -gt 0) {
  exit 1
}
