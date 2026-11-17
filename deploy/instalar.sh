#!/usr/bin/env bash
# Instala Valdoria como servicio del sistema (arranca con el PC y se reinicia si se cae) y el túnel de Cloudflare.
# Uso: sudo deploy/instalar.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Ejecútalo con sudo: sudo $0"; exit 1; }
USR="${SUDO_USER:?Ejecútalo con sudo desde tu usuario}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
CF="$(sudo -u "$USR" bash -lc 'command -v cloudflared || echo $HOME/.local/bin/cloudflared')"

if ss -ltn | grep -q ':8787 '; then
  echo "El puerto 8787 está ocupado (¿tienes 'npm run dev' abierto?). Ciérralo y vuelve a ejecutar esto."; exit 1
fi
[ -x "$CF" ] || { echo "No encuentro cloudflared ($CF)."; exit 1; }

echo "» Compilando la página (como $USR)…"
sudo -u "$USR" bash -lc "cd '$REPO' && npm run build" >/dev/null
mkdir -p "$REPO/apps/server/data" && chown "$USR:$USR" "$REPO/apps/server/data"

echo "» Instalando cloudflared en /usr/local/bin…"
install -m 0755 "$CF" /usr/local/bin/cloudflared

echo "» Instalando los servicios…"
sed -e "s#@REPO@#$REPO#g" -e "s#@USER@#$USR#g" "$REPO/deploy/valdoria.service" > /etc/systemd/system/valdoria.service
install -m 0644 "$REPO/deploy/valdoria-tunnel.service" /etc/systemd/system/valdoria-tunnel.service
systemctl daemon-reload
systemctl enable --now valdoria.service
for i in $(seq 1 40); do curl -fs http://127.0.0.1:8787/salud >/dev/null && break; sleep 0.5; done
curl -fs http://127.0.0.1:8787/salud >/dev/null || { echo "El juego no arrancó. Mira: journalctl -u valdoria -n 50"; exit 1; }
systemctl enable --now valdoria-tunnel.service
echo "» Listo. Esperando la dirección del túnel…"
"$REPO/deploy/direccion.sh"
