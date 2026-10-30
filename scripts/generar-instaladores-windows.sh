#!/usr/bin/env bash
# Genera los instaladores .exe (NSIS) de Asistencia e Inventario en ./instaladores
# Requiere WINE para empaquetar desde Linux. Alternativa recomendada: scripts/generar-instaladores-windows.ps1 en Windows.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/instaladores"
mkdir -p "$OUT"

if ! command -v wine >/dev/null 2>&1; then
  echo "ERROR: falta 'wine' (necesario para crear instaladores NSIS de Windows desde Linux)." >&2
  echo "Instálalo (p. ej. 'sudo pacman -S wine') o ejecuta scripts/generar-instaladores-windows.ps1 en Windows." >&2
  exit 1
fi

for app in asistencia inventario; do
  dir="$ROOT/apps/$app/desktop"
  echo "==> Construyendo instalador de $app"
  (
    cd "$dir"
    npm install --ignore-scripts --no-audit --no-fund
    # Dependencia nativa (sqlcipher) para Windows x64
    npx --no-install electron-builder install-app-deps --platform=win32 --arch=x64
    npm run build
    npx --no-install electron-builder --win nsis --x64
  )
  cp -v "$dir"/dist-electron/*.exe "$OUT/"
done

echo
echo "Instaladores en: $OUT"
ls -lh "$OUT"
