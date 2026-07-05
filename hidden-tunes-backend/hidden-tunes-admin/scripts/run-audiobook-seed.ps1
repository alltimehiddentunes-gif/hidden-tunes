Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$adminRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $adminRoot

Write-Host "Running audiobook seed ingestion with Windows npm from: $adminRoot"

& npm.cmd run audiobook:seed-ingest -- --limit 40 --categories fiction,classics,biography
exit $LASTEXITCODE
