#!/usr/bin/env bash
# Genera los instaladores .exe (NSIS) de Asistencia e Inventario en ./instaladores desde Linux.
# Requiere WINE. Recomendado: generarlos en Windows con scripts/generar-instaladores-windows.ps1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/instaladores"
mkdir -p "$OUT"
cd "$ROOT"

if ! command -v wine >/dev/null 2>&1; then
  echo "ERROR: falta 'wine' (necesario para crear instaladores NSIS de Windows desde Linux)." >&2
  echo "Instalalo (p. ej. 'sudo pacman -S wine') o ejecuta scripts/generar-instaladores-windows.ps1 en Windows." >&2
  exit 1
fi

pnpm install --frozen-lockfile
pnpm run build:packages

for app in asistencia inventario; do
  dir="$ROOT/apps/$app/desktop"
  echo "==> Construyendo instalador de $app"
  rm -rf "$dir/dist-electron"
  (cd "$dir" && npm run build && pnpm exec electron-builder --win nsis --x64)
  version="$(node -p "require('$dir/package.json').version")"
  exe="$(ls -t "$dir"/dist-electron/*.exe | head -1)"
  nombre="$(echo "${app^}")"
  cp -v "$exe" "$OUT/InfoUNSA-$nombre-Setup-$version-x64.exe"
done

echo
echo "Instaladores en: $OUT"
ls -lh "$OUT"
