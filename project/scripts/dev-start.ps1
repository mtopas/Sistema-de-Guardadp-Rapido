## Sandbox de desarrollo: copia app.db -> app.db.dev y D:\Boveda -> boveda.dev
## (solo estructura + .md, sin el contenido binario de _adjuntos), y levanta
## uvicorn apuntando a las copias. La DB y el vault de produccion nunca se
## tocan durante el desarrollo.
##
## Uso:
##   Terminal 1: .\scripts\dev-start.ps1     (bloquea mientras uvicorn corre; Ctrl+C para parar)
##   Terminal 2: cd frontend && npm run dev
##
## Al hacer Ctrl+C en la Terminal 1, el script limpia app.db.dev y boveda.dev automaticamente.

. "$PSScriptRoot\sync-config.ps1"

$DevDb    = "$LocalDataRoot\database\app.db.dev"
$DevWal   = "$DevDb-wal"
$DevShm   = "$DevDb-shm"
$DevVault = "$LocalDataRoot\database\boveda.dev"

# Avisar si ya hay un sandbox activo
if ((Test-Path $DevDb) -or (Test-Path $DevVault)) {
    Write-Host ""
    Write-Warning "Ya existe un sandbox dev (app.db.dev y/o boveda.dev)"
    Write-Host "  Puede que haya un uvicorn dev corriendo en otra terminal." -ForegroundColor Yellow
    $resp = Read-Host "  Recrear el sandbox de todos modos? [S/N]"
    if ($resp -notmatch "^[sS]$") { exit 0 }
    foreach ($f in @($DevDb, $DevWal, $DevShm)) {
        if (Test-Path $f) { Remove-Item $f -Force }
    }
    if (Test-Path $DevVault) { Remove-Item $DevVault -Recurse -Force }
}

# Crear sandbox de DB desde la DB local de produccion
Write-Host ""
if (Test-Path $LocalDb) {
    Copy-Item $LocalDb $DevDb -Force
    $sz = [math]::Round((Get-Item $DevDb).Length / 1KB, 1)
    Write-Host "Sandbox DB creado: app.db.dev ($sz KB)" -ForegroundColor Green
} else {
    Write-Host "Sandbox DB creado vacio (app.db no existe aun; init_db() lo inicializara)." -ForegroundColor Yellow
    New-Item -ItemType File -Path $DevDb -Force | Out-Null
}

# Crear sandbox de vault: estructura de carpetas + .md, SIN el contenido de
# _adjuntos/ (~765MB en el vault real, casi todo binarios) -- spin-up en
# segundos, no minutos. _adjuntos/ queda vacia, lista para fotos nuevas.
Write-Host ""
if (Test-Path $LocalVault) {
    New-Item -ItemType Directory -Path $DevVault -Force | Out-Null
    robocopy $LocalVault $DevVault *.md /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
    New-Item -ItemType Directory -Path "$DevVault\_adjuntos" -Force | Out-Null
    $nMd = (Get-ChildItem $DevVault -Recurse -Filter *.md -File | Measure-Object).Count
    Write-Host "Sandbox vault creado: boveda.dev ($nMd notas, sin adjuntos)" -ForegroundColor Green
} else {
    Write-Warning "No existe $LocalVault -- sandbox de vault creado vacio."
    New-Item -ItemType Directory -Path "$DevVault\_adjuntos" -Force | Out-Null
}

$env:DB_PATH    = $DevDb
$env:VAULT_ROOT = $DevVault
Write-Host "DB_PATH = $DevDb" -ForegroundColor Cyan
Write-Host "VAULT_ROOT = $DevVault" -ForegroundColor Cyan
Write-Host ""
Write-Host "Levantando uvicorn en http://127.0.0.1:8765 - Ctrl+C para detener." -ForegroundColor White
Write-Host ""

Set-Location $LocalDataRoot
try {
    & ".\venv\Scripts\uvicorn" app.main:app --reload --port 8765
} finally {
    # Cleanup automatico al salir (Ctrl+C o error)
    Write-Host ""
    Write-Host "Limpiando sandbox dev..." -ForegroundColor Cyan
    foreach ($f in @($DevDb, $DevWal, $DevShm)) {
        if (Test-Path $f) { Remove-Item $f -Force }
    }
    if (Test-Path $DevVault) { Remove-Item $DevVault -Recurse -Force }
    Write-Host "app.db.dev y boveda.dev eliminados. DB y vault de produccion intactos." -ForegroundColor Green
}
