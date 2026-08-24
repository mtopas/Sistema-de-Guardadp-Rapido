#Requires -RunAsAdministrator
## Asegura NAT homelab (NetNat + forwarding + IP 192.168.137.1).
## Mas estable que ICS clasico tras reboot / corte de luz.
##
##   .\Ensure-Ics.ps1
## Instalacion: .\Install-IcsWatchdog.ps1

$ErrorActionPreference = "Continue"

$PrivateNic  = "Ethernet 2"
$PublicNic   = "Ethernet"
$GwIp        = "192.168.137.1"
$Prefix      = "192.168.137.0/24"
$NatName     = "SGR-Homelab"
$HomelabHost = "192.168.137.10"

function Write-Info([string]$msg) { Write-Host "[NAT] $msg" -ForegroundColor Cyan }
function Write-Warn([string]$msg) { Write-Host "[NAT] $msg" -ForegroundColor Yellow }
function Write-Ok([string]$msg)   { Write-Host "[NAT] $msg" -ForegroundColor Green }

# 1) IP del NIC privado
$nic = Get-NetAdapter -Name $PrivateNic -ErrorAction SilentlyContinue
if (-not $nic) { Write-Warn "No encuentro '$PrivateNic'"; exit 1 }
if ($nic.Status -ne "Up") { Write-Warn "'$PrivateNic' esta $($nic.Status)" }

$has = Get-NetIPAddress -InterfaceAlias $PrivateNic -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -eq $GwIp }
if (-not $has) {
    Write-Info "Asignando ${GwIp}/24 a ${PrivateNic}..."
    Get-NetIPAddress -InterfaceAlias $PrivateNic -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        ForEach-Object {
            Remove-NetIPAddress -InterfaceAlias $PrivateNic -IPAddress $_.IPAddress -Confirm:$false -ErrorAction SilentlyContinue
        }
    New-NetIPAddress -InterfaceAlias $PrivateNic -IPAddress $GwIp -PrefixLength 24 | Out-Null
}
Write-Ok "${PrivateNic} = ${GwIp}/24"

# 2) Perfil Private
try {
    $p = Get-NetConnectionProfile -InterfaceAlias $PrivateNic -ErrorAction Stop
    if ($p.NetworkCategory -ne "Private") {
        Set-NetConnectionProfile -InterfaceAlias $PrivateNic -NetworkCategory Private
        Write-Info "${PrivateNic}: Public -> Private"
    }
} catch {
    Write-Warn "Perfil: $($_.Exception.Message)"
}

# 3) Forwarding + IPEnableRouter
foreach ($n in @($PublicNic, $PrivateNic)) {
    try {
        Set-NetIPInterface -InterfaceAlias $n -Forwarding Enabled -ErrorAction Stop
    } catch {
        Write-Warn "Forwarding $n : $($_.Exception.Message)"
    }
}
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" -Name IPEnableRouter -Value 1 -Type DWord -Force
Write-Ok "Forwarding + IPEnableRouter"

# 4) NetNat
$existing = Get-NetNat -Name $NatName -ErrorAction SilentlyContinue
if (-not $existing) {
    # limpiar otros NAT rotos del mismo prefijo
    Get-NetNat -ErrorAction SilentlyContinue | Where-Object {
        $_.InternalIPInterfaceAddressPrefix -eq $Prefix
    } | ForEach-Object {
        Remove-NetNat -Name $_.Name -Confirm:$false -ErrorAction SilentlyContinue
    }
    try {
        New-NetNat -Name $NatName -InternalIPInterfaceAddressPrefix $Prefix -ErrorAction Stop | Out-Null
        Write-Ok "NetNat $NatName creado"
    } catch {
        Write-Warn "New-NetNat fallo: $($_.Exception.Message)"
        Write-Warn "Fallback: reiniciando SharedAccess (ICS)"
        Restart-Service SharedAccess -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Ok "NetNat $NatName ya existe"
}

# 5) Homelab
if (Test-Connection -ComputerName $HomelabHost -Count 1 -Quiet) {
    Write-Ok "Homelab $HomelabHost responde"
} else {
    Write-Warn "Homelab $HomelabHost no responde"
}

Write-Host ""
Write-Host "Probar gabinete: ping -c2 8.8.8.8" -ForegroundColor DarkGray
