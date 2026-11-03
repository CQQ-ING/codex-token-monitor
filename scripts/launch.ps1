$ErrorActionPreference = 'Stop'
try {
    $package = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
    $codexExe = if ($package) { Join-Path $package.InstallLocation 'app\ChatGPT.exe' } else { $null }
    if (!$codexExe -or !(Test-Path -LiteralPath $codexExe)) {
        $codexExe = (Read-Host '未找到 Codex，请粘贴 Codex 桌面程序 ChatGPT.exe 的完整路径').Trim('"')
    }
    if (!(Test-Path -LiteralPath $codexExe -PathType Leaf)) { throw 'Codex 程序路径无效。' }
    $opened = Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
    if ($opened) {
        Write-Host '请先在 Codex 的“文件 → 退出”中完全退出，再重新运行本脚本。不会自动强制关闭你的程序。'
        Read-Host '按回车结束'
        exit
    }
    Start-Process -FilePath (Join-Path (Split-Path $PSScriptRoot -Parent) 'CodexStatusbar.exe') -ArgumentList '--page-tokens' -WindowStyle Hidden
    Start-Process -FilePath $codexExe -ArgumentList '--remote-debugging-address=127.0.0.1','--remote-debugging-port=9338'
    Write-Host '已启动。进入对话后稍等片刻，Token 按钮将自动出现。'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host '按回车结束'
}
