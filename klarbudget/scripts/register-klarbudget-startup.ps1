$ErrorActionPreference = 'Continue'

$AppDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ServerScript = Join-Path $AppDir 'scripts\start-klarbudget-server.ps1'
$TaskName = 'KlarBudget Local Server'
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ServerScript`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

try {
  Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description 'Starts the KlarBudget local preview server at Windows logon.' -Force -ErrorAction Stop | Out-Null
  Write-Host "Registered scheduled task: $TaskName"
} catch {
  $StartupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
  $ShortcutPath = Join-Path $StartupDir 'KlarBudget Local Server.lnk'
  New-Item -ItemType Directory -Force -Path $StartupDir | Out-Null

  $Shell = New-Object -ComObject WScript.Shell
  $Shortcut = $Shell.CreateShortcut($ShortcutPath)
  $Shortcut.TargetPath = $PowerShell
  $Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ServerScript`""
  $Shortcut.WorkingDirectory = $AppDir
  $Shortcut.WindowStyle = 7
  $Shortcut.Description = 'Starts the KlarBudget local preview server at Windows logon.'
  $Shortcut.Save()

  Write-Host "Scheduled task failed, created Startup shortcut instead: $ShortcutPath"
}

Write-Host "Server script: $ServerScript"
