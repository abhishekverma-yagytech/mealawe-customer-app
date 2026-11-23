@echo off
rem Double-click or run from any folder. Creates mealawe-customer-source-<timestamp>.zip on your Desktop.
rem Options are passed through, e.g.:  zip-source.bat -OutDir D:\backups   or   zip-source.bat -IncludeGit
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0zip-source.ps1" %*
echo.
pause
