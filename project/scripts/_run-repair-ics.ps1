$LogFile = Join-Path $PSScriptRoot "ics-repair-log.txt"
"START $(Get-Date)" | Out-File $LogFile
try {
  & (Join-Path $PSScriptRoot "Repair-Ics.ps1")
  "END OK $(Get-Date)" | Out-File $LogFile -Append
} catch {
  "END ERR: $($_.Exception.Message)" | Out-File $LogFile -Append
  "END ERR: $($_.ScriptStackTrace)" | Out-File $LogFile -Append
}
