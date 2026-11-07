$ErrorActionPreference = 'Stop'
if (-not (Get-Process -Name ChatGPT -ErrorAction SilentlyContinue)) { exit }
$monitor = @(Get-Process -Name CodexStatusbar -ErrorAction SilentlyContinue)
$statusFile = Join-Path $env:LOCALAPPDATA 'CodexStatusbar\page-status.json'
if ($monitor.Count -gt 0) {
    $youngest = $monitor | Sort-Object StartTime -Descending | Select-Object -First 1
    if (([DateTime]::Now - $youngest.StartTime).TotalSeconds -lt 90) { exit }
    if ((Test-Path -LiteralPath $statusFile) -and (([DateTime]::UtcNow - (Get-Item -LiteralPath $statusFile).LastWriteTimeUtc).TotalSeconds -lt 90)) { exit }
    $monitor | Stop-Process -Force
    Start-Sleep -Seconds 2
}
Start-Process -FilePath (Join-Path $PSScriptRoot 'CodexStatusbar.exe') -ArgumentList '--background' -WindowStyle Hidden
