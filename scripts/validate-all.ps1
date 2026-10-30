# scripts/validate-all.ps1
# Runner local no-WordPress para validacion integrada del Sprint 04

param(
    [switch]$IncludePortalGeneral,
    [switch]$KeepServices
)

$ErrorActionPreference = "Stop"
$services = @(
    "asistencia-db",
    "asistencia-api",
    "inventario-db",
    "inventario-api"
)

if ($IncludePortalGeneral) {
    $services += "portal-general"
}

$reportsDir = "qa/reports"
$localPipelineDir = Join-Path $reportsDir "local-pipeline"
$summaryPath = Join-Path $localPipelineDir "summary.txt"
$exitCode = 0
$servicesReady = $false

function Write-Step($message) {
    Write-Host ""
    Write-Host $message -ForegroundColor Cyan
}

function Test-PortFree($port) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return -not $listener
}

function Get-FreePort($preferredPorts) {
    foreach ($port in $preferredPorts) {
        if (Test-PortFree $port) {
            return $port
        }
    }
    throw "No se encontro un puerto libre entre: $($preferredPorts -join ', ')."
}

function Add-SummaryLine($line) {
    Add-Content -Path $summaryPath -Value $line
}

function Invoke-NpmBuild($path, $label) {
    Push-Location $path
    try {
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) {
            throw "Fallo build $label."
        }
    } finally {
        Pop-Location
    }
}

function Clear-DesktopSessionState {
    $appDataRoot = [Environment]::GetFolderPath('ApplicationData')
    $desktopProfiles = @(
        'InfoUNSA-Asistencia',
        'InfoUNSA-Inventario',
        'infounsa-asistencia-desktop',
        'infounsa-inventario-desktop'
    )
    $sessionEntries = @(
        'sync-auth-asistencia.json',
        'sync-auth-inventario.json',
        'Local Storage',
        'Session Storage',
        'Network\Cookies'
    )

    foreach ($profile in $desktopProfiles) {
        $profilePath = Join-Path $appDataRoot $profile
        if (-not (Test-Path -LiteralPath $profilePath)) {
            continue
        }

        foreach ($entry in $sessionEntries) {
            $target = Join-Path $profilePath $entry
            if (-not (Test-Path -LiteralPath $target)) {
                continue
            }
            try {
                Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
                Write-Host "Estado de sesion eliminado: $target" -ForegroundColor DarkYellow
            } catch {
                Write-Warning "No se pudo limpiar $target. Cierre la aplicacion de escritorio e intente de nuevo."
            }
        }
    }
}

New-Item -ItemType Directory -Force -Path $reportsDir | Out-Null
New-Item -ItemType Directory -Force -Path $localPipelineDir | Out-Null
Set-Content -Path $summaryPath -Value "Resumen runner local no-WordPress - $(Get-Date -Format s)"

Write-Step "[0/4] Limpiando sesion y configuracion web local de los clientes desktop"
Clear-DesktopSessionState
Add-SummaryLine "Estado de sesion (tokens y almacenamiento web) de Electron limpiado antes de iniciar la validacion."

$asistenciaPort = 43000
$inventarioPort = 43001
$env:ASISTENCIA_API_PORT = [string]$asistenciaPort
$env:INVENTARIO_API_PORT = [string]$inventarioPort
$env:ASISTENCIA_ADMINER_PORT = "8080"
$env:INVENTARIO_ADMINER_PORT = "8081"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "INICIANDO VALIDACION LOCAL NO-WORDPRESS (SPRINT 04)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Puertos API: asistencia=$asistenciaPort inventario=$inventarioPort" -ForegroundColor Yellow

try {
    Write-Step "[1/4] Levantando contenedores requeridos"
    Add-SummaryLine "Servicios objetivo: $($services -join ', ')"
    Add-SummaryLine "Puertos API: asistencia=$asistenciaPort inventario=$inventarioPort"
    docker compose build @services
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo la construccion Docker de los servicios no-WordPress."
    }
    docker compose up -d --force-recreate @services
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo el arranque Docker de los servicios no-WordPress."
    }

    Write-Host "Esperando que las APIs respondan en sus puertos..." -ForegroundColor Yellow
    $maxRetries = 36
    $retryCount = 0

    while (-not $servicesReady -and $retryCount -lt $maxRetries) {
        try {
            $resAsistencia = Invoke-WebRequest -Uri "http://localhost:$asistenciaPort/health" -UseBasicParsing -TimeoutSec 2
            $resInventario = Invoke-WebRequest -Uri "http://localhost:$inventarioPort/health" -UseBasicParsing -TimeoutSec 2
            if ($resAsistencia.StatusCode -eq 200 -and $resInventario.StatusCode -eq 200) {
                $servicesReady = $true
            }
        } catch {
            # Ignorar errores de calentamiento
        }

        if (-not $servicesReady) {
            $retryCount++
            Write-Host "Servicios no listos. Reintentando en 5 segundos... ($retryCount/$maxRetries)" -ForegroundColor Yellow
            Start-Sleep -Seconds 5
        }
    }

    if (-not $servicesReady) {
        throw "Las APIs locales no estuvieron listas dentro del tiempo limite."
    }

    Add-SummaryLine "Health checks: OK"
    Write-Host "Servicios listos y respondiendo con exito." -ForegroundColor Green

    Write-Step "[2/4] Ejecutando builds base"
    docker compose exec -T asistencia-api npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo build API Asistencia dentro del contenedor."
    }
    docker compose exec -T inventario-api npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo build API Inventario dentro del contenedor."
    }
    Add-SummaryLine "Builds API: OK"

    Write-Step "[3/4] Ejecutando colecciones Newman"
    npx -y newman run qa/postman/asistencia_api_collection.json --env-var baseUrl=http://localhost:$asistenciaPort -r cli,json,junit --reporter-json-export qa/reports/asistencia_report.json --reporter-junit-export qa/reports/asistencia_junit.xml
    if ($LASTEXITCODE -ne 0) {
        $exitCode = 1
        Add-SummaryLine "Asistencia API: FAIL"
    } else {
        Add-SummaryLine "Asistencia API: OK"
    }

    npx -y newman run qa/postman/inventario_api_collection.json --env-var baseUrl=http://localhost:$inventarioPort -r cli,json,junit --reporter-json-export qa/reports/inventario_report.json --reporter-junit-export qa/reports/inventario_junit.xml
    if ($LASTEXITCODE -ne 0) {
        $exitCode = 1
        Add-SummaryLine "Inventario API: FAIL"
    } else {
        Add-SummaryLine "Inventario API: OK"
    }

    Write-Step "[4/4] Ejecutando runner CPI de Inventario"
    & .\scripts\run-inventario-cpi.ps1 -BaseUrl "http://localhost:$inventarioPort"
    if ($LASTEXITCODE -ne 0) {
        $exitCode = 1
        Add-SummaryLine "Inventario CPI: FAIL"
    } else {
        Add-SummaryLine "Inventario CPI: OK"
    }
}
catch {
    $exitCode = 1
    Add-SummaryLine "Runner: FAIL - $($_.Exception.Message)"
    Write-Host $_.Exception.Message -ForegroundColor Red
}
finally {
    if (-not $KeepServices) {
        Write-Step "Apagando contenedores de la corrida local"
        docker compose stop @services | Out-Null
        docker compose rm -f @services | Out-Null
    } else {
        Write-Step "Contenedores conservados para pruebas locales"
        Add-SummaryLine "Contenedores mantenidos activos por -KeepServices."
    }

    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    if ($exitCode -eq 0) {
        Write-Host "VALIDACION FINALIZADA CON EXITO" -ForegroundColor Green
        Add-SummaryLine "Resultado final: OK"
    } else {
        Write-Host "VALIDACION FINALIZADA CON ERRORES" -ForegroundColor Red
        Add-SummaryLine "Resultado final: FAIL"
    }
    Write-Host "Resumen: $summaryPath" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green
}

exit $exitCode
