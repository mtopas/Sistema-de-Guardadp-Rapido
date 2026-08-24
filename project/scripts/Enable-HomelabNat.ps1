#Requires -RunAsAdministrator
## Alternativa a ICS clasico: NetNat + forwarding (mas estable en Win10/11)
$ErrorActionPreference = "Continue"
$LogFile = "D:\Sistema-de-Guardadp-Rapido\project\scripts\ics-repair-log.txt"
function Log($m) { Add-Content $LogFile $m; Write-Host $m }
"" | Set-Content $LogFile
Log "[NAT] Start $(Get-Date -Format o)"

$PrivateNic = "Ethernet 2"
$GwIp = "192.168.137.1"
$Prefix = "192.168.137.0/24"

# 1) Asegurar IP gateway
$has = Get-NetIPAddress -InterfaceAlias $PrivateNic -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -eq $GwIp }
if (-not $has) {
    Get-NetIPAddress -InterfaceAlias $PrivateNic -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-NetIPAddress -InterfaceAlias $PrivateNic -IPAddress $_.IPAddress -Confirm:$false -ErrorAction SilentlyContinue }
    New-NetIPAddress -InterfaceAlias $PrivateNic -IPAddress $GwIp -PrefixLength 24 | Out-Null
    Log "[NAT] Set ${GwIp}/24 on ${PrivateNic}"
} else {
    Log "[NAT] ${PrivateNic} already ${GwIp}"
}

try { Set-NetConnectionProfile -InterfaceAlias $PrivateNic -NetworkCategory Private } catch {}

# 2) Forwarding en ambos NICs
foreach ($nic in @("Ethernet", $PrivateNic)) {
    try {
        Set-NetIPInterface -InterfaceAlias $nic -Forwarding Enabled -ErrorAction Stop
        Log "[NAT] Forwarding Enabled on $nic"
    } catch {
        Log "[NAT] Forwarding fail on $nic : $($_.Exception.Message)"
    }
}
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" -Name IPEnableRouter -Value 1 -Type DWord
Log "[NAT] IPEnableRouter=1"

# 3) NetNat (si el modulo existe)
Get-NetNat -ErrorAction SilentlyContinue | ForEach-Object {
    Log "[NAT] Removing existing NetNat $($_.Name)"
    Remove-NetNat -Name $_.Name -Confirm:$false -ErrorAction SilentlyContinue
}
try {
    New-NetNat -Name "SGR-Homelab" -InternalIPInterfaceAddressPrefix $Prefix -ErrorAction Stop | Out-Null
    Log "[NAT] New-NetNat SGR-Homelab $Prefix OK"
} catch {
    Log "[NAT] New-NetNat failed: $($_.Exception.Message)"
    Log "[NAT] Intentando mantener ICS SharedAccess + forwarding"
}

# 4) ICS service up (por si acaso)
Set-Service SharedAccess -StartupType Automatic -ErrorAction SilentlyContinue
Start-Service SharedAccess -ErrorAction SilentlyContinue
Restart-Service SharedAccess -Force -ErrorAction SilentlyContinue
Start-Sleep 2

Log "[NAT] Adapters:"
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' } |
    ForEach-Object { Log ("  $($_.InterfaceAlias) $($_.IPAddress)/$($_.PrefixLength)") }
Log "[NAT] NetNat:"
Get-NetNat -ErrorAction SilentlyContinue | ForEach-Object { Log ("  $($_.Name) $($_.InternalIPInterfaceAddressPrefix)") }
Log "[NAT] Forwarding:"
Get-NetIPInterface -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match 'Ethernet' } |
    ForEach-Object { Log ("  $($_.InterfaceAlias) Forwarding=$($_.Forwarding)") }

if (Test-Connection 192.168.137.10 -Count 1 -Quiet) { Log "[NAT] Homelab ping OK" } else { Log "[NAT] Homelab ping FAIL" }
Log "[NAT] Done - probar en gabinete: ping -c2 8.8.8.8"
