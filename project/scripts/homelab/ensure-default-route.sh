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

# networkd puede quedar en "failed" (SETUP != configured/configuring) tras el
# corte de luz descripto arriba. Bug real encontrado el 2026-09-16: esto antes
# vivía en ExecStartPost del .service, corriendo `networkctl reconfigure`
# incondicionalmente en CADA tick del timer (cada 60s, para siempre), no solo
# cuando hacía falta. Eso fuerza a la interfaz a rehacer todo el ciclo
# DHCP/netplan cada minuto -- causa real del "DHCPv6 lease lost" repetido en
# journalctl, sin relación con el corte de luz en sí (ver Cerebro/
# estado-actual.md). Ahora solo reconfigura si networkd de verdad no está
# "configured"/"configuring".
SETUP="$(networkctl --no-legend list "$DEV" 2>/dev/null | awk '{print $NF}')"
if [ "$SETUP" != "configured" ] && [ "$SETUP" != "configuring" ]; then
  networkctl reconfigure "$DEV" >/dev/null 2>&1 || true
  logger -t sgr-default-route "networkd estado '${SETUP:-desconocido}' en ${DEV} -- reconfigure disparado"
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
