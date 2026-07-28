# Keepalive for radio expansion jobs. Restarts walk + drain + deep batches if they die.
#   powershell -File scripts/run-radio-expansion-keepalive.ps1

$ErrorActionPreference = "Continue"
$AdminRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $AdminRoot

function Test-RadioJob([string]$Pattern) {
  $hit = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -and ($_.CommandLine -match $Pattern)
  }
  return [bool]$hit
}

function Start-LoggedJob([string]$Name, [string]$Command, [string]$LogFile) {
  Write-Host "$(Get-Date -Format o) START $Name"
  Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList @(
    "/c",
    "cd /d `"$AdminRoot`" && $Command >> `"$LogFile`" 2>&1"
  ) | Out-Null
}

Write-Host "Radio expansion keepalive in $AdminRoot"

while ($true) {
  if (-not (Test-RadioJob "run-radio-rb-full-walk-import.ts --execute --target 15000")) {
    Start-LoggedJob "walk-name" `
      "npx tsx scripts/run-radio-rb-full-walk-import.ts --execute --target 15000 --page-size 100 --max-pages 2000 --order name --reverse false --checkpoint default" `
      "data/radio-rb-full-walk-run.log"
  }

  if (-not (Test-RadioJob "checkpoint votes-asc")) {
    Start-LoggedJob "walk-votes-asc" `
      "npx tsx scripts/run-radio-rb-full-walk-import.ts --execute --target 8000 --page-size 100 --max-pages 1500 --order votes --reverse false --checkpoint votes-asc" `
      "data/radio-rb-full-walk-votes-asc-run.log"
  }

  if (-not (Test-RadioJob "checkpoint lastcheck-desc")) {
    Start-LoggedJob "walk-lastcheck" `
      "npx tsx scripts/run-radio-rb-full-walk-import.ts --execute --target 8000 --page-size 100 --max-pages 1500 --order lastchecktime --reverse true --checkpoint lastcheck-desc" `
      "data/radio-rb-full-walk-lastcheck-desc-run.log"
  }

  if (-not (Test-RadioJob "verify-drain")) {
    Start-LoggedJob "verify-drain" `
      "set RADIO_VERIFY_CONCURRENCY=5&& set RADIO_VERIFY_TIMEOUT_MS=7000&& npx tsx scripts/run-radio-verify-drain.ts --execute --chunk 60 --max-chunks 500" `
      "data/radio-verify-drain-keepalive.log"
  }

  if (-not (Test-RadioJob "batch19")) {
    Start-LoggedJob "batch19" `
      "set RADIO_BATCH_EMPTY_STREAK=25&& set RADIO_BATCH_DELAY_MS=600&& npx tsx scripts/run-radio-general-batch19.ts --execute --target 10000 --max-pages 15000" `
      "data/radio-general-batch19-run.log"
  }

  if (-not (Test-RadioJob "icecast-status-harvest")) {
    Start-LoggedJob "icecast-harvest" `
      "npx tsx scripts/run-radio-icecast-status-harvest.ts --execute --limit 1200" `
      "data/radio-icecast-status-harvest.log"
  }

  if (-not (Test-RadioJob "homepage-playlist-harvest")) {
    Start-LoggedJob "homepage-harvest" `
      "npx tsx scripts/run-radio-homepage-playlist-harvest.ts --execute --limit 2500" `
      "data/radio-homepage-playlist-harvest.log"
  }

  Start-Sleep -Seconds 180
}
