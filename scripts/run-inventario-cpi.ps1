# scripts/run-inventario-cpi.ps1
# Runner local para CPI de Inventario

param(
    [string]$BaseUrl = "http://localhost:43001"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "RUNNER LOCAL - CPI INVENTARIO" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

New-Item -ItemType Directory -Force -Path "qa/reports" | Out-Null

$runs = @(
    @{
        Name = "Inventario Auth CPI"
        Collection = "qa/postman/cpi-inventario-auth-api/coleccion_pruebas/cpi-inventario-auth-api.postman_collection.json"
        Environment = "qa/postman/cpi-inventario-auth-api/coleccion_pruebas/cpi-inventario-auth-local.postman_environment.json"
        JsonReport = "qa/reports/inventario_auth_cpi_report.json"
        JunitReport = "qa/reports/inventario_auth_cpi_junit.xml"
    },
    @{
        Name = "Inventario Catalogo CPI"
        Collection = "qa/postman/cpi-inventario-catalogo-api/coleccion-pruebas/cpi-inventario-catalogo-api.postman_collection.json"
        Environment = "qa/postman/cpi-inventario-catalogo-api/coleccion-pruebas/cpi-inventario-catalogo-local.postman_environment.json"
        JsonReport = "qa/reports/inventario_catalogo_cpi_report.json"
        JunitReport = "qa/reports/inventario_catalogo_cpi_junit.xml"
    }
)

$exitCode = 0

foreach ($run in $runs) {
    Write-Host ""
    Write-Host ("--- " + $run.Name + " ---") -ForegroundColor Cyan

    npx newman run $run.Collection `
        --environment $run.Environment `
        --env-var "baseUrl=$BaseUrl" `
        -r cli,json,junit `
        --reporter-json-export $run.JsonReport `
        --reporter-junit-export $run.JunitReport

    if ($LASTEXITCODE -ne 0) {
        Write-Host ("Fallo: " + $run.Name) -ForegroundColor Red
        $exitCode = 1
    } else {
        Write-Host ("OK: " + $run.Name) -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
if ($exitCode -eq 0) {
    Write-Host "RUNNER CPI INVENTARIO FINALIZADO CON EXITO" -ForegroundColor Green
} else {
    Write-Host "RUNNER CPI INVENTARIO FINALIZADO CON ERRORES" -ForegroundColor Red
}
Write-Host "==========================================================" -ForegroundColor Green

exit $exitCode
