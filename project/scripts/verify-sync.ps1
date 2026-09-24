## Verifica que la DB local y la del homelab esten sincronizadas, comparando los
## counts que expone GET /meta en ambos lados (ver SYNC-WINDOWS.md, seccion
## "Verificacion"). No modifica nada -- solo lee y compara.
##
## Uso: .\verify-sync.ps1                       (local 127.0.0.1:8765 vs homelab)
##      .\verify-sync.ps1 -LocalApiUrl "http://127.0.0.1:9000"   (override puntual)
##
## Exit code: 0 si coinciden, 1 si difieren o si algun lado es inalcanzable.

param(
    [string]$LocalApiUrl = "http://127.0.0.1:8765"
)

. "$PSScriptRoot\sync-config.ps1"

function Write-Info($msg)  { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host "  $msg" -ForegroundColor Green }
function Write-Bad($msg)   { Write-Host "  $msg" -ForegroundColor Red }
function Write-Warn2($msg) { Write-Host "  $msg" -ForegroundColor Yellow }

function Get-SgrMeta {
    param([string]$ApiUrl, [string]$Label)
    try {
        $resp = Invoke-WebRequest -Uri "$ApiUrl/meta" -Headers $headers -TimeoutSec 8 -UseBasicParsing
        return $resp.Content | ConvertFrom-Json
    } catch {
        Write-Bad "No se pudo consultar /meta en ${Label}: $_"
        return $null
    }
}

$headers = @{}
if ($SyncToken) { $headers["X-Sync-Token"] = $SyncToken }

Write-Host ""
Write-Host "=== Verificando sync: local vs homelab ===" -ForegroundColor White
Write-Info "Local:   $LocalApiUrl/meta"
Write-Info "Homelab: $HomelabApiUrl/meta"
Write-Host ""

$local   = Get-SgrMeta -ApiUrl $LocalApiUrl -Label "local ($LocalApiUrl)"
$homelab = Get-SgrMeta -ApiUrl $HomelabApiUrl -Label "homelab ($HomelabApiUrl)"

if (-not $local -or -not $homelab) {
    Write-Host ""
    Write-Bad "No se pudo completar la comparacion -- al menos un lado es inalcanzable."
    exit 1
}

# Union de todas las claves de counts en ambos lados, por si un lado tiene una
# tabla que el otro todavia no (p. ej. tras agregar una tabla nueva sin migrar).
$keys = @($local.counts.PSObject.Properties.Name) + @($homelab.counts.PSObject.Properties.Name)
$keys = $keys | Select-Object -Unique | Sort-Object

$mismatches = @()
foreach ($key in $keys) {
    $localVal   = $local.counts.$key
    $homelabVal = $homelab.counts.$key
    if ($null -eq $localVal)   { $localVal = "(ausente)" }
    if ($null -eq $homelabVal) { $homelabVal = "(ausente)" }
    if ($localVal -ne $homelabVal) {
        $mismatches += [PSCustomObject]@{ campo = $key; local = $localVal; homelab = $homelabVal }
    }
}

Write-Host "Counts:" -ForegroundColor White
foreach ($key in $keys) {
    $localVal   = $local.counts.$key
    $homelabVal = $homelab.counts.$key
    $line = "  {0,-20} local={1,-8} homelab={2,-8}" -f $key, $localVal, $homelabVal
    if ($mismatches.campo -contains $key) {
        Write-Host $line -ForegroundColor Red
    } else {
        Write-Host $line -ForegroundColor Green
    }
}

Write-Host ""
if ($mismatches.Count -eq 0) {
    Write-OK "MATCH -- todos los counts coinciden entre local y homelab."
    if ($local.db_path -ne $homelab.db_path) {
        Write-Warn2 "Nota: db_path difiere (esperable, son maquinas distintas): local='$($local.db_path)' homelab='$($homelab.db_path)'"
    }
    exit 0
} else {
    Write-Bad "MISMATCH -- $($mismatches.Count) campo(s) difieren:"
    foreach ($m in $mismatches) {
        Write-Bad "  - $($m.campo): local=$($m.local) homelab=$($m.homelab)"
    }
    Write-Host ""
    Write-Warn2 "Si acabas de pushear/pullear, probable que falte re-sincronizar. Ver SYNC-WINDOWS.md."
    exit 1
}
