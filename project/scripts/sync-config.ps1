## Configuracion de sync homelab <-> Windows
## Ajustar segun tu entorno. Incluido por los demas scripts con:  . "$PSScriptRoot\sync-config.ps1"

$HomelabHost    = "192.168.137.10"
$HomelabUser    = "mtopas"
$HomelabProject = "~/project"          # Ruta en el homelab (tilde expandida por bash remoto)
$HomelabApiPort = 8765

## Rutas locales derivadas de la ubicacion de este script (portable, no
## hardcodeadas) -- $LocalDataRoot es project/, $LocalVault es el sibling
## del repo (mismo criterio que VAULT_ROOT en app/config.py).
$LocalDataRoot  = Split-Path $PSScriptRoot -Parent
$RepoRoot       = Split-Path $LocalDataRoot -Parent
$SgrExe         = Join-Path $LocalDataRoot "dist\SGR\SGR.exe"
$LocalDb        = "$LocalDataRoot\database\app.db"
$LocalUploads   = "$LocalDataRoot\uploads"
$LocalVault     = Join-Path (Split-Path $RepoRoot -Parent) "Boveda"

## Token de seguridad opcional.
## Si el homelab tiene SGR_SYNC_TOKEN=<valor> en su .env, poner el mismo valor aqui.
## Dejar vacio si no se configuro.
$SyncToken = ""

## Derivados (no editar)
$HomelabApiUrl = "http://${HomelabHost}:${HomelabApiPort}"

function Write-SgrSyncStatus($direction, $ok) {
    $statusPath = Join-Path (Split-Path $LocalDb -Parent) 'sync-status.json'
    $temporaryPath = "$statusPath.tmp"
    try {
        @{ direction = $direction; ok = [bool]$ok; at = (Get-Date).ToString('o') } |
            ConvertTo-Json -Compress | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
        Move-Item -LiteralPath $temporaryPath -Destination $statusPath -Force
    } catch {
        Write-Warning "No se pudo guardar el estado de sincronizacion: $_"
    }
}

## scp: buscar en ubicaciones conocidas si no esta en el PATH
if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
    $scpCandidates = @(
        "C:\Windows\System32\OpenSSH",
        "C:\Program Files\OpenSSH",
        "C:\Program Files\OpenSSH-Win64",
        "C:\Program Files\Git\usr\bin"
    )
    foreach ($dir in $scpCandidates) {
        if (Test-Path "$dir\scp.exe") {
            $env:PATH = "$dir;" + $env:PATH
            break
        }
    }
}
