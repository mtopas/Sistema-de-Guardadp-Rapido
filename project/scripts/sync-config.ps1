## Configuracion de sync homelab <-> Windows
## Ajustar segun tu entorno. Incluido por los demas scripts con:  . "$PSScriptRoot\sync-config.ps1"

$HomelabHost    = "192.168.137.10"
$HomelabUser    = "mtopas"
$HomelabProject = "~/project"          # Ruta en el homelab (tilde expandida por bash remoto)
$HomelabApiPort = 8765

$SgrExe         = "D:\Sistema-de-Guardadp-Rapido\project\dist\SGR\SGR.exe"
$LocalDataRoot  = "D:\Sistema-de-Guardadp-Rapido\project"
$LocalDb        = "$LocalDataRoot\database\app.db"
$LocalUploads   = "$LocalDataRoot\uploads"
$LocalVault     = "D:\Boveda"

## Token de seguridad opcional.
## Si el homelab tiene SGR_SYNC_TOKEN=<valor> en su .env, poner el mismo valor aqui.
## Dejar vacio si no se configuro.
$SyncToken = ""

## Derivados (no editar)
$HomelabApiUrl = "http://${HomelabHost}:${HomelabApiPort}"

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
