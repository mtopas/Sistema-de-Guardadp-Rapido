# Corta el servidor de Vite de este proyecto (puerto 5273).
$ErrorActionPreference = 'SilentlyContinue'
$conns = Get-NetTCPConnection -LocalPort 5273 -State Listen
if (-not $conns) {
    Write-Host 'No hay nada escuchando en :5273.' -ForegroundColor DarkGray
    exit 0
}
foreach ($pid in ($conns | Select-Object -ExpandProperty OwningProcess -Unique)) {
    Stop-Process -Id $pid -Force
    Write-Host "Proceso $pid detenido." -ForegroundColor Yellow
}
