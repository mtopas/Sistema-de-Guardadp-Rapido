# Descarga wheels Linux (python 3.11) para build Docker offline en el homelab.
# Ejecutar en Windows (con Internet):
#   .\project\scripts\prepare-docker-wheelhouse.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Wheelhouse = Join-Path $ProjectRoot "wheelhouse"
$Req = Join-Path $ProjectRoot "requirements.txt"

New-Item -ItemType Directory -Force -Path $Wheelhouse | Out-Null
Get-ChildItem $Wheelhouse -Include "*.whl", "*.tar.gz" -File -ErrorAction SilentlyContinue | Remove-Item -Force

function Invoke-WheelDownloadDocker {
    Write-Host "Descargando wheels con Docker (python:3.11-slim)…"
    docker run --rm `
        -v "${ProjectRoot}:/w" `
        -w /w `
        python:3.11-slim `
        bash -c "python -m pip install --upgrade pip && python -m pip download -r requirements.txt -d wheelhouse"
}

function Invoke-WheelDownloadPip {
    $python = Join-Path $ProjectRoot "venv\Scripts\python.exe"
    if (-not (Test-Path $python)) {
        throw "No hay Docker ni venv en $ProjectRoot. Creá venv: python -m venv venv"
    }
    Write-Host "Descargando wheels con venv (manylinux / cp311)…"
    & $python -m pip install --upgrade pip 2>&1 | Out-Null
    & $python -m pip download -r $Req -d $Wheelhouse `
        --platform manylinux2014_x86_64 `
        --platform linux_x86_64 `
        --python-version 311 `
        --implementation cp `
        --abi cp311
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
    Invoke-WheelDownloadDocker
} else {
    Invoke-WheelDownloadPip
}

$count = (Get-ChildItem $Wheelhouse -Include "*.whl", "*.tar.gz" -File).Count
if ($count -lt 1) {
    throw "No se generaron paquetes en wheelhouse/. Revisá conexión a PyPI."
}

Write-Host "OK: $count artefactos en wheelhouse/"
Write-Host "Subí al homelab:"
Write-Host "  scp -r `"$Wheelhouse`" mtopas@192.168.137.10:~/project/"
Write-Host "  scp `"$ProjectRoot\Dockerfile`" `"$ProjectRoot\docker-compose.yml`" `"$ProjectRoot\.dockerignore`" mtopas@192.168.137.10:~/project/"
Write-Host "En el gabinete:"
Write-Host "  cd ~/project && sudo docker compose build --no-cache && sudo docker compose up -d"
