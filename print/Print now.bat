@echo off
title Blue Cranes - print now
echo Printing the Blue Cranes files in Downloads...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\BlueCranes\bc-print.ps1" -NoChrome
echo.
echo Finished. The log is in C:\BlueCranes\Logs
pause
