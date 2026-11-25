@echo off
title Blue Cranes - switch on the 6am print run
schtasks /Create /F /TN "Blue Cranes 6am print run" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 05:55 /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File C:\BlueCranes\bc-print.ps1"
echo.
echo The print run now starts every weekday at 05:55.
echo This computer must be on and signed in. To stop it: open Task Scheduler
echo and disable "Blue Cranes 6am print run".
pause
