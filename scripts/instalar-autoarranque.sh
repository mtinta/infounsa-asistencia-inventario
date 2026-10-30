#!/usr/bin/env bash
# Registra un servicio systemd que inicia las APIs de Asistencia e Inventario al arrancar el servidor.
# Uso:  sudo scripts/instalar-autoarranque.sh [--sin-docker]   instala y habilita el servicio
#       sudo scripts/instalar-autoarranque.sh --quitar         lo elimina
# El servicio corre con el usuario que ejecuta sudo (debe poder usar Docker si no se usa --sin-docker).
set -euo pipefail

SERVICE="infounsa-servidores"
UNIT="/etc/systemd/system/$SERVICE.service"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: ejecuta con sudo." >&2; exit 1
fi
if ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemd no disponible en este sistema." >&2; exit 1
fi

if [ "${1:-}" = "--quitar" ]; then
  systemctl disable --now "$SERVICE" 2>/dev/null || true
  rm -f "$UNIT"
  systemctl daemon-reload
  echo "Servicio $SERVICE eliminado."
  exit 0
fi

RUN_USER="${SUDO_USER:-root}"
ENV_LINE=""
AFTER="network-online.target"
if [ "${1:-}" = "--sin-docker" ]; then
  ENV_LINE="Environment=SIN_DOCKER=1"
else
  AFTER="$AFTER docker.service"
fi

cat >"$UNIT" <<UNIT
[Unit]
Description=InfoUNSA - APIs de Asistencia e Inventario
After=$AFTER mysql.service mysqld.service mariadb.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=$RUN_USER
WorkingDirectory=$ROOT
$ENV_LINE
ExecStart=$ROOT/scripts/iniciar-servidores.sh
ExecStop=$ROOT/scripts/detener-servidores.sh
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now "$SERVICE"
echo "Servicio $SERVICE instalado y habilitado (usuario: $RUN_USER)."
echo "Estado: systemctl status $SERVICE   |   Logs de las APIs: $ROOT/.run/logs/"
