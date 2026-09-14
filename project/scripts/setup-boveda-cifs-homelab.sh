#!/bin/bash
# Monta D:\Boveda (compartido por SMB desde Windows) en el homelab via CIFS.
# Correr UNA VEZ en el homelab (mtopas@192.168.137.10), con sudo. No se auto-ejecuta desde
# ningun deploy -- paso manual deliberado, despues de correr setup-boveda-smb-windows.ps1 del
# otro lado.
#
# Prerequisito: haber corrido setup-boveda-smb-windows.ps1 en la PC Windows primero, y tener
# la contrasena del usuario 'sgr-homelab' a mano (se pide interactivamente acá, nunca se
# hardcodea).

set -euo pipefail

MOUNT_POINT="/mnt/boveda"
CRED_FILE="/etc/samba/boveda-credentials"
WINDOWS_IP="192.168.137.1"
SHARE="Boveda"
SMB_USER="sgr-homelab"

if ! command -v mount.cifs &> /dev/null; then
    echo "Instalando cifs-utils..."
    sudo apt-get update && sudo apt-get install -y cifs-utils
fi

echo "Contrasena de $SMB_USER (se guarda solo en $CRED_FILE, permisos 600, nunca en este script ni en git):"
read -rs SMB_PASSWORD
echo ""

sudo mkdir -p "$(dirname "$CRED_FILE")"
sudo tee "$CRED_FILE" > /dev/null <<EOF
username=$SMB_USER
password=$SMB_PASSWORD
EOF
sudo chmod 600 "$CRED_FILE"
unset SMB_PASSWORD

sudo mkdir -p "$MOUNT_POINT"

# Entrada de fstab: _netdev espera a que la red este lista; x-systemd.automount +
# x-systemd.mount-timeout evita que el boot se cuelgue si Windows todavia no levanto ICS
# (ver HOMELAB.md -- la red del homelab depende de que Windows este prendida y con ICS activo,
# y eso puede tardar unos segundos despues de un corte de luz).
FSTAB_LINE="//${WINDOWS_IP}/${SHARE} ${MOUNT_POINT} cifs credentials=${CRED_FILE},_netdev,x-systemd.automount,x-systemd.mount-timeout=30,uid=mtopas,gid=mtopas,file_mode=0664,dir_mode=0775 0 0"

if grep -qF "$MOUNT_POINT" /etc/fstab; then
    echo "Ya hay una entrada para $MOUNT_POINT en /etc/fstab -- no se duplica. Revisala a mano si hace falta."
else
    echo "$FSTAB_LINE" | sudo tee -a /etc/fstab > /dev/null
    echo "Entrada agregada a /etc/fstab."
fi

sudo systemctl daemon-reload
sudo mount "$MOUNT_POINT" || echo "El mount inicial fallo -- revisar con 'sudo mount -a' y 'journalctl -xe' antes de seguir."

# Watchdog: mismo patron que sgr-ensure-default-route (HOMELAB.md) -- reintenta el mount cada
# 60s si se cayo, en vez de quedar colgado hasta el proximo reboot manual.
sudo tee /usr/local/sbin/sgr-ensure-boveda-mount > /dev/null <<'EOF'
#!/bin/bash
MOUNT_POINT="/mnt/boveda"
if ! mountpoint -q "$MOUNT_POINT"; then
    mount "$MOUNT_POINT" 2>&1 | logger -t sgr-boveda-mount
fi
EOF
sudo chmod +x /usr/local/sbin/sgr-ensure-boveda-mount

sudo tee /etc/systemd/system/sgr-boveda-mount-watchdog.service > /dev/null <<'EOF'
[Unit]
Description=Reintenta el mount de D:\Boveda si se cayo

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/sgr-ensure-boveda-mount
EOF

sudo tee /etc/systemd/system/sgr-boveda-mount-watchdog.timer > /dev/null <<'EOF'
[Unit]
Description=Corre sgr-ensure-boveda-mount cada 60s

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now sgr-boveda-mount-watchdog.timer

echo ""
echo "Listo. Verificar: mountpoint /mnt/boveda ; ls /mnt/boveda"
echo "Watchdog activo: systemctl status sgr-boveda-mount-watchdog.timer"
