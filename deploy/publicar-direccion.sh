#!/usr/bin/env bash
# Escribe en el README la dirección actual del túnel y la sube a GitHub (úsalo cada vez que cambie: tras reiniciar el PC o el túnel).
set -euo pipefail
cd "$(dirname "$0")/.."
U=$(deploy/direccion.sh | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com') || { echo "No hay dirección: ¿está instalado y en marcha el túnel?"; exit 1; }
python3 - "$U" <<'PY'
import re, sys, datetime
u = sys.argv[1]; p = "README.md"; s = open(p, encoding="utf-8").read()
hoy = datetime.date.today().strftime("%d/%m/%Y")
nuevo = f"<!-- DIRECCION -->\n**Dirección:** [{u}]({u})  \n<sub>Actualizada el {hoy}. Mientras la beta no tenga dominio propio, la dirección cambia cuando se reinicia el servidor.</sub>\n<!-- /DIRECCION -->"
s2 = re.sub(r"<!-- DIRECCION -->.*?<!-- /DIRECCION -->", lambda m: nuevo, s, flags=re.S)
if s2 == s: print("La dirección ya estaba al día."); sys.exit(0)
open(p, "w", encoding="utf-8").write(s2)
PY
if git diff --quiet -- README.md; then exit 0; fi
git add README.md && git commit -q -m "Dirección de juego: $U" -- README.md && git push -q && echo "Publicada en GitHub: $U"
