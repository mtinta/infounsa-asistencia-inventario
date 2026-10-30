# Genera los instaladores .exe de Asistencia e Inventario en la carpeta .\instaladores
# Ejecutar en Windows (PowerShell):  powershell -ExecutionPolicy Bypass -File scripts\generar-instaladores-windows.ps1
# Opciones: -SkipInstall (omite pnpm install), -OutputDir <carpeta>
& (Join-Path $PSScriptRoot "build-desktop-installers.ps1") @args
