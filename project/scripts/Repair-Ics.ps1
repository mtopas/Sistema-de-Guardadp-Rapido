#Requires -RunAsAdministrator
## Restaura ICS tras un repair fallido (Ethernet 2 en 169.254.x).
$ErrorActionPreference = "Stop"
$LogFile = Join-Path $PSScriptRoot "ics-repair-log.txt"
function Log($m) { Add-Content $LogFile $m; Write-Host $m }

"" | Set-Content $LogFile
Log "[ICS] Restore start $(Get-Date -Format o)"

$PublicNic  = "Ethernet"
$PrivateNic = "Ethernet 2"
$GwIp       = "192.168.137.1"

$netShare = New-Object -ComObject HNetCfg.HNetShare
$publicConn = $null
$privateConn = $null
foreach ($c in $netShare.EnumEveryConnection) {
    $n = $netShare.NetConnectionProps.Invoke($c).Name
    if ($n -eq $PublicNic)  { $publicConn = $c }
    if ($n -eq $PrivateNic) { $privateConn = $c }
}
if (-not $publicConn -or -not $privateConn) { throw "No encuentro Ethernet / Ethernet 2" }

Log "[ICS] Disable sharing..."
foreach ($c in $netShare.EnumEveryConnection) {
    $cfg = $netShare.INetSharingConfigurationForINetConnection.Invoke($c)
    if ($cfg.SharingEnabled) {
        Log ("  Off: " + $netShare.NetConnectionProps.Invoke($c).Name)
        $cfg.DisableSharing()
    }
}
Start-Sleep 2
Restart-Service SharedAccess -Force -ErrorAction SilentlyContinue
Start-Sleep 2

Log "[ICS] Forzar ${GwIp}/24 en ${PrivateNic}..."
Get-NetIPAddress -InterfaceAlias $PrivateNic -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    ForEach-Object {
        Log ("  Remove $($_.IPAddress)")
        Remove-NetIPAddress -InterfaceAlias $PrivateNic -IPAddress $_.IPAddress -Confirm:$false -ErrorAction SilentlyContinue
    }
# Quitar rutas basura del APIPA si quedaron
Get-NetRoute -InterfaceAlias $PrivateNic -ErrorAction SilentlyContinue |
    Where-Object { $_.DestinationPrefix -like '169.254.*' -or $_.DestinationPrefix -eq '0.0.0.0/0' } |
    ForEach-Object { Remove-NetRoute -InterfaceAlias $PrivateNic -DestinationPrefix $_.DestinationPrefix -Confirm:$false -ErrorAction SilentlyContinue }

New-NetIPAddress -InterfaceAlias $PrivateNic -IPAddress $GwIp -PrefixLength 24 -ErrorAction Stop | Out-Null
Log "[ICS] ${PrivateNic} = ${GwIp}/24"

Log "[ICS] Enable sharing (PUBLIC first, then PRIVATE)..."
$pubCfg = $netShare.INetSharingConfigurationForINetConnection.Invoke($publicConn)
$prvCfg = $netShare.INetSharingConfigurationForINetConnection.Invoke($privateConn)
$pubCfg.EnableSharing(0)  # PUBLIC = internet
Start-Sleep 1
$prvCfg.EnableSharing(1)  # PRIVATE = gabinete
Start-Sleep 2

try { Set-NetConnectionProfile -InterfaceAlias $PrivateNic -NetworkCategory Private } catch {}

Restart-Service SharedAccess -Force
Start-Sleep 4

# Si ICS piso la IP, volver a ponerla
$addr = Get-NetIPAddress -InterfaceAlias $PrivateNic -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -eq $GwIp }
if (-not $addr) {
    Log "[ICS] IP perdida tras sharing; reaplicando ${GwIp}"
    Get-NetIPAddress -InterfaceAlias $PrivateNic -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-NetIPAddress -InterfaceAlias $PrivateNic -IPAddress $_.IPAddress -Confirm:$false -ErrorAction SilentlyContinue }
    New-NetIPAddress -InterfaceAlias $PrivateNic -IPAddress $GwIp -PrefixLength 24 | Out-Null
}

Log "[ICS] Estado:"
Get-NetIPAddress -InterfaceAlias $PrivateNic -AddressFamily IPv4 | ForEach-Object { Log ("  IP $($_.IPAddress)/$($_.PrefixLength)") }
foreach ($c in @($publicConn, $privateConn)) {
    $p = $netShare.NetConnectionProps.Invoke($c)
    $cfg = $netShare.INetSharingConfigurationForINetConnection.Invoke($c)
    Log ("  $($p.Name): Sharing=$($cfg.SharingEnabled) Type=$($cfg.SharingType)")
}

Log "[ICS] Ping gabinete..."
if (Test-Connection -ComputerName "192.168.137.10" -Count 2 -Quiet) {
    Log "[ICS] OK 192.168.137.10"
} else {
    Log "[ICS] FAIL ping 192.168.137.10 - gabinete puede tardar en subir enlace"
}
Log "[ICS] Done"
