#!/usr/bin/env bash
# Publica tus cambios: compila y reinicia el juego (los conectados se guardan antes; el túnel y su dirección no cambian).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
sudo systemctl restart valdoria.service
echo "Actualizado. Estado: $(systemctl is-active valdoria.service)"
