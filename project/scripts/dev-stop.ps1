## Limpieza del sandbox dev si uvicorn fue cerrado externamente (no con Ctrl+C en dev-start.ps1).
## dev-start.ps1 ya hace esta limpieza automaticamente en su bloque finally.
## Usar este script solo si quedaron archivos .dev huerfanos.

. "$PSScriptRoot\sync-config.ps1"

$DevDb  = "$LocalDataRoot\database\app.db.dev"
$DevWal = "$DevDb-wal"
$DevShm = "$DevDb-shm"

$found = $false
foreach ($f in @($DevDb, $DevWal, $DevShm)) {
    if (Test-Path $f) {
        Remove-Item $f -Force
        Write-Host "Eliminado: $f" -ForegroundColor Green
        $found = $true
    }
}

if (-not $found) {
    Write-Host "No hay archivos de sandbox dev que limpiar." -ForegroundColor Gray
}
