$ErrorActionPreference = "Continue"
$adminRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $adminRoot
$logDir = Join-Path $adminRoot "data\lecture-expansion"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$supervisorLog = Join-Path $logDir "supervisor-2026-07-17.log"

function Write-Sup([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date).ToString("o"), $msg
  Add-Content -Path $supervisorLog -Value $line
  Write-Host $line
}

function Get-TargetMet {
  try {
    $statePath = Join-Path $logDir "state.json"
    if (-not (Test-Path $statePath)) { return $false }
    $state = Get-Content $statePath -Raw | ConvertFrom-Json
    $summary = $state.last_batch_summary
    if (-not $summary) { return $false }
    return ([int]$summary.gap_programs -le 0 -and [int]$summary.gap_playable_items -le 0)
  } catch {
    return $false
  }
}

$round = 0
while ($true) {
  if (Get-TargetMet) {
    Write-Sup "TARGET MET - supervisor exiting"
    break
  }
  $round += 1
  $logFile = Join-Path $logDir ("expand-seq-round-{0}.log" -f $round)
  Write-Sup ("Starting expansion round {0} -> {1}" -f $round, $logFile)

  $args = @(
    "tsx",
    "scripts/run-lectures-expand.ts",
    "--resume",
    "--all-sources",
    "--batch-size=250",
    "--concurrency=20",
    "--parallel=1",
    "--max-batches=50"
  )

  $p = Start-Process -FilePath "cmd.exe" -ArgumentList (@("/c", "npx") + $args) -WorkingDirectory $adminRoot -RedirectStandardOutput $logFile -RedirectStandardError $logFile -PassThru -NoNewWindow -Wait
  Write-Sup ("Round {0} exited code={1}" -f $round, $p.ExitCode)

  if (Get-TargetMet) {
    Write-Sup ("TARGET MET after round {0}" -f $round)
    break
  }
  Start-Sleep -Seconds 5
}
