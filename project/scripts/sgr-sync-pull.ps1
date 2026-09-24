## Pull: descarga DB y uploads desde el homelab hacia Windows.
## No requiere parar Docker -- usa GET /sync/export (backup SQLite online).
## Uso: .\sgr-sync-pull.ps1          (con mensajes)
##      .\sgr-sync-pull.ps1 -Silent  (solo errores; para sgr-abrir.ps1)

param([switch]$Silent)

. "$PSScriptRoot\sync-config.ps1"

function Write-Info($msg) { if (-not $Silent) { Write-Host "  $msg" -ForegroundColor Cyan } }
function Write-OK($msg)   { if (-not $Silent) { Write-Host "  $msg" -ForegroundColor Green } }

$headers = @{}
if ($SyncToken) { $headers["X-Sync-Token"] = $SyncToken }

try {

# 1. Verificar conectividad
Write-Info "Verificando conexion con $HomelabApiUrl ..."
try {
    Invoke-WebRequest -Uri "$HomelabApiUrl/meta" -Headers $headers -TimeoutSec 6 -UseBasicParsing | Out-Null
} catch {
    throw "Homelab inalcanzable en $HomelabApiUrl - $_"
}

# 2. Descargar DB
Write-Info "Descargando app.db ..."
$tmp = "$LocalDb.tmp"
try {
    Invoke-WebRequest -Uri "$HomelabApiUrl/sync/export" -Headers $headers `
        -OutFile $tmp -TimeoutSec 120 -UseBasicParsing
} catch {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
    throw "Error al descargar DB: $_"
}

$size = (Get-Item $tmp).Length
if ($size -lt 4096) {
    Remove-Item $tmp -Force
    throw "Archivo descargado demasiado chico ($size bytes) - posible error en el servidor"
}

# 3. Backup local antes de reemplazar
if (Test-Path $LocalDb) {
    Copy-Item $LocalDb "$LocalDb.bak" -Force
}

# 4. Reemplazar DB local
Move-Item $tmp $LocalDb -Force
Write-OK "DB sincronizada ($([math]::Round($size/1KB, 1)) KB)."

# 5. Sincronizar uploads via scp (no critico si falla)
Write-Info "Sincronizando uploads/ ..."
$remoteSrc = "${HomelabUser}@${HomelabHost}:${HomelabProject}/uploads/."
try {
    scp -rp $remoteSrc "$LocalUploads\" 2>&1 | Out-Null
    Write-OK "Uploads sincronizados."
} catch {
    Write-Warning "  No se pudieron sincronizar uploads (no critico): $_"
}
Write-SgrSyncStatus 'pull' $true
} catch {
    Write-SgrSyncStatus 'pull' $false
    throw
}
