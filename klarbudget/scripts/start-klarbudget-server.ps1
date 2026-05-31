$ErrorActionPreference = 'Continue'

$AppDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogDir = Join-Path $AppDir 'logs'
$LogFile = Join-Path $LogDir 'klarbudget-server.log'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $AppDir

function Write-ServerLog {
  param([string]$Message)
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $LogFile -Value "[$timestamp] $Message"
}

Write-ServerLog 'KlarBudget server watcher started.'

while ($true) {
  try {
    Write-ServerLog 'Starting KlarBudget preview server on 0.0.0.0:5174.'
    $process = Start-Process -FilePath 'npm.cmd' `
      -ArgumentList @('run', 'preview', '--', '--host', '0.0.0.0', '--port', '5174') `
      -WorkingDirectory $AppDir `
      -WindowStyle Hidden `
      -PassThru

    Wait-Process -Id $process.Id
    Write-ServerLog "Server stopped with process id $($process.Id). Restarting in 5 seconds."
  } catch {
    Write-ServerLog "Server error: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds 5
}
