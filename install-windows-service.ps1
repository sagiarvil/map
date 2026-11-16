$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$pyExe = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$appPy = Join-Path $PSScriptRoot "app.py"
if (-not (Test-Path -LiteralPath $pyExe)) {
  & (Join-Path $PSScriptRoot "setup-windows.ps1") --no-browser
}

$taskName = "LeadIntelligenceProDaemon"
$action = New-ScheduledTaskAction -Execute $pyExe -Argument "`"$appPy`" --port 8765 --workers 128 --no-browser" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Lead Intelligence Pro servisi aktif: http://127.0.0.1:8765"
