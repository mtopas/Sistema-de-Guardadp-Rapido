#Requires -RunAsAdministrator
$ErrorActionPreference = "Continue"
$out = Join-Path $env:TEMP "sgr-ics-diag.txt"
Remove-Item $out -ErrorAction SilentlyContinue
function L($m) { Add-Content -Path $out -Value $m }

L "=== SharedAccess ==="
Get-Service SharedAccess | Format-List Name, Status, StartType | Out-String | ForEach-Object { L $_.TrimEnd() }

L ""
L "=== HNetCfg sharing ==="
try {
    $netShare = New-Object -ComObject HNetCfg.HNetShare
    foreach ($c in $netShare.EnumEveryConnection) {
        $props = $netShare.NetConnectionProps.Invoke($c)
        $cfg = $netShare.INetSharingConfigurationForINetConnection.Invoke($c)
        L ("{0} | Device={1} | Status={2} | SharingEnabled={3} | SharingType={4}" -f `
            $props.Name, $props.DeviceName, $props.Status, $cfg.SharingEnabled, $cfg.SharingType)
    }
} catch {
    L ("HNetCfg error: " + $_.Exception.Message)
}

L ""
L "=== Adapters ==="
Get-NetAdapter | Format-Table Name, Status, LinkSpeed -AutoSize | Out-String | ForEach-Object { L $_.TrimEnd() }

L ""
L "=== IPv4 ==="
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' } |
    Format-Table InterfaceAlias, IPAddress, PrefixLength -AutoSize | Out-String | ForEach-Object { L $_.TrimEnd() }
