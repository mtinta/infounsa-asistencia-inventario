[CmdletBinding()]
param(
  [string]$ArtifactsDir = "qa/reports/local-ci",
  [string]$NpmCacheDir = "",
  [string]$SecurityToolsRoot = "D:\security-cf",
  [switch]$SkipDockerBuild,
  [switch]$RunDockerQa,
  [string]$DockerQaEnvFile = "qa/config/asistencia-inventario.docker.env",
  [switch]$ResetDockerQaData,
  [switch]$SkipDockerQaContractTests,
  [switch]$SkipDockerQaMySqlIntegration,
  [switch]$BuildInstallers,
  [switch]$RunMySqlIntegration,
  [switch]$StrictSecurity,
  [switch]$SecurityOnly,
  [string]$ZapTargetUrl = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

if ([string]::IsNullOrWhiteSpace($NpmCacheDir)) {
  $NpmCacheDir = Join-Path ([System.IO.Path]::GetTempPath()) "infounsa-local-ci-npm-cache"
}

$artifactRoot = if ([System.IO.Path]::IsPathRooted($ArtifactsDir)) {
  $ArtifactsDir
} else {
  Join-Path $repoRoot $ArtifactsDir
}
$runDir = Join-Path $artifactRoot $timestamp
$logFile = Join-Path $runDir "pipeline.log"
$summaryFile = Join-Path $runDir "summary.md"
$results = New-Object System.Collections.Generic.List[object]

New-Item -ItemType Directory -Force -Path $runDir | Out-Null
New-Item -ItemType Directory -Force -Path $NpmCacheDir | Out-Null

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -Path $logFile -Value $line
}

function Add-Result {
  param(
    [string]$Stage,
    [string]$Name,
    [string]$Status,
    [string]$Notes = "",
    [string]$Artifact = ""
  )
  $results.Add([pscustomobject]@{
    Stage = $Stage
    Name = $Name
    Status = $Status
    Notes = $Notes.Replace("|", "/")
    Artifact = $Artifact
  }) | Out-Null
}

function Invoke-External {
  param(
    [string]$Stage,
    [string]$Name,
    [string]$FilePath,
    [string[]]$ArgumentList = @(),
    [string]$WorkingDirectory = $repoRoot,
    [string]$OutputFile = "",
    [switch]$AllowFailure
  )

  Write-Log "START [$Stage] $Name"
  $outputLines = @()
  $exitCode = 127
  Push-Location $WorkingDirectory
  try {
    $ErrorActionPreference = "Continue"
    $outputLines = @(& $FilePath @ArgumentList 2>&1)
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
    $ErrorActionPreference = "Stop"
  } catch {
    $outputLines += $_.Exception.Message
    $exitCode = 127
    $ErrorActionPreference = "Stop"
  } finally {
    Pop-Location
  }

  foreach ($line in $outputLines) {
    Add-Content -Path $logFile -Value ([string]$line)
  }
  if (-not [string]::IsNullOrWhiteSpace($OutputFile)) {
    $outputLines | ForEach-Object { [string]$_ } | Set-Content -Path $OutputFile -Encoding UTF8
  }

  $artifactName = if ([string]::IsNullOrWhiteSpace($OutputFile)) { "" } else { Split-Path -Leaf $OutputFile }
  if ($exitCode -eq 0) {
    Add-Result -Stage $Stage -Name $Name -Status "OK" -Artifact $artifactName
    Write-Log "OK [$Stage] $Name"
  } elseif ($AllowFailure) {
    Add-Result -Stage $Stage -Name $Name -Status "WARN" -Notes "exit code $exitCode" -Artifact $artifactName
    Write-Log "WARN [$Stage] $Name (exit code $exitCode)"
  } else {
    Add-Result -Stage $Stage -Name $Name -Status "FAIL" -Notes "exit code $exitCode" -Artifact $artifactName
    Write-Log "FAIL [$Stage] $Name (exit code $exitCode)"
  }
  return $exitCode
}

function Invoke-Npm {
  param(
    [string]$Stage,
    [string]$Name,
    [string]$WorkingDirectory,
    [string[]]$Arguments,
    [string]$OutputFile = "",
    [switch]$AllowFailure
  )
  return Invoke-External -Stage $Stage -Name $Name -FilePath "npm.cmd" -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -OutputFile $OutputFile -AllowFailure:$AllowFailure
}

function Get-AuditSummary {
  param([string]$Path)
  try {
    $document = Get-Content -Raw -Path $Path | ConvertFrom-Json
    $vulnerabilities = $document.metadata.vulnerabilities
    return [pscustomobject]@{
      Total = [int]$vulnerabilities.total
      Critical = [int]$vulnerabilities.critical
      High = [int]$vulnerabilities.high
      Moderate = [int]$vulnerabilities.moderate
      Low = [int]$vulnerabilities.low
    }
  } catch {
    return $null
  }
}

function Get-TrivySummary {
  param([string]$Path)
  try {
    $document = Get-Content -Raw -Path $Path | ConvertFrom-Json
    $vulnerabilities = @()
    $misconfigurations = @()
    $secrets = @()
    foreach ($result in @($document.Results)) {
      if ($null -ne $result.Vulnerabilities) { $vulnerabilities += @($result.Vulnerabilities) }
      if ($null -ne $result.Misconfigurations) { $misconfigurations += @($result.Misconfigurations) }
      if ($null -ne $result.Secrets) { $secrets += @($result.Secrets) }
    }
    $high = @($vulnerabilities | Where-Object { $_.Severity -in @("CRITICAL", "HIGH") }).Count
    return [pscustomobject]@{
      Vulnerabilities = $vulnerabilities.Count
      Misconfigurations = $misconfigurations.Count
      Secrets = $secrets.Count
      HighOrCritical = $high
    }
  } catch {
    return $null
  }
}

function Get-SemgrepSummary {
  param([string]$Path)
  try {
    $document = Get-Content -Raw -Path $Path | ConvertFrom-Json
    $findings = if ($null -eq $document.results) { 0 } else { @($document.results).Count }
    $errors = if ($null -eq $document.errors) { 0 } else { @($document.errors).Count }
    return [pscustomobject]@{
      Findings = $findings
      Errors = $errors
    }
  } catch {
    return $null
  }
}

function Get-ZapSummary {
  param([string]$Path)
  try {
    $html = Get-Content -Raw -Path $Path
    $options = [System.Text.RegularExpressions.RegexOptions]::Singleline
    $levels = @{}
    foreach ($level in @("High", "Medium", "Low", "Informational")) {
      $class = switch ($level) {
        "High" { "risk-3" }
        "Medium" { "risk-2" }
        "Low" { "risk-1" }
        "Informational" { "risk-0" }
      }
      $pattern = 'class="{0}".*?<div>{1}</div>.*?<div>(\d+)</div>' -f $class, $level
      $match = [System.Text.RegularExpressions.Regex]::Match($html, $pattern, $options)
      $levels[$level] = if ($match.Success) { [int]$match.Groups[1].Value } else { 0 }
    }
    return [pscustomobject]@{
      High = $levels["High"]
      Medium = $levels["Medium"]
      Low = $levels["Low"]
      Informational = $levels["Informational"]
      Total = $levels["High"] + $levels["Medium"] + $levels["Low"] + $levels["Informational"]
    }
  } catch {
    return $null
  }
}

function Invoke-SecurityToolVersion {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory = $repoRoot
  )
  if (-not (Test-Path -LiteralPath $FilePath)) {
    Add-Result -Stage "security" -Name $Name -Status "WARN" -Notes "herramienta no encontrada: $FilePath"
    Write-Log "WARN [security] $Name herramienta no encontrada"
    return
  }
  Invoke-External -Stage "security" -Name $Name -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -AllowFailure | Out-Null
}

Write-Log "Local CI started: $timestamp"
Write-Log "Repository: $repoRoot"
Write-Log "Scope: apps/asistencia/{api,desktop} and apps/inventario/{api,desktop}"
Write-Log "WordPress is outside this pipeline scope"
Write-Log "Options: SkipDockerBuild=$SkipDockerBuild RunDockerQa=$RunDockerQa BuildInstallers=$BuildInstallers RunMySqlIntegration=$RunMySqlIntegration StrictSecurity=$StrictSecurity SecurityOnly=$SecurityOnly"

$appSpecs = @(
  [pscustomobject]@{ Key = "asistencia-api"; Path = "apps\asistencia\api"; Kind = "api" },
  [pscustomobject]@{ Key = "asistencia-desktop"; Path = "apps\asistencia\desktop"; Kind = "desktop" },
  [pscustomobject]@{ Key = "inventario-api"; Path = "apps\inventario\api"; Kind = "api" },
  [pscustomobject]@{ Key = "inventario-desktop"; Path = "apps\inventario\desktop"; Kind = "desktop" }
)

if (-not $SecurityOnly) {
foreach ($app in $appSpecs) {
  $appRoot = Join-Path $repoRoot $app.Path
  if (-not (Test-Path -LiteralPath $appRoot)) {
    Add-Result -Stage "validate" -Name "exists-$($app.Key)" -Status "FAIL" -Notes "ruta no encontrada: $($app.Path)"
    continue
  }

  Invoke-Npm -Stage "validate" -Name "npm-ci-$($app.Key)" -WorkingDirectory $appRoot -Arguments @("ci", "--ignore-scripts", "--no-audit", "--no-fund", "--cache", $NpmCacheDir) | Out-Null

  if ($app.Kind -eq "api") {
    Invoke-Npm -Stage "validate" -Name "prisma-generate-$($app.Key)" -WorkingDirectory $appRoot -Arguments @("run", "postinstall") | Out-Null
    $prismaBin = Join-Path $appRoot "node_modules\.bin\prisma.cmd"
    if (Test-Path -LiteralPath $prismaBin) {
      Invoke-External -Stage "validate" -Name "prisma-validate-$($app.Key)" -FilePath $prismaBin -ArgumentList @("validate") -WorkingDirectory $appRoot | Out-Null
    } else {
      Add-Result -Stage "validate" -Name "prisma-validate-$($app.Key)" -Status "FAIL" -Notes "prisma.cmd no fue generado"
    }
  }

  Invoke-Npm -Stage "build" -Name "build-$($app.Key)" -WorkingDirectory $appRoot -Arguments @("run", "build") | Out-Null

  if ($app.Kind -eq "api") {
    Invoke-Npm -Stage "test" -Name "unit-tests-$($app.Key)" -WorkingDirectory $appRoot -Arguments @("test", "--", "--runInBand") | Out-Null
  }
}

if ($RunMySqlIntegration -and -not $RunDockerQa) {
  $integrationSpecs = @(
    [pscustomobject]@{ Key = "asistencia"; Path = "apps\asistencia\api"; Variable = "ASISTENCIA_INTEGRATION_DATABASE_URL" },
    [pscustomobject]@{ Key = "inventario"; Path = "apps\inventario\api"; Variable = "INVENTARIO_INTEGRATION_DATABASE_URL" }
  )
  $executedIntegration = $false
  foreach ($integration in $integrationSpecs) {
    if ([string]::IsNullOrWhiteSpace((Get-Item "Env:$($integration.Variable)" -ErrorAction SilentlyContinue).Value)) {
      Add-Result -Stage "test" -Name "mysql-integration-$($integration.Key)" -Status "WARN" -Notes "omitida: definir $($integration.Variable) para usar una base aislada"
      Write-Log "WARN [test] mysql-integration-$($integration.Key) variable de entorno ausente"
      continue
    }
    $executedIntegration = $true
    $integrationRoot = Join-Path $repoRoot $integration.Path
    Invoke-Npm -Stage "test" -Name "mysql-integration-$($integration.Key)" -WorkingDirectory $integrationRoot -Arguments @("run", "test:integration:mysql") | Out-Null
  }
  if (-not $executedIntegration) {
    Add-Result -Stage "test" -Name "mysql-integration" -Status "WARN" -Notes "no se ejecuto ninguna integracion; faltan URLs aisladas"
  }
} elseif ($RunDockerQa) {
  Add-Result -Stage "test" -Name "mysql-integration" -Status "SKIP" -Notes "delegada al runner Docker QA, que deriva URLs contra bases *_ci"
  Write-Log "SKIP [test] mysql-integration delegada a Docker QA"
} else {
  Add-Result -Stage "test" -Name "mysql-integration" -Status "SKIP" -Notes "usar -RunMySqlIntegration y URLs de bases aisladas; no se toca la DB persistente por defecto"
  Write-Log "SKIP [test] mysql-integration"
}

if ($RunDockerQa) {
  $dockerQaScript = Join-Path $repoRoot "tools\dev\validate-docker-asistencia-inventario.ps1"
  $dockerQaEnvPath = if ([System.IO.Path]::IsPathRooted($DockerQaEnvFile)) {
    $DockerQaEnvFile
  } else {
    Join-Path $repoRoot $DockerQaEnvFile
  }
  if (-not (Test-Path -LiteralPath $dockerQaScript)) {
    Add-Result -Stage "runtime" -Name "docker-qa-runner" -Status "FAIL" -Notes "script no encontrado: $dockerQaScript"
  } elseif (-not (Test-Path -LiteralPath $dockerQaEnvPath)) {
    Add-Result -Stage "runtime" -Name "docker-qa-runner" -Status "FAIL" -Notes "archivo QA no encontrado: $dockerQaEnvPath"
  } else {
    $dockerQaReportRoot = Join-Path $runDir "docker-qa"
    $dockerQaArguments = @(
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $dockerQaScript,
      "-EnvFile", $dockerQaEnvPath,
      "-ReportRoot", $dockerQaReportRoot
    )
    if ($ResetDockerQaData) { $dockerQaArguments += "-ResetData" }
    if ($SkipDockerQaContractTests) { $dockerQaArguments += "-SkipContractTests" }
    if ($SkipDockerQaMySqlIntegration) { $dockerQaArguments += "-SkipMySqlIntegration" }
    Invoke-External -Stage "runtime" -Name "docker-qa-asistencia-inventario" -FilePath "powershell.exe" -ArgumentList $dockerQaArguments -WorkingDirectory $repoRoot -OutputFile (Join-Path $runDir "docker-qa-runner.log") | Out-Null
  }
} else {
  Add-Result -Stage "runtime" -Name "docker-qa-asistencia-inventario" -Status "SKIP" -Notes "usar -RunDockerQa con un env QA local; WordPress queda fuera de alcance"
  Write-Log "SKIP [runtime] docker-qa-asistencia-inventario"
}
} else {
  Add-Result -Stage "validate" -Name "code-validation" -Status "SKIP" -Notes "se uso -SecurityOnly"
  Add-Result -Stage "test" -Name "code-tests" -Status "SKIP" -Notes "se uso -SecurityOnly"
}

$auditPaths = @{}
foreach ($app in $appSpecs) {
  $appRoot = Join-Path $repoRoot $app.Path
  $auditPath = Join-Path $runDir "npm-audit-$($app.Key).json"
  $auditPaths[$app.Key] = $auditPath
  Invoke-Npm -Stage "security" -Name "npm-audit-$($app.Key)" -WorkingDirectory $appRoot -Arguments @("audit", "--json", "--omit=dev", "--no-fund") -OutputFile $auditPath -AllowFailure | Out-Null
  $audit = Get-AuditSummary -Path $auditPath
  if ($null -eq $audit) {
    Add-Result -Stage "security" -Name "npm-audit-summary-$($app.Key)" -Status "WARN" -Notes "no se pudo interpretar el JSON; revisar el artefacto" -Artifact (Split-Path -Leaf $auditPath)
  } elseif ($audit.Total -gt 0) {
    $auditStatus = if ($StrictSecurity -and ($audit.High -gt 0 -or $audit.Critical -gt 0)) { "FAIL" } else { "WARN" }
    Add-Result -Stage "security" -Name "npm-audit-summary-$($app.Key)" -Status $auditStatus -Notes "total=$($audit.Total), critical=$($audit.Critical), high=$($audit.High), moderate=$($audit.Moderate), low=$($audit.Low)" -Artifact (Split-Path -Leaf $auditPath)
  } else {
    Add-Result -Stage "security" -Name "npm-audit-summary-$($app.Key)" -Status "OK" -Notes "sin vulnerabilidades de produccion reportadas" -Artifact (Split-Path -Leaf $auditPath)
  }
}

$trivyPath = Join-Path $SecurityToolsRoot "trivy\trivy.exe"
if (Test-Path -LiteralPath $trivyPath) {
  $trivyCache = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "trivy"
  if (-not (Test-Path -LiteralPath (Join-Path $trivyCache "db\trivy.db"))) {
    $trivyCache = Join-Path $runDir "trivy-cache"
    New-Item -ItemType Directory -Force -Path $trivyCache | Out-Null
  }
  $trivyHelp = (& $trivyPath fs --help 2>&1 | Out-String)
  $trivyStaticArguments = @("fs", "--cache-dir", $trivyCache, "--scanners", "vuln,secret,misconfig", "--skip-dirs", "node_modules", "--skip-dirs", "dist", "--skip-dirs", "dist-electron", "--format", "json", "--exit-code", "0")
  $hasTrivyDb = Test-Path -LiteralPath (Join-Path $trivyCache "db\trivy.db")
  if ($hasTrivyDb -and $trivyHelp -match "--skip-db-update") { $trivyStaticArguments += "--skip-db-update" }
  if ($hasTrivyDb -and $trivyHelp -match "--skip-java-db-update") { $trivyStaticArguments += "--skip-java-db-update" }
  if ($hasTrivyDb -and $trivyHelp -match "--skip-check-update") { $trivyStaticArguments += "--skip-check-update" }
  if ($hasTrivyDb -and $trivyHelp -match "--offline-scan") { $trivyStaticArguments += "--offline-scan" }
  foreach ($app in $appSpecs) {
    $reportPath = Join-Path $runDir "trivy-$($app.Key).json"
    $relativePath = $app.Path.Replace("\", "/")
    Invoke-External -Stage "security" -Name "trivy-$($app.Key)" -FilePath $trivyPath -ArgumentList ($trivyStaticArguments + @("--output", $reportPath, $relativePath)) -WorkingDirectory $repoRoot -OutputFile (Join-Path $runDir "trivy-$($app.Key).log") -AllowFailure | Out-Null
    $trivy = Get-TrivySummary -Path $reportPath
    if ($null -eq $trivy) {
      Add-Result -Stage "security" -Name "trivy-summary-$($app.Key)" -Status "WARN" -Notes "no se pudo interpretar el reporte; revisar el log" -Artifact (Split-Path -Leaf $reportPath)
    } else {
      $findingCount = $trivy.Vulnerabilities + $trivy.Misconfigurations + $trivy.Secrets
      $trivyStatus = if ($StrictSecurity -and ($trivy.HighOrCritical -gt 0 -or $trivy.Secrets -gt 0)) { "FAIL" } elseif ($findingCount -gt 0) { "WARN" } else { "OK" }
      Add-Result -Stage "security" -Name "trivy-summary-$($app.Key)" -Status $trivyStatus -Notes "vulnerabilidades=$($trivy.Vulnerabilities), misconfiguraciones=$($trivy.Misconfigurations), secretos=$($trivy.Secrets)" -Artifact (Split-Path -Leaf $reportPath)
    }
  }
} else {
  Add-Result -Stage "security" -Name "trivy-availability" -Status "WARN" -Notes "no encontrado: $trivyPath"
}

$semgrepPath = Join-Path $SecurityToolsRoot "semgrep-venv\Scripts\semgrep.exe"
if (-not (Test-Path -LiteralPath $semgrepPath)) {
  $semgrepPath = Join-Path $SecurityToolsRoot "semgrep-venv\Scripts\pysemgrep.exe"
}
$semgrepReport = Join-Path $runDir "semgrep.json"
$semgrepState = Join-Path $runDir "semgrep-state"
New-Item -ItemType Directory -Force -Path $semgrepState | Out-Null
if (Test-Path -LiteralPath $semgrepPath) {
  $env:SEMGREP_LOG_FILE = Join-Path $semgrepState "semgrep.log"
  $env:SEMGREP_SETTINGS_FILE = Join-Path $semgrepState "settings.yaml"
  $env:XDG_CACHE_HOME = $semgrepState
  $env:SEMGREP_SEND_METRICS = "off"
  $env:SEMGREP_ENABLE_VERSION_CHECK = "0"
  $semgrepArgs = @(
    "scan", "--config", "tools/security/semgrep-rules.yml", "--json", "--json-output", $semgrepReport,
    "--quiet", "--no-git-ignore", "--disable-version-check", "--metrics", "off",
    "--exclude", "apps/asistencia/api/src/generated",
    "--exclude", "apps/inventario/api/src/generated"
  ) + @($appSpecs | ForEach-Object { $_.Path.Replace("\", "/") })
  Invoke-External -Stage "security" -Name "semgrep-scope" -FilePath $semgrepPath -ArgumentList $semgrepArgs -WorkingDirectory $repoRoot -OutputFile (Join-Path $runDir "semgrep-command.log") -AllowFailure | Out-Null
  $semgrep = Get-SemgrepSummary -Path $semgrepReport
  if ($null -eq $semgrep) {
    $note = "Semgrep no produjo JSON utilizable; revisar semgrep-state/semgrep.log"
    $status = if ($StrictSecurity) { "FAIL" } else { "WARN" }
    Add-Result -Stage "security" -Name "semgrep-summary" -Status $status -Notes $note -Artifact (Split-Path -Leaf $semgrepReport)
  } else {
    $status = if ($StrictSecurity -and ($semgrep.Findings -gt 0 -or $semgrep.Errors -gt 0)) { "FAIL" } elseif ($semgrep.Findings -gt 0 -or $semgrep.Errors -gt 0) { "WARN" } else { "OK" }
    Add-Result -Stage "security" -Name "semgrep-summary" -Status $status -Notes "hallazgos=$($semgrep.Findings), errores=$($semgrep.Errors)" -Artifact (Split-Path -Leaf $semgrepReport)
  }
} else {
  Add-Result -Stage "security" -Name "semgrep-availability" -Status "WARN" -Notes "no encontrado: $semgrepPath"
}

Invoke-SecurityToolVersion -Name "trivy-version" -FilePath $trivyPath -Arguments @("--version") -WorkingDirectory (Split-Path -Parent $trivyPath)
Invoke-SecurityToolVersion -Name "semgrep-version" -FilePath $semgrepPath -Arguments @("--version") -WorkingDirectory (Split-Path -Parent $semgrepPath)

if (-not [string]::IsNullOrWhiteSpace($ZapTargetUrl)) {
  $zapTargetValid = $true
  try {
    $zapUri = [System.Uri]$ZapTargetUrl
    if ($zapUri.Scheme -notin @("http", "https") -or -not [string]::IsNullOrWhiteSpace($zapUri.UserInfo)) {
      throw "la URL debe ser HTTP(S) sin credenciales embebidas"
    }
    if ($ZapTargetUrl -match "(?i)wordpress|portal-web-infounsa") {
      throw "el objetivo WordPress esta fuera del alcance de este pipeline"
    }
  } catch {
    $zapTargetValid = $false
    Add-Result -Stage "security" -Name "zap-target-validation" -Status "FAIL" -Notes $_.Exception.Message
  }

  $zapPath = Join-Path $SecurityToolsRoot "zap\ZAP_2.17.0\zap.bat"
  if ($zapTargetValid -and (Test-Path -LiteralPath $zapPath)) {
    $zapReport = Join-Path $runDir "zap-report.html"
    Invoke-External -Stage "security" -Name "zap-quick-scan" -FilePath $zapPath -ArgumentList @("-cmd", "-quickurl", $ZapTargetUrl, "-quickout", $zapReport, "-quickprogress") -WorkingDirectory (Split-Path -Parent $zapPath) -AllowFailure | Out-Null
    $zap = Get-ZapSummary -Path $zapReport
    if ($null -eq $zap) {
      Add-Result -Stage "security" -Name "zap-summary" -Status "WARN" -Notes "no se pudo interpretar el HTML; revisar el reporte" -Artifact (Split-Path -Leaf $zapReport)
    } else {
      $zapStatus = if ($StrictSecurity -and ($zap.High -gt 0 -or $zap.Medium -gt 0)) { "FAIL" } elseif ($zap.Total -gt 0) { "WARN" } else { "OK" }
      Add-Result -Stage "security" -Name "zap-summary" -Status $zapStatus -Notes "high=$($zap.High), medium=$($zap.Medium), low=$($zap.Low), informational=$($zap.Informational)" -Artifact (Split-Path -Leaf $zapReport)
    }
  } elseif ($zapTargetValid) {
    Add-Result -Stage "security" -Name "zap-availability" -Status "WARN" -Notes "no encontrado: $zapPath"
  }
} else {
  Add-Result -Stage "security" -Name "zap-quick-scan" -Status "SKIP" -Notes "definir -ZapTargetUrl para un servicio API local controlado; nunca WordPress"
  Write-Log "SKIP [security] zap-quick-scan"
}

if (-not $SkipDockerBuild -and -not $RunDockerQa) {
  $dockerPath = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
  if ([string]::IsNullOrWhiteSpace($dockerPath)) {
    Add-Result -Stage "build" -Name "docker-availability" -Status "FAIL" -Notes "docker.exe no esta disponible en PATH"
  } else {
    $dockerConfig = Join-Path $runDir "docker-config"
    New-Item -ItemType Directory -Force -Path $dockerConfig | Out-Null
    $env:DOCKER_CONFIG = $dockerConfig
    foreach ($api in @("asistencia", "inventario")) {
      $context = Join-Path $repoRoot ("apps\" + $api)
      $dockerfile = Join-Path $repoRoot ("infra\docker\" + $api + "-api\Dockerfile")
      $tag = "infounsa-local/$api-api:$timestamp"
      Invoke-External -Stage "build" -Name "docker-build-$api-api" -FilePath $dockerPath -ArgumentList @("build", "--file", $dockerfile, "--tag", $tag, $context) -WorkingDirectory $repoRoot | Out-Null
    }
  }
} elseif ($RunDockerQa) {
  Add-Result -Stage "build" -Name "docker-build" -Status "SKIP" -Notes "delegado al build reproducible del Compose QA"
  Write-Log "SKIP [build] docker-build delegado a Docker QA"
} else {
  Add-Result -Stage "build" -Name "docker-build" -Status "SKIP" -Notes "se uso -SkipDockerBuild"
  Write-Log "SKIP [build] docker-build"
}

if ($BuildInstallers) {
  $installerScript = Join-Path $repoRoot "scripts\build-desktop-installers.ps1"
  if (Test-Path -LiteralPath $installerScript) {
    Invoke-External -Stage "build" -Name "desktop-installers" -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $installerScript) -WorkingDirectory $repoRoot | Out-Null
  } else {
    Add-Result -Stage "build" -Name "desktop-installers" -Status "FAIL" -Notes "script no encontrado: $installerScript"
  }
} else {
  Add-Result -Stage "build" -Name "desktop-installers" -Status "SKIP" -Notes "usar -BuildInstallers despues de resolver las excepciones de empaquetado"
  Write-Log "SKIP [build] desktop-installers"
}

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add("# Resultado del pipeline local CI/CD - $timestamp")
$summary.Add("")
$summary.Add("Alcance: Asistencia e Inventario: APIs, clientes desktop, Docker y bases MySQL aisladas. WordPress no se valida ni se inicia.")
$summary.Add("")
$summary.Add("## Orden ejecutado")
$summary.Add("")
$summary.Add("1. Validacion de dependencias y Prisma")
$summary.Add("2. Build y pruebas unitarias")
$summary.Add("3. Prueba MySQL aislada para Asistencia e Inventario")
$summary.Add("4. Contratos Newman contra APIs Docker reales cuando se usa -RunDockerQa")
$summary.Add("5. npm audit, Trivy, Semgrep y ZAP opcional")
$summary.Add("6. Build de imagenes API y empaquetado EXE opcional")
$summary.Add("")
$summary.Add("## Resultados")
$summary.Add("")
$summary.Add("| Etapa | Job | Estado | Notas | Artefacto |")
$summary.Add("| --- | --- | --- | --- | --- |")
foreach ($result in $results) {
  $artifactLink = if ([string]::IsNullOrWhiteSpace($result.Artifact)) { "" } else { "[$($result.Artifact)](./$($result.Artifact))" }
  $summary.Add("| $($result.Stage) | $($result.Name) | $($result.Status) | $($result.Notes) | $artifactLink |")
}
$summary.Add("")
$summary.Add("Log: [pipeline.log](./pipeline.log)")
$summary.Add("")
$summary.Add("Modo estricto: $StrictSecurity. En modo normal, los hallazgos de seguridad quedan como WARN para permitir su revision contra las excepciones documentadas; no se ejecuta npm audit fix --force.")
$summary | Set-Content -Path $summaryFile -Encoding UTF8

Write-Log "Summary: $summaryFile"
Write-Log "Local CI finished"

$failed = @($results | Where-Object { $_.Status -eq "FAIL" })
if ($failed.Count -gt 0) {
  exit 1
}
exit 0
