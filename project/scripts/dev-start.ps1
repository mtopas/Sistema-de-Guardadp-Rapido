## Sandbox de desarrollo: copia app.db -> app.db.dev y levanta uvicorn apuntando a la copia.
## La DB de produccion local nunca se toca durante el desarrollo.
##
## Uso:
##   Terminal 1: .\scripts\dev-start.ps1     (bloquea mientras uvicorn corre; Ctrl+C para parar)
##   Terminal 2: cd frontend && npm run dev
##
## Al hacer Ctrl+C en la Terminal 1, el script limpia app.db.dev automaticamente.

. "$PSScriptRoot\sync-config.ps1"

$DevDb  = "$LocalDataRoot\database\app.db.dev"
$DevWal = "$DevDb-wal"
$DevShm = "$DevDb-shm"

# Avisar si ya hay un sandbox activo
if (Test-Path $DevDb) {
    Write-Host ""
    Write-Warning "Ya existe $DevDb"
    Write-Host "  Puede que haya un uvicorn dev corriendo en otra terminal." -ForegroundColor Yellow
    $resp = Read-Host "  Recrear el sandbox de todos modos? [S/N]"
    if ($resp -notmatch "^[sS]$") { exit 0 }
    foreach ($f in @($DevDb, $DevWal, $DevShm)) {
        if (Test-Path $f) { Remove-Item $f -Force }
    }
}

# Crear sandbox desde la DB local de produccion
Write-Host ""
if (Test-Path $LocalDb) {
    Copy-Item $LocalDb $DevDb -Force
    $sz = [math]::Round((Get-Item $DevDb).Length / 1KB, 1)
    Write-Host "Sandbox creado: app.db.dev ($sz KB)" -ForegroundColor Green
} else {
    Write-Host "Sandbox creado vacio (app.db no existe aun; init_db() lo inicializara)." -ForegroundColor Yellow
    New-Item -ItemType File -Path $DevDb -Force | Out-Null
}

$env:DB_PATH = $DevDb
Write-Host "DB_PATH = $DevDb" -ForegroundColor Cyan
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
    Write-Host "app.db.dev eliminado. DB de produccion intacta." -ForegroundColor Green
}
