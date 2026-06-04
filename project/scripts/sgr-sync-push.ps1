## Push: sube DB y uploads desde Windows hacia el homelab.
## No requiere parar Docker -- usa POST /sync/import (backup SQLite online).
## El homelab guarda un .bak con timestamp antes de sobrescribir.
## Uso: .\sgr-sync-push.ps1          (con mensajes)
##      .\sgr-sync-push.ps1 -Silent  (solo errores)

param([switch]$Silent)

. "$PSScriptRoot\sync-config.ps1"

function Write-Info($msg) { if (-not $Silent) { Write-Host "  $msg" -ForegroundColor Cyan } }
function Write-OK($msg)   { if (-not $Silent) { Write-Host "  $msg" -ForegroundColor Green } }

# Subir DB via multipart usando System.Net.Http (sin dependencia de curl)
Write-Info "Subiendo app.db al homelab ..."

Add-Type -AssemblyName System.Net.Http
$client  = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(120)
if ($SyncToken) { $client.DefaultRequestHeaders.Add("X-Sync-Token", $SyncToken) }

$multipart  = [System.Net.Http.MultipartFormDataContent]::new()
$fileStream = [System.IO.File]::OpenRead($LocalDb)
$filePart   = [System.Net.Http.StreamContent]::new($fileStream)
$filePart.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/octet-stream")
$multipart.Add($filePart, "file", "app.db")

try {
    $resp = $client.PostAsync("$HomelabApiUrl/sync/import", $multipart).GetAwaiter().GetResult()
    $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $resp.IsSuccessStatusCode) {
        throw "HTTP $([int]$resp.StatusCode): $body"
    }
    Write-OK "DB subida. Respuesta: $body"
} catch {
    throw "Error al subir DB: $_"
} finally {
    $fileStream.Close()
    $client.Dispose()
}

# Subir uploads via scp (no critico si falla)
Write-Info "Subiendo uploads/ ..."
$remoteDst = "${HomelabUser}@${HomelabHost}:${HomelabProject}/uploads/."
try {
    scp -rp "$LocalUploads\." $remoteDst 2>&1 | Out-Null
    Write-OK "Uploads subidos."
} catch {
    Write-Warning "  No se pudieron subir uploads (no critico): $_"
}
