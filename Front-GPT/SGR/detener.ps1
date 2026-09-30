$ErrorActionPreference = 'Stop'
$sgrPidFile = Join-Path $PSScriptRoot '.runtime\vite.pid'
if (-not (Test-Path -LiteralPath $sgrPidFile)) { Write-Output 'No hay un proceso registrado por iniciar.ps1.'; exit 0 }
$sgrProcessId = [int](Get-Content -LiteralPath $sgrPidFile)
$sgrExpectedVite = Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js'
$sgrProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $sgrProcessId" -ErrorAction SilentlyContinue
if (-not $sgrProcess) { Write-Output 'El proceso ya esta detenido.'; exit 0 }
if (-not $sgrProcess.CommandLine -or -not $sgrProcess.CommandLine.Contains($sgrExpectedVite)) { throw 'El PID ahora pertenece a otro proceso. No se detuvo.' }
Stop-Process -Id $sgrProcessId
Write-Output 'SGR Orbita detenido.'
