$ErrorActionPreference = 'Stop'
$sgrRoot = $PSScriptRoot
$sgrRuntime = Join-Path $sgrRoot '.runtime'
$sgrVite = Join-Path $sgrRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $sgrVite)) { throw 'Faltan dependencias. Ejecuta npm install en esta carpeta.' }
$sgrListener = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue
if ($sgrListener) {
  $sgrExisting = Get-CimInstance Win32_Process -Filter "ProcessId = $($sgrListener[0].OwningProcess)"
  if ($sgrExisting.CommandLine -and $sgrExisting.CommandLine.Contains($sgrVite)) {
    Write-Output 'SGR Orbita ya esta disponible en http://127.0.0.1:5174'
    exit 0
  }
  throw 'El puerto 5174 esta ocupado por otro proceso. No se modifico ese proceso.'
}
New-Item -ItemType Directory -Path $sgrRuntime -Force | Out-Null
$sgrNode = (Get-Command node.exe).Source
$sgrProcess = Start-Process -FilePath $sgrNode -ArgumentList @(('"' + $sgrVite + '"'), '--host', '127.0.0.1') -WorkingDirectory $sgrRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $sgrRuntime 'vite.log') -RedirectStandardError (Join-Path $sgrRuntime 'vite-error.log') -PassThru
Set-Content -LiteralPath (Join-Path $sgrRuntime 'vite.pid') -Value $sgrProcess.Id
Write-Output "SGR Orbita iniciado (PID $($sgrProcess.Id)): http://127.0.0.1:5174"
