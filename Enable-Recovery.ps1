$ErrorActionPreference = 'Stop'
$guardPath = Join-Path $PSScriptRoot 'Ensure-Monitor.ps1'
if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'CodexStatusbar.exe'))) { throw '请先将编译后的 CodexStatusbar.exe 放在此目录。' }
$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wscript.exe" -Argument ('//B //NoLogo "' + (Join-Path $PSScriptRoot 'Run-Recovery.vbs') + '"')
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'CodexTokenMonitor-Recovery' -Action $action -Trigger $trigger -Settings $settings -Description 'Recover the existing Token monitor while Codex runs.' -Force | Out-Null
Write-Host '已开启每分钟自动恢复。请保留本文件夹位置，移动后重新运行此脚本。'
