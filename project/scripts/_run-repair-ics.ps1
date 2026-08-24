"START $(Get-Date)" | Out-File "D:\Sistema-de-Guardadp-Rapido\project\scripts\ics-repair-log.txt"
try {
  & "D:\Sistema-de-Guardadp-Rapido\project\scripts\Repair-Ics.ps1"
  "END OK $(Get-Date)" | Out-File "D:\Sistema-de-Guardadp-Rapido\project\scripts\ics-repair-log.txt" -Append
} catch {
  "END ERR: $($_.Exception.Message)" | Out-File "D:\Sistema-de-Guardadp-Rapido\project\scripts\ics-repair-log.txt" -Append
  "END ERR: $($_.ScriptStackTrace)" | Out-File "D:\Sistema-de-Guardadp-Rapido\project\scripts\ics-repair-log.txt" -Append
}
