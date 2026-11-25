@echo off
title Blue Cranes - install print program
echo Setting up the Blue Cranes print program...
if not exist "C:\BlueCranes" mkdir "C:\BlueCranes"
copy /Y "%~dp0bc-print.ps1" "C:\BlueCranes\bc-print.ps1" >nul
copy /Y "%~dp0Print now.bat" "C:\BlueCranes\Print now.bat" >nul
copy /Y "%~dp0Switch on 6am print.bat" "C:\BlueCranes\Switch on 6am print.bat" >nul
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESK=%%D"
copy /Y "%~dp0Print now.bat" "%DESK%\Blue Cranes - Print now.bat" >nul
echo.
echo Done.
echo  - The program is in C:\BlueCranes
echo  - "Blue Cranes - Print now" is on the desktop
echo.
echo Nothing prints by itself yet. When the test print is right, run
echo "Switch on 6am print" in C:\BlueCranes.
pause
