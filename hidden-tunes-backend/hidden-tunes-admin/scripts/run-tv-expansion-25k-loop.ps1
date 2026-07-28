# Auto-resume wrapper: runs short batches and restarts on crash until 25K or exhaustion.
# When wave 2 active sources exhaust, automatically builds and activates wave 3.
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot\..

$BatchesPerRun = 5
$PauseSeconds = 3

function Get-ActiveWave {
  $path = "data/tv-expansion-25k/active-wave.json"
  if (-not (Test-Path $path)) { return 2 }
  try {
    $payload = Get-Content $path -Raw | ConvertFrom-Json
    if ($payload.wave -eq 3) { return 3 }
  } catch {}
  return 2
}

function Test-ActiveSourcesExhausted($state) {
  $wave = Get-ActiveWave
  $weightMap = @{
    2 = @{
      "paratv-official" = 16
      "paratv-stream-manifests" = 14
      "independent-m3u-worldwave" = 8
      "iptv-org-unseen-worldwave" = 14
      "free-tv-world-countries" = 10
      "official-org-manifests" = 12
      "parliament-worldwave" = 8
      "public-europe-wave2" = 10
      "public-americas-wave2" = 8
      "public-asia-pacific-wave2" = 8
      "public-africa-middle-east-wave2" = 6
      "bloomberg-official" = 3
      "france-medias-official" = 3
      "cgtn-official" = 3
      "dw-official" = 3
      "redbull-official" = 2
      "youtube-official-worldwave" = 8
    }
    3 = @{
      "xumo-official-wave3" = 16
      "json-teles-community-wave3" = 10
      "country-official-manifests-wave3" = 14
      "parliament-government-wave3" = 8
      "university-education-wave3" = 6
      "youtube-official-wave3" = 14
      "iptv-org-api-residual-wave3" = 14
      "public-americas-wave3" = 8
      "public-europe-wave3" = 10
      "public-asia-pacific-wave3" = 8
      "public-africa-middle-east-wave3" = 6
    }
  }

  $weights = $weightMap[$wave]
  $active = @($weights.Keys | Where-Object {
    $id = $_
    $cursor = $state.sources.adapterCursors.$id
    if ($null -eq $cursor) { return $true }
    if ($cursor.exhausted -eq $true -or $cursor.status -eq "exhausted") { return $false }
    return $true
  })
  return ($active.Count -eq 0)
}

while ($true) {
  Write-Host "Starting expansion chunk ($BatchesPerRun batches)..."
  npx tsx scripts/run-tv-expansion-25k.ts --execute --max-batches $BatchesPerRun --continuous
  $code = $LASTEXITCODE

  $statePath = "data/tv-expansion-25k/state.json"
  if (Test-Path $statePath) {
    $state = Get-Content $statePath -Raw | ConvertFrom-Json
    if ($state.lastBatch.platformEligibleAfter -ge $state.target) {
      Write-Host "Target reached. Stopping."
      break
    }

    if (Test-ActiveSourcesExhausted $state) {
      if ((Get-ActiveWave) -eq 2) {
        Write-Host "Wave 2 exhausted at playable total $($state.lastBatch.platformEligibleAfter). Activating wave 3..."
        npx tsx scripts/activate-worldwave3.ts
        if ($LASTEXITCODE -ne 0) {
          Write-Host "Wave 3 activation failed. Stopping."
          break
        }
        Start-Sleep -Seconds $PauseSeconds
        continue
      }
      Write-Host "All wave 3 sources exhausted at playable total $($state.lastBatch.platformEligibleAfter). Stopping."
      break
    }
  }

  if ($code -eq 0) {
    Write-Host "Chunk finished cleanly. Continuing..."
  } else {
    Write-Host "Process exited ($code). Resuming from checkpoint in ${PauseSeconds}s..."
  }

  Start-Sleep -Seconds $PauseSeconds
}
