# Levanta la UI de Front-Claude-Design. El backend va aparte (uvicorn en :8765).
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host 'Falta Node.js/npm en el PATH.' -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) {
    Write-Host 'Instalando dependencias...' -ForegroundColor Cyan
    npm install
}

$api = if ($env:SGR_API) { $env:SGR_API } else { 'http://127.0.0.1:8765' }
Write-Host "UI en http://localhost:5273  ->  API $api" -ForegroundColor Green
Write-Host 'Si la API no responde, la app igual abre: avisa que esta offline.' -ForegroundColor DarkGray
npm run dev
