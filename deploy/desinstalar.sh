#!/usr/bin/env bash
# Quita los servicios (la base de datos y las copias de apps/server/data se quedan).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Ejecútalo con sudo: sudo $0"; exit 1; }
systemctl disable --now valdoria-tunnel.service valdoria.service 2>/dev/null || true
rm -f /etc/systemd/system/valdoria.service /etc/systemd/system/valdoria-tunnel.service
systemctl daemon-reload
echo "Servicios quitados."
