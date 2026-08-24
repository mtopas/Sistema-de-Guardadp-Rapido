## Instala tarea programada que rearma ICS al arranque de Windows.
## Requiere PowerShell elevado (Administrador).
##
##   .\Install-IcsWatchdog.ps1

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

# Al arranque, con delay para que los NICs estén up
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Trigger.Delay = "PT45S"

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
    -Trigger $Trigger `
    -Principal $Principal `
    -Settings $Settings `
    -Force | Out-Null

# También dejar SharedAccess en Automatic Delayed
Set-Service -Name SharedAccess -StartupType Automatic
$reg = "HKLM:\SYSTEM\CurrentControlSet\Services\SharedAccess"
New-ItemProperty -Path $reg -Name DelayedAutostart -PropertyType DWORD -Value 1 -Force | Out-Null

Write-Host "[ICS] Tarea '$TaskName' instalada (AtStartup +45s)." -ForegroundColor Green
Write-Host "[ICS] SharedAccess → Automatic (Delayed Start)." -ForegroundColor Green
Write-Host ""
Write-Host "Probar ahora:" -ForegroundColor DarkGray
Write-Host "  .\Ensure-Ics.ps1" -ForegroundColor DarkGray
Write-Host "  Get-ScheduledTask -TaskName $TaskName" -ForegroundColor DarkGray
