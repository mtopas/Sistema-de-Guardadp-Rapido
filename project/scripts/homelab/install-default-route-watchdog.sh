#!/bin/bash
# Instala el watchdog de ruta default (requiere sudo).
# Uso (en el gabinete):
#   cd ~/project && sudo bash scripts/homelab/install-default-route-watchdog.sh
set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_SRC="$ROOT/ensure-default-route.sh"
UNIT_SRC="$ROOT/sgr-default-route.service"
TIMER_SRC="$ROOT/sgr-default-route.timer"

if [[ $EUID -ne 0 ]]; then
  echo "Correr con sudo." >&2
  exit 1
fi

install -m 755 "$SCRIPT_SRC" /usr/local/sbin/sgr-ensure-default-route
install -m 644 "$UNIT_SRC" /etc/systemd/system/sgr-default-route.service
install -m 644 "$TIMER_SRC" /etc/systemd/system/sgr-default-route.timer

# Endurecer netplan: on-link evita el fallo "Nexthop has invalid gateway"
NETPLAN=/etc/netplan/00-installer-config.yaml
if [[ -f "$NETPLAN" ]] && ! grep -q 'on-link:' "$NETPLAN"; then
  cp -a "$NETPLAN" "${NETPLAN}.bak.$(date +%Y%m%d%H%M%S)"
  python3 - <<'PY'
from pathlib import Path
p = Path("/etc/netplan/00-installer-config.yaml")
text = p.read_text()
if "on-link:" in text:
    raise SystemExit(0)
# Insertar on-link bajo el bloque via: 192.168.137.1
lines = text.splitlines(True)
out = []
for i, line in enumerate(lines):
    out.append(line)
    if line.strip() == "via: 192.168.137.1":
        indent = line[: len(line) - len(line.lstrip())]
        out.append(f"{indent}on-link: true\n")
p.write_text("".join(out))
print("netplan: added on-link: true")
PY
  netplan apply || true
fi

# Netplan exige que el yaml no sea legible por others
chmod 600 /etc/netplan/00-installer-config.yaml 2>/dev/null || true
chmod 600 /etc/netplan/*.yaml 2>/dev/null || true

systemctl daemon-reload
systemctl enable --now sgr-default-route.timer
systemctl start sgr-default-route.service || true

echo "---"
systemctl status --no-pager sgr-default-route.timer || true
echo "---"
ip route
echo "---"
ping -c1 -W2 8.8.8.8 && echo "Internet OK" || echo "Internet aún no (¿ICS en Windows?)"
