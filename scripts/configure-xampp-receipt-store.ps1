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
}
foreach ($entry in $settings.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'User')
  Set-Item -Path ("Env:" + $entry.Key) -Value $entry.Value
}
Remove-Item Env:CIEAV_MYSQL_PASSWORD -ErrorAction SilentlyContinue
[Environment]::SetEnvironmentVariable('CIEAV_MYSQL_PASSWORD', $null, 'User')

Write-Host 'CIEAV XAMPP receipt-store settings persisted for the current Windows user.'
Write-Host "Store: xampp-mysql - ${HostName}:$Port/$Database - user=$User - password=[BLANK]"

& node scripts/xampp-mysql-bootstrap.mjs
if ($LASTEXITCODE -ne 0) { throw "XAMPP MariaDB bootstrap failed with exit code $LASTEXITCODE" }

if ($InstallGateway -or $RestartGateway) {
  Write-Host 'Building the CIEAV API before Gateway lifecycle mutation...'
  & npm.cmd run build:api
  if ($LASTEXITCODE -ne 0) { throw "CIEAV API build failed with exit code $LASTEXITCODE" }

  $python = (Get-Command python -ErrorAction Stop).Source
  if ($InstallGateway) {
    & $python -m cieav_platform gateway install
    if ($LASTEXITCODE -ne 0) { throw 'Unable to install the CIEAV Gateway.' }
    Write-Host 'CIEAV Gateway installed and started with the XAMPP receipt-store environment.'
  } else {
    & $python -m cieav_platform gateway restart
    if ($LASTEXITCODE -ne 0) { throw 'Unable to restart the installed CIEAV Gateway. It may not be installed; rerun this helper with -InstallGateway.' }
    Write-Host 'CIEAV Gateway restarted with the XAMPP receipt-store environment.'
  }
}

Write-Host 'CIEAV XAMPP RECEIPT STORE: CONFIGURED'
