#!/usr/bin/env bash
# Inicia las APIs de Asistencia e Inventario en segundo plano (la terminal queda libre).
# PIDs en .run/, logs en .run/logs/. Para cerrarlos: scripts/detener-servidores.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"
LOG_DIR="$RUN_DIR/logs"
mkdir -p "$LOG_DIR"

# Puertos (mismos valores por defecto que el código de las APIs)
if [ -f "$ROOT/.env" ]; then set -a; . "$ROOT/.env"; set +a; fi
ASISTENCIA_PORT="${ASISTENCIA_API_PORT:-43000}"
INVENTARIO_PORT="${INVENTARIO_API_PORT:-43001}"

# Bases de datos (MySQL en Docker) si Docker está disponible.
# Con MySQL nativo (sin Docker): SIN_DOCKER=1 scripts/iniciar-servidores.sh
if [ "${SIN_DOCKER:-0}" = "1" ]; then
  echo "SIN_DOCKER=1: se usa el MySQL nativo configurado en los .env de cada API."
elif command -v docker >/dev/null 2>&1; then
  echo "Levantando bases de datos (docker compose)..."
  docker compose -f "$ROOT/docker-compose.yml" up -d --wait asistencia-db inventario-db \
    || echo "AVISO: no se pudieron levantar las bases de datos con Docker." >&2
else
  echo "AVISO: Docker no encontrado; se asume MySQL ya disponible en los puertos configurados." >&2
fi

start_api() {
  local name="$1" dir="$2"
  local pidfile="$RUN_DIR/$name.pid"

  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name ya está en ejecución (PID $(cat "$pidfile"))."
    return
  fi

  if [ ! -f "$dir/dist/main.js" ]; then
    echo "Compilando $name..."
    (cd "$dir" && npm run build)
  fi

  # setsid + nohup: el proceso sobrevive al cierre de la terminal
  cd "$dir"
  setsid nohup node dist/main.js >"$LOG_DIR/$name.log" 2>&1 < /dev/null &
  echo $! >"$pidfile"
  cd "$ROOT"
  echo "$name iniciado (PID $(cat "$pidfile")) -> log: $LOG_DIR/$name.log"
}

start_api asistencia-api "$ROOT/apps/asistencia/api"
start_api inventario-api "$ROOT/apps/inventario/api"

echo
echo "Asistencia: http://localhost:$ASISTENCIA_PORT"
echo "Inventario: http://localhost:$INVENTARIO_PORT"
