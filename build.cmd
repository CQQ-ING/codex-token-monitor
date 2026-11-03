@echo off
cd /d "%~dp0"
dotnet publish src\CodexStatusbar\CodexStatusbar.csproj -c Release -r win-x64 --self-contained true -o dist
pause
