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

echo "» Comprobando el aislamiento (el juego no debe ver tu carpeta personal)…"
if systemd-run --quiet --wait --pipe --collect -p User="$USR" -p ProtectHome=tmpfs -p BindReadOnlyPaths="$REPO" -p BindPaths="$REPO/apps/server/data" -p ProtectSystem=strict \
    sh -c "test ! -e \$HOME/.ssh && ! touch '$REPO/.prueba' 2>/dev/null && touch '$REPO/apps/server/data/.prueba' && rm '$REPO/apps/server/data/.prueba'"; then
  echo "  Aislado: no ve tu carpeta personal, no puede tocar el código y solo escribe en apps/server/data."
else
  echo "  AVISO: el aislamiento no se aplica como se esperaba. Revisa antes de abrir la beta."
fi

systemctl enable --now valdoria-tunnel.service
echo "» Esperando la dirección del túnel…"
URL=$("$REPO/deploy/direccion.sh" | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com') || { echo "El túnel no dio dirección. Mira: journalctl -u valdoria-tunnel -n 30"; exit 1; }
echo "» Comprobando que la web responde desde Internet…"
for i in $(seq 1 30); do curl -fs "$URL/salud" >/dev/null && break; sleep 2; done
curl -fs "$URL/salud" >/dev/null && echo "  Responde: $URL" || echo "  Aún no responde (a veces tarda un minuto en propagarse)."
echo "» Publicando la dirección en el README de GitHub…"
sudo -u "$USR" -H bash -lc "cd '$REPO' && deploy/publicar-direccion.sh" || echo "  No se pudo subir a GitHub; ejecuta luego: deploy/publicar-direccion.sh"
echo
echo "════════════════════════════════════════════"
echo "  Valdoria está en marcha: $URL"
echo "════════════════════════════════════════════"
