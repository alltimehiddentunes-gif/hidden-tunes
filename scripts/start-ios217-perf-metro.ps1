$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$listener = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  $ownerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener[0].OwningProcess)"
  throw "Port 8081 is already in use by PID $($listener[0].OwningProcess): $($ownerProcess.CommandLine)"
}
Set-Location -LiteralPath $workspace
$env:EAS_BUILD_PROFILE = 'ios217PerfDiagnostic'
$env:HT_IOS217_PERF_DEVCLIENT = '1'
$env:EXPO_PUBLIC_BUILD_PROFILE = 'production'
Remove-Item Env:EXPO_PUBLIC_METRO_HARNESS -ErrorAction SilentlyContinue
Remove-Item Env:EXPO_PUBLIC_IOS217_DIAGNOSTIC -ErrorAction SilentlyContinue
Write-Host "Hidden Tunes 217 Metro root: $workspace"
Write-Host 'Port: 8081; production-mode JS; internal development client only.'
& npx expo start --dev-client --no-dev --minify --lan --port 8081
