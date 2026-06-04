## Launcher principal de SGR para produccion.
## Flujo: pull (homelab->Windows) -> lanza SGR.exe -> detecta cambios -> push opcional.
##
## Crear acceso directo en el escritorio apuntando a este script:
##   Target:   powershell.exe -ExecutionPolicy Bypass -File "D:\...\scripts\sgr-abrir.ps1"
##   Start in: D:\...\scripts\

. "$PSScriptRoot\sync-config.ps1"

function Get-FileSHA256 {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    $sha    = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try { [Convert]::ToBase64String($sha.ComputeHash($stream)) }
    finally { $stream.Close(); $sha.Dispose() }
}

Write-Host ""
Write-Host "=== SGR - Iniciando ===" -ForegroundColor White
Write-Host ""

# --- 1. Pull ---
Write-Host "Sincronizando con el homelab..." -ForegroundColor Cyan
$pullOk = $false
try {
    & "$PSScriptRoot\sgr-sync-pull.ps1" -Silent
    $pullOk = $true
    Write-Host "  OK - datos actualizados desde el homelab." -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Warning "No se pudo sincronizar: $_"
    Write-Host ""
    $resp = Read-Host "  Abrir SGR con datos locales (pueden estar desactualizados)? [S/N]"
    if ($resp -notmatch "^[sS]$") {
        Write-Host "Cancelado." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  Continuando en modo offline." -ForegroundColor Yellow
}

# --- 2. Hash antes de abrir ---
# Nota: la primera vez tras una migracion de schema, init_db() puede escribir
# en la DB y el hash diferira aunque el usuario no haya editado nada.
# En ese caso responder N al prompt de push no tiene consecuencias.
$hashAntes = Get-FileSHA256 $LocalDb

# --- 3. Lanzar SGR.exe ---
if (-not (Test-Path $SgrExe)) {
    Write-Host ""
    Write-Host "ERROR: no se encontro el ejecutable en:" -ForegroundColor Red
    Write-Host "  $SgrExe" -ForegroundColor Red
    Write-Host "Compila el .exe con BUILD.md o ajusta SgrExe en sync-config.ps1." -ForegroundColor Yellow
    Read-Host "Pulsa Enter para salir"
    exit 1
}

Write-Host ""
Write-Host "Abriendo SGR..." -ForegroundColor Cyan
$proc = Start-Process -FilePath $SgrExe -PassThru
$proc.WaitForExit()

# --- 4. Detectar cambios por SHA-256 ---
$hashDespues = Get-FileSHA256 $LocalDb
$dirty = ($hashAntes -ne $null) -and ($hashDespues -ne $null) -and ($hashAntes -ne $hashDespues)

if (-not $dirty) {
    Write-Host ""
    Write-Host "Sin cambios locales detectados. Hasta luego." -ForegroundColor Gray
    Start-Sleep -Seconds 2
    exit 0
}

# --- 5. Ofrecer push si hubo cambios ---
Write-Host ""
Write-Host "Se detectaron cambios en la DB local." -ForegroundColor Yellow
if (-not $pullOk) {
    Write-Host "  (Atencion: la sesion comenzo sin pull exitoso - el homelab puede tener datos mas nuevos.)" -ForegroundColor DarkYellow
}
$resp = Read-Host "  Subir cambios al homelab? [S/N]"
if ($resp -notmatch "^[sS]$") {
    Write-Host "  Cambios locales conservados sin subir." -ForegroundColor Gray
    Start-Sleep -Seconds 1
    exit 0
}

Write-Host ""
Write-Host "Subiendo cambios al homelab..." -ForegroundColor Cyan
try {
    & "$PSScriptRoot\sgr-sync-push.ps1" -Silent
    Write-Host "  OK - homelab actualizado." -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "ERROR al subir: $_" -ForegroundColor Red
    Write-Host "  Tus datos locales estan intactos. Intenta push manual con sgr-sync-push.ps1." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Pulsa Enter para cerrar"
