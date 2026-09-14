<#
Comparte D:\Boveda por SMB para que el homelab (Ubuntu, mount CIFS) pueda leer/escribir en vivo.

Correr UNA VEZ, como administrador, en la PC Windows que aloja D:\Boveda (la que queda siempre
prendida). No se auto-ejecuta como parte de ningun deploy -- es un paso manual deliberado.

Crea (si no existe) un usuario local dedicado para el mount del homelab -- nunca compartas la
carpeta a "Todos"/Everyone. Pide la contrasena de forma interactiva (Read-Host -AsSecureString),
nunca la dejes en texto plano en este archivo.
#>

$ShareName = "Boveda"
$SharePath = "D:\Boveda"
$MountUser = "sgr-homelab"

if (-not (Test-Path $SharePath)) {
    Write-Error "No existe $SharePath -- abortando."
    exit 1
}

# Crear el usuario dedicado si no existe
$existingUser = Get-LocalUser -Name $MountUser -ErrorAction SilentlyContinue
if (-not $existingUser) {
    Write-Host "Creando usuario local '$MountUser' para el mount del homelab..."
    $securePassword = Read-Host "Contrasena para $MountUser (se pide una vez, no se guarda en este script)" -AsSecureString
    New-LocalUser -Name $MountUser -Password $securePassword -PasswordNeverExpires -UserMayNotChangePassword:$false `
        -Description "Cuenta dedicada para el mount SMB del homelab a D:\Boveda -- no usar para login interactivo"
} else {
    Write-Host "Usuario '$MountUser' ya existe, no se toca la contrasena."
}

# Compartir la carpeta si no esta compartida ya
$existingShare = Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue
if ($existingShare) {
    Write-Host "El share '$ShareName' ya existe -- no se recrea. Revisa permisos manualmente si haces falta."
} else {
    New-SmbShare -Name $ShareName -Path $SharePath -FullAccess $MountUser
    Write-Host "Share '$ShareName' creado en $SharePath, acceso completo solo para $MountUser."
}

# Confirmar que el firewall de Windows permite SMB entrante desde la red del homelab
$fwRule = Get-NetFirewallRule -DisplayGroup "File and Printer Sharing" -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq "True" }
if (-not $fwRule) {
    Write-Warning "No se detectaron reglas de firewall habilitadas para 'File and Printer Sharing' -- puede que el homelab no llegue al share. Habilitalas manualmente si el mount desde Ubuntu falla."
}

Write-Host ""
Write-Host "Listo. Verificar desde el homelab (mtopas@192.168.137.10):"
Write-Host "  smbclient -L //192.168.137.1/ -U $MountUser"
Write-Host "Despues correr setup-boveda-cifs-homelab.sh alla."
