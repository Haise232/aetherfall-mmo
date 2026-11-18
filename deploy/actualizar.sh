#!/usr/bin/env bash
# Publica tus cambios: compila y reinicia el juego (los conectados se guardan antes). El túnel sigue igual y su dirección
# no cambia (desde que valdoria-tunnel.service no depende con Requires= del juego; reinstala con sudo deploy/instalar.sh si es antiguo).
set -euo pipefail
[ "$(id -u)" != 0 ] || { echo "Ejecútalo SIN sudo (deploy/actualizar.sh): compila como tu usuario y pide sudo solo para reiniciar."; exit 1; }
cd "$(dirname "$0")/.."
if [ -n "$(find apps/client/dist ! -user "$(id -un)" -print -quit 2>/dev/null)" ]; then
  echo "apps/client/dist tiene archivos de otro usuario (¿se compiló con sudo?). Arréglalo con: sudo chown -R $(id -un): apps/client/dist"; exit 1
fi
npm run build
sudo systemctl restart valdoria.service
echo "Actualizado. Estado: $(systemctl is-active valdoria.service)"
