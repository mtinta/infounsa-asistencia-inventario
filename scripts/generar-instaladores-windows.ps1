# Genera los instaladores .exe de Asistencia e Inventario en la carpeta .\instaladores
# Ejecutar en Windows:  powershell -ExecutionPolicy Bypass -File scripts\generar-instaladores-windows.ps1
& (Join-Path $PSScriptRoot "build-desktop-installers.ps1") -OutputDir "instaladores"
