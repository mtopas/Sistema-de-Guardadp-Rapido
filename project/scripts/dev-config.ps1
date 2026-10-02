## Configuracion de rutas locales para el sandbox de desarrollo.
## Incluido por dev-start.ps1 / dev-stop.ps1 con:  . "$PSScriptRoot\dev-config.ps1"
##
## Solo define rutas derivadas de la ubicacion de este script (portable, no
## hardcodeadas). No hay nada de sync homelab <-> Windows aca: ese mecanismo y
## el .exe se retiraron el 2026-10-02 (el usuario opera solo desde el homelab).

$LocalDataRoot = Split-Path $PSScriptRoot -Parent          # project/
$RepoRoot      = Split-Path $LocalDataRoot -Parent         # raiz del repo
$LocalDb       = "$LocalDataRoot\database\app.db"
$LocalVault    = Join-Path (Split-Path $RepoRoot -Parent) "Boveda"   # sibling del repo (= VAULT_ROOT)
