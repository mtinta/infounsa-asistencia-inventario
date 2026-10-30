# Respalda las bases de datos de Asistencia e Inventario con mysqldump y elimina respaldos antiguos.
# Uso (PowerShell):
#   $env:MYSQL_PWD = "<contrasena del usuario infounsa>"
#   powershell -ExecutionPolicy Bypass -File scripts\respaldar-bases.ps1 -Destino D:\Respaldos\InfoUNSA
# Parametros: -Usuario (infounsa), -Retencion (dias a conservar, 14), -MysqlDump (ruta de mysqldump.exe si no esta en el PATH)
param(
    [string]$Destino = "C:\Respaldos\InfoUNSA",
    [string]$Usuario = "infounsa",
    [int]$Retencion = 14,
    [string]$MysqlDump = "mysqldump",
    [string[]]$Bases = @("infounsa_asistencia", "infounsa_inventario")
)
$ErrorActionPreference = "Stop"

if (-not $env:MYSQL_PWD) { throw "Define la contrasena en la variable de entorno MYSQL_PWD antes de ejecutar." }
if (-not (Get-Command $MysqlDump -ErrorAction SilentlyContinue)) {
    throw "No se encontro mysqldump. Usa -MysqlDump 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe'."
}
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$fecha = Get-Date -Format "yyyyMMdd-HHmm"

foreach ($base in $Bases) {
    $sql = Join-Path $Destino "$base-$fecha.sql"
    & $MysqlDump --user=$Usuario --single-transaction --routines --triggers --result-file=$sql $base
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $sql) -or (Get-Item $sql).Length -eq 0) {
        throw "Fallo el respaldo de $base."
    }
    Compress-Archive -Path $sql -DestinationPath "$sql.zip" -Force
    Remove-Item $sql
    Write-Host "Respaldo creado: $sql.zip"
}

# Conservar solo los ultimos $Retencion dias
Get-ChildItem $Destino -Filter "*.sql.zip" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Retencion) } |
    Remove-Item -Force
