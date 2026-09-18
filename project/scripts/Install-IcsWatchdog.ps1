## Instala tarea programada que rearma ICS al arranque de Windows y cada 5 min
## mientras la sesion siga activa (idempotente -- Ensure-Ics.ps1 no hace nada
## si ya esta todo bien, mismo criterio que el timer systemd del lado Ubuntu).
## Requiere PowerShell elevado (Administrador).
##
##   .\Install-IcsWatchdog.ps1
##
## 2026-09-17: se agrega el trigger recurrente. Motivo real (no solo cautela):
## "Ethernet 2" puede caer a perfil "Publico" en cualquier momento, no solo al
## arrancar Windows -- eso activa una regla de Firewall que bloquea ollama.exe
## en redes publicas, y el homelab deja de poder llegar a Ollama (visto en vivo
## el 2026-09-17: timeouts de 120s en el worker de Jarvis, nota real de un
## usuario que quedo atascada en ERROR). Antes de esto la tarea solo corria una
## vez al boot -- si el perfil cambiaba con Windows ya arriba, nadie lo
## arreglaba hasta el proximo reinicio.

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$ScriptPath = Join-Path $PSScriptRoot "Ensure-Ics.ps1"
if (-not (Test-Path $ScriptPath)) {
    throw "No encuentro Ensure-Ics.ps1 en $PSScriptRoot"
}

$TaskName = "SGR-Ensure-ICS"
$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""

# Trigger 1: al arranque, con delay para que los NICs estén up
$TriggerStartup = New-ScheduledTaskTrigger -AtStartup
$TriggerStartup.Delay = "PT45S"

# Trigger 2: recurrente cada 5 min desde ahora, indefinidamente -- cubre un
# flip de perfil de red que pase con Windows ya corriendo, no solo al boot.
$TriggerRecurring = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration ([TimeSpan]::MaxValue)

$Principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger @($TriggerStartup, $TriggerRecurring) `
    -Principal $Principal `
    -Settings $Settings `
    -Force | Out-Null

# También dejar SharedAccess en Automatic Delayed
Set-Service -Name SharedAccess -StartupType Automatic
$reg = "HKLM:\SYSTEM\CurrentControlSet\Services\SharedAccess"
New-ItemProperty -Path $reg -Name DelayedAutostart -PropertyType DWORD -Value 1 -Force | Out-Null

Write-Host "[ICS] Tarea '$TaskName' instalada (AtStartup +45s, y cada 5 min de ahi en mas)." -ForegroundColor Green
Write-Host "[ICS] SharedAccess → Automatic (Delayed Start)." -ForegroundColor Green
Write-Host ""
Write-Host "Probar ahora:" -ForegroundColor DarkGray
Write-Host "  .\Ensure-Ics.ps1" -ForegroundColor DarkGray
Write-Host "  Get-ScheduledTask -TaskName $TaskName" -ForegroundColor DarkGray
Write-Host "  Get-ScheduledTaskInfo -TaskName $TaskName   # ver LastRunTime/NextRunTime" -ForegroundColor DarkGray
