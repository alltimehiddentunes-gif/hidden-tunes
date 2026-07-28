# Continuous deep-source overnight pass (junguler M3U + Radio Garden + RB deep).
# Prefer Europe blocked markets first, then remaining continents country-by-country.

$ErrorActionPreference = "Continue"
$adminRoot = Split-Path -Parent $PSScriptRoot
Set-Location $adminRoot

$logDir = Join-Path $adminRoot "data\radio-40k-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "worldwide-deep-overnight.log"
$heartbeat = Join-Path $adminRoot "data\radio-worldwide-deep-heartbeat.json"

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date).ToString("o"), $msg
  Add-Content -Path $logFile -Value $line -Encoding utf8
  Write-Host $line
}

$continents = @("europe", "north_america", "south_america", "asia", "oceania", "antarctica")
Write-Log "WORLDWIDE_DEEP_START"

while ($true) {
  $didWork = $false
  $allExhausted = $true
  foreach ($continent in $continents) {
    Write-Log "WORLDWIDE_DEEP_TICK continent=$continent"
    $args = @(
      "scripts/run-radio-continent-deep-sources.ts",
      "--continent", $continent,
      "--max-countries", "1",
      "--execute"
    )
    if ($continent -eq "europe") {
      $args += "--blocked-first"
    } else {
      $args += "--thin-first"
    }

    $started = Get-Date
    & node (Join-Path $adminRoot "node_modules\tsx\dist\cli.mjs") @args 2>&1 |
      Tee-Object -FilePath $logFile -Append
    $exit = $LASTEXITCODE
    $elapsed = ((Get-Date) - $started).TotalMinutes
    Write-Log "WORLDWIDE_DEEP_COUNTRY_DONE continent=$continent exit=$exit elapsed_min=$([math]::Round($elapsed,2))"

    @{
      updated_at = (Get-Date).ToString("o")
      continent = $continent
      last_exit = $exit
      last_elapsed_min = [math]::Round($elapsed, 2)
      log = $logFile
    } | ConvertTo-Json | Set-Content -Path $heartbeat -Encoding utf8

    if ($exit -eq 2) {
      # Continent exhausted — advance to next continent.
      Write-Log "WORLDWIDE_DEEP_CONTINENT_EXHAUSTED continent=$continent"
      continue
    }

    $allExhausted = $false

    if ($exit -eq 0) {
      $didWork = $true
      # One successful country per outer loop keeps RB overnight from starving.
      break
    }

    # On crash/failure, stay on this continent and retry next country instead of
    # jumping ahead (e.g. Europe CY crash must not skip to North America).
    Write-Log "WORLDWIDE_DEEP_RETRY_SAME_CONTINENT continent=$continent exit=$exit"
    $didWork = $true
    Start-Sleep -Seconds 10
    break
  }

  if ($allExhausted -or -not $didWork) {
    Write-Log "WORLDWIDE_DEEP_IDLE no pending deep countries; sleeping 10m"
    Start-Sleep -Seconds 600
  } else {
    Start-Sleep -Seconds 5
  }
}
