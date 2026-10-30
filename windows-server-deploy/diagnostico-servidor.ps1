# Script de Diagnóstico del Servidor Windows (Fase de Validación Sprint 06)
# Ejecutar este script en PowerShell como Administrador en el servidor de producción.

Write-Output "=========================================================="
Write-Output "  INICIO DE DIAGNÓSTICO: ENTORNO WINDOWS SERVER INFOUNSA  "
Write-Output "=========================================================="
Write-Output ""

# 1. Información del Sistema Operativo
Write-Output "--- 1. INFORMACIÓN DEL SISTEMA OPERATIVO ---"
try {
    Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber, OsArchitecture | Format-List
} catch {
    Write-Warning "No se pudo obtener información detallada del SO con Get-ComputerInfo. Intentando con WMI..."
    Get-WmiObject -Class Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture | Format-List
}

# 2. Versiones de Runtimes y Herramientas instaladas
Write-Output "--- 2. VERSIONES DE RUNTIMES E INFRAESTRUCTURA ---"
$nodeVer = try { node --version } catch { "No instalado o no en PATH" }
$mysqlVer = try { mysql --version } catch { "No instalado o no en PATH" }
$gitVer = try { git --version } catch { "No instalado o no en PATH" }

Write-Output "Node.js: $nodeVer"
Write-Output "MySQL:   $mysqlVer"
Write-Output "Git:     $gitVer"
Write-Output ""

# 3. Estado de los Servicios de Base de Datos y APIs de InfoUNSA
Write-Output "--- 3. ESTADO DE LOS SERVICIOS DE WINDOWS ---"
$services = Get-CimInstance Win32_Service | Where-Object {
    $_.Name -match 'MySQL|Maria|Asistencia|Inventario'
}

if ($services) {
    $services | Select-Object Name, DisplayName, State, StartMode, StartName, PathName | Format-Table -AutoSize
} else {
    Write-Output "No se encontraron servicios registrados que coincidan con 'MySQL', 'Maria', 'Asistencia' o 'Inventario'."
}

Write-Output "=========================================================="
Write-Output "  DIAGNÓSTICO COMPLETADO. POR FAVOR ENVÍA ESTE OUTPUT     "
Write-Output "  AL EQUIPO DE QA PARA COMPLEMENTAR LA REVISIÓN S06.      "
Write-Output "=========================================================="
