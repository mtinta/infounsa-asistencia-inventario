#!/usr/bin/env bash
# Detiene las APIs de Asistencia e Inventario iniciadas con iniciar-servidores.sh.
# Uso: scripts/detener-servidores.sh [--con-db]   (--con-db también detiene las bases de datos Docker)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"

for name in asistencia-api inventario-api; do
  pidfile="$RUN_DIR/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    pid="$(cat "$pidfile")"
    kill "$pid"
    for _ in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid"
    echo "$name detenido (PID $pid)."
  else
    echo "$name no estaba en ejecución."
  fi
  rm -f "$pidfile"
done

if [ "${1:-}" = "--con-db" ] && command -v docker >/dev/null 2>&1; then
  docker compose -f "$ROOT/docker-compose.yml" stop asistencia-db inventario-db
fi
