@echo off
rem  Wrapper: real logic lives in sync-upstream.ps1
rem  usage: sync-upstream.bat [v1.9.3]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-upstream.ps1" %*
if errorlevel 1 pause
exit /b 0
