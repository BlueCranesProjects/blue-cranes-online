# Blue Cranes - morning print run
# Prints the files that Admin > Print run saves in Downloads:
#   ..._1-WHITE.pdf  reports, inventory, time card  -> normal paper
#   ..._2-BLUE.pdf   certificates                    -> blue paper
# Printed files move to C:\BlueCranes\Printed\<date>, failed ones to C:\BlueCranes\Failed.
# The log of each day is in C:\BlueCranes\Logs.
param([switch]$NoChrome)

# ---------------- settings: change these, then save ----------------
$Printer     = 'Groot printer'   # exactly as in Windows Settings > Printers & scanners
$WhiteTray   = ''                # e.g. 'Tray 1'. Empty = the printer's normal tray
$BlueTray    = ''                # e.g. 'Tray 2'. Fill in after the blue paper test
$AdminUrl    = 'https://bluecranesprojects.github.io/blue-cranes-online/admin/?printrun=auto'
$ChromeProfile = ''              # Chrome profile folder if Admin is signed in on another profile, e.g. 'Profile 1'
$WaitMinutes = 15                # how long to wait for Admin to make the files
# -------------------------------------------------------------------

$Base = 'C:\BlueCranes'
$Day = Get-Date -Format 'yyyy-MM-dd'
New-Item -ItemType Directory -Force -Path "$Base\Logs", "$Base\Printed\$Day", "$Base\Failed" | Out-Null
Start-Transcript -Path "$Base\Logs\$Day.txt" -Append | Out-Null
try {
  $Sumatra = @("$env:LOCALAPPDATA\SumatraPDF\SumatraPDF.exe", "$env:ProgramFiles\SumatraPDF\SumatraPDF.exe", "${env:ProgramFiles(x86)}\SumatraPDF\SumatraPDF.exe", "$Base\SumatraPDF.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $Sumatra) { throw 'SumatraPDF is not installed. Install it from sumatrapdfreader.org, or put SumatraPDF.exe in C:\BlueCranes.' }
  $Downloads = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path
  Write-Host "Printer: $Printer   Downloads: $Downloads"
  $Start = Get-Date

  if (-not $NoChrome) {
    Write-Host 'Opening Admin > Print run in Chrome'
    $chromeArgs = @()
    if ($ChromeProfile) { $chromeArgs += "--profile-directory=`"$ChromeProfile`"" }
    $chromeArgs += $AdminUrl
    Start-Process 'chrome.exe' -ArgumentList $chromeArgs
    $deadline = $Start.AddMinutes($WaitMinutes)
    do {
      Start-Sleep -Seconds 10
      $done = Get-ChildItem -Path $Downloads -Filter 'BC-PRINT_DONE_*.txt' -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $Start.AddMinutes(-1) }
    } until ($done -or (Get-Date) -gt $deadline)
    if (-not $done) { Write-Host "Admin did not finish within $WaitMinutes minutes - printing what is there." }
    Start-Sleep -Seconds 5
  }

  $files = @(Get-ChildItem -Path $Downloads -Filter 'BC-PRINT_*.pdf' -ErrorAction SilentlyContinue | Sort-Object Name)
  if ($files.Count -eq 0) { Write-Host 'Nothing to print.' }
  foreach ($f in $files) {
    $blue = $f.Name -like '*-BLUE.pdf'
    $tray = if ($blue) { $BlueTray } else { $WhiteTray }
    $settings = 'noscale'
    if ($tray) { $settings += ",bin=$tray" }
    $where = if ($tray) { $tray } else { 'normal tray' }
    Write-Host ("Printing {0}  ->  {1}, {2}" -f $f.Name, $Printer, $where)
    $p = Start-Process -FilePath $Sumatra -Wait -PassThru -ArgumentList @(
      '-print-to', "`"$Printer`"", '-print-settings', "`"$settings`"", '-silent', '-exit-on-print', "`"$($f.FullName)`"")
    if ($p.ExitCode -eq 0) { Move-Item -Force -LiteralPath $f.FullName -Destination "$Base\Printed\$Day\" }
    else { Write-Host "  FAILED (code $($p.ExitCode)) - kept in $Base\Failed"; Move-Item -Force -LiteralPath $f.FullName -Destination "$Base\Failed\" }
  }
  Get-ChildItem -Path $Downloads -Filter 'BC-PRINT_DONE_*.txt' -ErrorAction SilentlyContinue |
    ForEach-Object { Move-Item -Force -LiteralPath $_.FullName -Destination "$Base\Printed\$Day\" }
  Write-Host 'Finished.'
}
catch { Write-Host "ERROR: $_" }
finally { Stop-Transcript | Out-Null }
