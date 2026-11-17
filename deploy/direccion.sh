#!/usr/bin/env bash
# Muestra la dirección pública actual del túnel rápido (cambia cada vez que se reinicia el túnel o el PC).
for i in $(seq 1 30); do
  U=$(journalctl -u valdoria-tunnel --since "$(systemctl show -p ActiveEnterTimestamp --value valdoria-tunnel)" --no-pager -o cat 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
  [ -n "$U" ] && { echo "Dirección para jugar: $U"; exit 0; }
  sleep 1
done
echo "Aún no hay dirección. Mira: journalctl -u valdoria-tunnel -n 30"; exit 1
