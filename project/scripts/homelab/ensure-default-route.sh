#!/bin/bash
# Restaura la ruta default vía gateway ICS (Windows) si falta.
# Motivo: tras corte de luz / reboot de la PC, systemd-networkd intenta
# aplicar "via 192.168.137.1" antes de que ICS esté listo, falla con
# "Nexthop has invalid gateway" y deja enp0s7 en estado failed sin recuperarse.
set -eu

GW="${SGR_ICS_GW:-192.168.137.1}"
DEV="${SGR_ICS_DEV:-enp0s7}"

# Sin enlace local no hay nada que hacer
if ! ip link show "$DEV" 2>/dev/null | grep -q "state UP"; then
  exit 0
fi

# Gateway aún no responde (ICS de Windows no listo)
if ! ping -c1 -W2 "$GW" >/dev/null 2>&1; then
  exit 0
fi

CURRENT="$(ip route show default 2>/dev/null || true)"
if echo "$CURRENT" | grep -q "via ${GW} "; then
  exit 0
fi

ip route replace default via "$GW" dev "$DEV"
logger -t sgr-default-route "Restored default via ${GW} on ${DEV} (was: ${CURRENT:-none})"
echo "OK: default via ${GW} on ${DEV}"
