$ErrorActionPreference = "Continue"
$adminRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $adminRoot
$logDir = Join-Path $adminRoot "data\lecture-expansion"
$supervisorLog = Join-Path $logDir "broad-supervisor.log"

function Write-Sup([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date).ToString("o"), $msg
  Add-Content -Path $supervisorLog -Value $line
  Write-Host $line
}

function Get-TargetMet {
  try {
    $out = & npx tsx scripts/run-lectures-expand-status.ts 2>$null | Out-String
    if ($out -match '"gap_programs":\s*0' -and $out -match '"gap_playable_items":\s*0') { return $true }
    if ($out -match '"target_met":\s*true') { return $true }
    return $false
  } catch { return $false }
}

function Get-ImporterRunning {
  $procs = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'run-lecture-playable-import' })
  return $procs.Count -gt 0
}

$round = 0
while ($true) {
  if (Get-TargetMet) {
    Write-Sup "TARGET MET - exiting"
    break
  }
  if (-not (Get-ImporterRunning)) {
    $round += 1
    $logFile = Join-Path $logDir ("expand-broad-sup-{0}.log" -f $round)
    Write-Sup ("Starting broad sweep round {0}" -f $round)
    Start-Process -FilePath "cmd.exe" -ArgumentList @(
      "/c",
      "npx tsx scripts/run-lecture-playable-import.ts --apply-writes --resume --target-items=25000 --source-limit=200 --max-pages=20 --rounds=50 --probe-concurrency=16 --metadata-concurrency=14 --request-timeout-ms=45000 --pause-ms=50 --insert-batch-size=50 --source-families=internet_archive_public_domain --subject-families=`"broad educational sweep`" 1> `"$logFile`" 2>&1"
    ) -WorkingDirectory $adminRoot -WindowStyle Hidden | Out-Null
  }
  Start-Sleep -Seconds 120
}
