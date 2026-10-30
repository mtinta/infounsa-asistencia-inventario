# scripts/publish-to-gitlab.ps1
# Script para subir paquetes compilados localmente al GitLab Package Registry y crear el Release oficial

param(
    [Parameter(Mandatory=$true)]
    [string]$PrivateToken,
    [string]$TagName = "v1.1.1",
    [string]$ProjectNameEncoded = "Yodetcozco%2Fplataforma-infounsa"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$releaseDir = Join-Path $repoRoot "artifacts/desktop-release"

$version = $TagName
if ($TagName.StartsWith("v")) {
    $version = $TagName.Substring(1)
}

$asistenciaFile = Join-Path $releaseDir "InfoUNSA-Asistencia-Setup-$version-x64.exe"
$inventarioFile = Join-Path $releaseDir "InfoUNSA-Inventario-Setup-$version-x64.exe"

if (-not (Test-Path $asistenciaFile)) {
    throw "No se encontro el instalador de Asistencia: $asistenciaFile"
}
if (-not (Test-Path $inventarioFile)) {
    throw "No se encontro el instalador de Inventario: $inventarioFile"
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "INICIANDO PUBLICACION DE INSTALADORES EN GITLAB" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Tag objetivo: $TagName" -ForegroundColor Yellow

$headers = @{ "PRIVATE-TOKEN" = $PrivateToken }

# 1. Subir instalador de Asistencia
$asistenciaUrl = "https://gitlab.com/api/v4/projects/$ProjectNameEncoded/packages/generic/asistencia-desktop/$TagName/InfoUNSA-Asistencia-Setup-$version-x64.exe"
Write-Host "Subiendo Asistencia..." -ForegroundColor Cyan
$responseAsistencia = Invoke-RestMethod -Uri $asistenciaUrl -Method Put -Headers $headers -InFile $asistenciaFile -ContentType "application/octet-stream"
Write-Host "Instalador de Asistencia subido con exito." -ForegroundColor Green

# 2. Subir instalador de Inventario
$inventarioUrl = "https://gitlab.com/api/v4/projects/$ProjectNameEncoded/packages/generic/inventario-desktop/$TagName/InfoUNSA-Inventario-Setup-$version-x64.exe"
Write-Host "Subiendo Inventario..." -ForegroundColor Cyan
$responseInventario = Invoke-RestMethod -Uri $inventarioUrl -Method Put -Headers $headers -InFile $inventarioFile -ContentType "application/octet-stream"
Write-Host "Instalador de Inventario subido con exito." -ForegroundColor Green

# 3. Crear Release oficial vinculando los paquetes
Write-Host "Creando el Release oficial en GitLab..." -ForegroundColor Cyan
$releaseUrl = "https://gitlab.com/api/v4/projects/$ProjectNameEncoded/releases"
$releaseBody = @{
    name = "Release Oficial $TagName"
    tag_name = $TagName
    description = "Release oficial de los clientes de escritorio InfoUNSA (Asistencia e Inventario) compilados localmente."
    assets = @{
        links = @(
            @{
                name = "Descargar Control de Asistencia (.exe)"
                url = $asistenciaUrl
            },
            @{
                name = "Descargar Gestion de Inventario (.exe)"
                url = $inventarioUrl
            }
        )
    }
} | ConvertTo-Json -Depth 5

try {
    $responseRelease = Invoke-RestMethod -Uri $releaseUrl -Method Post -Headers $headers -Body $releaseBody -ContentType "application/json"
    Write-Host "Release creado con exito en GitLab!" -ForegroundColor Green
    Write-Host "Puedes ver tu release en: https://gitlab.com/Yodetcozco/plataforma-infounsa/-/releases" -ForegroundColor Yellow
} catch {
    Write-Host "Nota: El release para el tag $TagName ya existe o la creacion fallo: $_" -ForegroundColor Yellow
}
