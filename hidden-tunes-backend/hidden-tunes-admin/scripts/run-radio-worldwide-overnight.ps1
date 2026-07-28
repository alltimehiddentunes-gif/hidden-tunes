# Continuous overnight worldwide radio expansion.
# Processes one country at a time until all continents are exhausted.
# Resume-safe: skips completed countries via queue checkpoints.

$ErrorActionPreference = "Continue"
$adminRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $adminRoot "scripts\run-radio-worldwide-supervisor.ts"))) {
  $adminRoot = $PSScriptRoot
  if (-not (Test-Path (Join-Path $adminRoot "scripts\run-radio-worldwide-supervisor.ts"))) {
    $adminRoot = Get-Location
  }
}

Set-Location $adminRoot
$logDir = Join-Path $adminRoot "data\radio-40k-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "worldwide-overnight.log"
$heartbeat = Join-Path $adminRoot "data\radio-worldwide-overnight-heartbeat.json"

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date).ToString("o"), $msg
  Add-Content -Path $logFile -Value $line
  Write-Host $line
}

Write-Log "WORLDWIDE_OVERNIGHT_START root=$adminRoot"

$idleRounds = 0
while ($true) {
  Write-Log "WORLDWIDE_OVERNIGHT_TICK starting next country"
  $started = Get-Date
  & npx --yes tsx scripts/run-radio-worldwide-supervisor.ts --execute --max-countries 1 2>&1 |
    Tee-Object -FilePath $logFile -Append

  $exit = $LASTEXITCODE
  $elapsed = ((Get-Date) - $started).TotalMinutes
  Write-Log "WORLDWIDE_OVERNIGHT_COUNTRY_DONE exit=$exit elapsed_min=$([math]::Round($elapsed, 2))"

  # Refresh status
  $statusJson = & npx --yes tsx scripts/run-radio-worldwide-supervisor.ts --status 2>&1 |
    Out-String
  Add-Content -Path $logFile -Value $statusJson

  $pending = 0
  try {
    $master = Get-Content (Join-Path $adminRoot "data\radio-worldwide-master-report.json") -Raw | ConvertFrom-Json
    foreach ($c in $master.continents.PSObject.Properties) {
      $pending += [int]$c.Value.pending
      $pending += [int]$c.Value.in_progress
      $pending += [int]$c.Value.blocked
    }
  } catch {
    Write-Log "WORLDWIDE_OVERNIGHT_STATUS_PARSE_ERROR $_"
    $pending = 1
  }

  $hb = @{
    updated_at = (Get-Date).ToString("o")
    pending_approx = $pending
    last_exit = $exit
    last_elapsed_min = [math]::Round($elapsed, 2)
    log = $logFile
  } | ConvertTo-Json
  Set-Content -Path $heartbeat -Value $hb -Encoding utf8
  Write-Log "WORLDWIDE_OVERNIGHT_HEARTBEAT pending_approx=$pending"

  if ($pending -le 0) {
    Write-Log "WORLDWIDE_OVERNIGHT_COMPLETE all continents exhausted"
    Write-Host "AGENT_LOOP_WAKE_worldwide_radio {`"prompt`":`"Worldwide radio expansion complete. Read data/radio-worldwide-master-report.json and summarize final Imported/Repaired/Duplicate/Rejected/Quarantined totals. Stop overnight loop.`"}"
    break
  }

  if ($exit -ne 0) {
    $idleRounds += 1
    Write-Log "WORLDWIDE_OVERNIGHT_RETRY after failure idleRounds=$idleRounds"
    Start-Sleep -Seconds ([Math]::Min(120, 15 * $idleRounds))
  } else {
    $idleRounds = 0
    Start-Sleep -Seconds 3
  }
}
