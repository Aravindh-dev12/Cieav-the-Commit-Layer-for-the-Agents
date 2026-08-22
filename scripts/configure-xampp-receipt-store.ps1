param(
  [string]$PhpBin = 'C:\xampp\php\php.exe',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 3306,
  [string]$Database = 'cieav',
  [string]$User = 'root',
  [string]$Password = '',
  [switch]$InstallGateway,
  [switch]$RestartGateway
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'XAMPP receipt-store configuration is Windows-only.' }
if ($InstallGateway -and $RestartGateway) { throw 'Choose either -InstallGateway or -RestartGateway, not both.' }
if (-not (Test-Path -LiteralPath $PhpBin)) { throw "XAMPP PHP executable not found: $PhpBin" }
if ($HostName -notin @('127.0.0.1','localhost','::1')) { throw 'XAMPP receipt store must remain loopback-only.' }
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Invalid MySQL port.' }
if ($Database -notmatch '^[A-Za-z0-9_]{1,64}$') { throw 'Invalid MySQL database name.' }
if ($Password) { throw 'This developer helper refuses to persist a non-empty MySQL password. Use a dedicated local credential flow instead of storing DB passwords in user environment variables.' }

$settings = [ordered]@{
  CIEAV_RECEIPT_STORE = 'xampp-mysql'
  CIEAV_PHP_BIN = (Resolve-Path -LiteralPath $PhpBin).Path
  CIEAV_MYSQL_HOST = $HostName
  CIEAV_MYSQL_PORT = [string]$Port
  CIEAV_MYSQL_DATABASE = $Database
  CIEAV_MYSQL_USER = $User
  CIEAV_UI_MODE = 'notification-only'
  CIEAV_HEADLESS = '1'
  CIEAV_START_URL = 'about:blank'
  CIEAV_NOTIFICATIONS = '1'
}
foreach ($entry in $settings.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'User')
  Set-Item -Path ("Env:" + $entry.Key) -Value $entry.Value
}
Remove-Item Env:CIEAV_MYSQL_PASSWORD -ErrorAction SilentlyContinue
[Environment]::SetEnvironmentVariable('CIEAV_MYSQL_PASSWORD', $null, 'User')

Write-Host 'CIEAV local settings persisted for the current Windows user.'
Write-Host "Store: xampp-mysql - ${HostName}:$Port/$Database - user=$User - password=[BLANK]"
Write-Host 'Interaction: notification-only - protected Chromium runs headlessly - native request-bound approval is used when available.'

& node scripts/xampp-mysql-bootstrap.mjs
if ($LASTEXITCODE -ne 0) { throw "XAMPP MariaDB bootstrap failed with exit code $LASTEXITCODE" }

if ($InstallGateway -or $RestartGateway) {
  Write-Host 'Building the CIEAV API before Gateway lifecycle mutation...'
  & npm.cmd run build:api
  if ($LASTEXITCODE -ne 0) { throw "CIEAV API build failed with exit code $LASTEXITCODE" }

  $stateDir = if ($env:CIEAV_STATE_DIR) { $env:CIEAV_STATE_DIR } else { Join-Path $env:USERPROFILE '.cieav' }
  $nativeDir = Join-Path $stateDir 'native'
  New-Item -ItemType Directory -Force -Path $nativeDir | Out-Null

  $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'native\windows\cdp-win-bridge.cpp').Hash.ToLowerInvariant().Substring(0,16)
  $bridge = Join-Path $nativeDir ("cdp-win-bridge-$sourceHash.exe")
  if (-not (Test-Path -LiteralPath $bridge)) {
    Write-Host "Building versioned Windows private CDP bridge: $sourceHash"
    & node scripts/build-windows-cdp-bridge.mjs "--output=$bridge"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $bridge)) { throw 'Windows private CDP bridge build failed.' }
  } else {
    Write-Host "Reusing versioned Windows private CDP bridge: $sourceHash"
  }
  $bridge = (Resolve-Path -LiteralPath $bridge).Path
  [Environment]::SetEnvironmentVariable('CIEAV_CDP_WIN_BRIDGE', $bridge, 'User')
  $env:CIEAV_CDP_WIN_BRIDGE = $bridge
  Write-Host "Private CDP bridge: $bridge"

  Write-Host 'Building or reusing the request-bound Windows native approval host...'
  $approvalBuild = @(& node scripts/build-windows-native-approval.mjs "--native-dir=$nativeDir")
  if ($LASTEXITCODE -ne 0 -or $approvalBuild.Count -lt 1) { throw 'Windows native approval host build failed.' }
  foreach ($line in $approvalBuild) { Write-Host $line }
  try { $approvalResult = $approvalBuild[-1] | ConvertFrom-Json } catch { throw 'Windows native approval host builder did not return a valid result.' }
  if (-not $approvalResult.ok -or -not (Test-Path -LiteralPath $approvalResult.exe)) { throw 'Windows native approval host executable was not produced.' }
  $approvalHelper = (Resolve-Path -LiteralPath $approvalResult.exe).Path
  [Environment]::SetEnvironmentVariable('CIEAV_NATIVE_APPROVAL_HELPER', $approvalHelper, 'User')
  $env:CIEAV_NATIVE_APPROVAL_HELPER = $approvalHelper
  Write-Host "Native approval host: $approvalHelper"

  $python = (Get-Command python -ErrorAction Stop).Source
  if ($InstallGateway) {
    & $python -m cieav_platform gateway install
    if ($LASTEXITCODE -ne 0) { throw 'Unable to install the CIEAV Gateway.' }
    Write-Host 'CIEAV Gateway installed and started in notification-only mode.'
  } else {
    & $python -m cieav_platform gateway restart
    if ($LASTEXITCODE -ne 0) { throw 'Unable to restart the installed CIEAV Gateway. It may not be installed; rerun this helper with -InstallGateway.' }
    Write-Host 'CIEAV Gateway restarted in notification-only mode.'
  }
}

Write-Host 'CIEAV BACKGROUND COMMIT SERVICE: CONFIGURED'
