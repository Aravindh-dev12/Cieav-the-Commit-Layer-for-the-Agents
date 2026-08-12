param(
  [string]$Channel = "stable",
  [string]$BaseUrl = $env:LATCH_DOWNLOAD_BASE_URL,
  [switch]$NoService
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Fail([string]$Message) {
  Write-Error "LATCH install failed: $Message"
  exit 1
}

function Get-PlatformKey {
  $os = if ($IsWindows) { "windows" } elseif ($IsMacOS) { "macos" } elseif ($IsLinux) { "linux" } else { Fail "unsupported operating system" }
  $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
  $arch = switch ($arch) {
    "x64" { "x64" }
    "arm64" { "arm64" }
    default { Fail "unsupported architecture: $arch" }
  }
  return "$os-$arch"
}

function Get-InstallRoot {
  if ($IsWindows) {
    if ($env:LOCALAPPDATA) { return (Join-Path $env:LOCALAPPDATA "LATCH") }
    return (Join-Path $HOME "AppData\Local\LATCH")
  }
  return (Join-Path $HOME ".local/share/latch")
}

function Get-BinRoot([string]$InstallRoot) {
  if ($IsWindows) { return (Join-Path $InstallRoot "bin") }
  return (Join-Path $HOME ".local/bin")
}

if (-not $BaseUrl) {
  Fail "no official download endpoint configured. Pass -BaseUrl or set LATCH_DOWNLOAD_BASE_URL."
}
$BaseUrl = $BaseUrl.TrimEnd('/')
if ($BaseUrl -notmatch '^https://') { Fail "the download endpoint must use HTTPS" }

$platform = Get-PlatformKey
$installRoot = Get-InstallRoot
$binRoot = Get-BinRoot $installRoot
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("latch-install-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
  $manifestUrl = "$BaseUrl/$Channel/manifest.json"
  $manifestPath = Join-Path $tempRoot "manifest.json"
  Write-Host "LATCH · fetching release manifest"
  Invoke-WebRequest -Uri $manifestUrl -OutFile $manifestPath -UseBasicParsing
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

  if (-not $manifest.version) { Fail "release manifest has no version" }
  if (-not $manifest.cloudUrl -or ([string]$manifest.cloudUrl) -notmatch '^https://') { Fail "release manifest has no valid HTTPS Cloud Intelligence URL" }
  if (-not $manifest.artifacts) { Fail "release manifest has no artifacts" }
  $artifact = $manifest.artifacts.$platform
  if (-not $artifact) { Fail "no LATCH runtime published for $platform" }
  if (-not $artifact.url -or -not $artifact.sha256) { Fail "artifact metadata is incomplete" }

  $artifactUrl = if ($artifact.url -match '^https://') { $artifact.url } else { "$BaseUrl/$($artifact.url.TrimStart('/'))" }
  if ($artifactUrl -notmatch '^https://') { Fail "runtime artifacts must be downloaded over HTTPS" }

  $archive = Join-Path $tempRoot "latch-runtime.zip"
  Write-Host "LATCH · downloading $($manifest.version) for $platform"
  Invoke-WebRequest -Uri $artifactUrl -OutFile $archive -UseBasicParsing

  $actual = (Get-FileHash -Algorithm SHA256 -Path $archive).Hash.ToLowerInvariant()
  $expected = ([string]$artifact.sha256).ToLowerInvariant()
  if ($actual -ne $expected) {
    Fail "runtime checksum mismatch; expected $expected but received $actual"
  }
  Write-Host "LATCH · checksum verified"

  $staging = Join-Path $tempRoot "runtime"
  Expand-Archive -Path $archive -DestinationPath $staging -Force
  $payload = Join-Path $staging "latch-runtime"
  if (-not (Test-Path $payload)) { Fail "runtime archive is missing latch-runtime/" }

  if (Test-Path $installRoot) {
    $backup = "$installRoot.previous"
    if (Test-Path $backup) { Remove-Item -Recurse -Force $backup }
    Move-Item -Path $installRoot -Destination $backup
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $installRoot -Parent) | Out-Null
  Move-Item -Path $payload -Destination $installRoot

  New-Item -ItemType Directory -Force -Path $binRoot | Out-Null
  $runtimeLatch = if ($IsWindows) { Join-Path $installRoot "bin/latch.exe" } else { Join-Path $installRoot "bin/latch" }
  $runtimeNode = if ($IsWindows) { Join-Path $installRoot "runtime/node.exe" } else { Join-Path $installRoot "runtime/node" }
  if (-not (Test-Path $runtimeLatch)) { Fail "installed runtime does not contain the LATCH executable" }
  if (-not (Test-Path $runtimeNode)) { Fail "installed runtime does not contain the bundled Node runtime" }

  if ($IsWindows) {
    $shim = Join-Path $binRoot "latch.cmd"
    $cmd = "@echo off`r`n`"$runtimeLatch`" %*`r`n"
    Set-Content -Path $shim -Encoding ASCII -Value $cmd
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $parts = @($userPath -split ';' | Where-Object { $_ })
    if ($parts -notcontains $binRoot) {
      [Environment]::SetEnvironmentVariable("Path", (($parts + $binRoot) -join ';'), "User")
    }
    $env:Path = "$(Join-Path $installRoot 'runtime');$binRoot;$env:Path"
  } else {
    $shim = Join-Path $binRoot "latch"
    $script = "#!/bin/sh`nexec `"$runtimeLatch`" `"`$@`"`n"
    Set-Content -Path $shim -Encoding UTF8 -NoNewline -Value $script
    & chmod 0755 $runtimeLatch $runtimeNode $shim
    $env:PATH = "$(Join-Path $installRoot 'runtime'):$binRoot:$env:PATH"
  }

  $env:LATCH_HOME = $installRoot
  $env:LATCH_CLOUD_URL = [string]$manifest.cloudUrl
  $env:LATCH_VERSION = [string]$manifest.version

  Write-Host "LATCH · running runtime self-check"
  & $runtimeLatch doctor
  if ($LASTEXITCODE -ne 0) { Fail "runtime self-check failed" }

  Write-Host "LATCH · enrolling with Cloud Intelligence"
  & $runtimeLatch cloud enroll
  if ($LASTEXITCODE -ne 0) { Fail "Cloud Intelligence enrollment failed" }

  Write-Host "LATCH · running cloud safety probe"
  & $runtimeLatch cloud probe
  if ($LASTEXITCODE -ne 0) { Fail "Cloud Intelligence safety probe failed" }

  if (-not $NoService) {
    Write-Host "LATCH · installing always-on Gateway"
    & $runtimeLatch gateway install
    if ($LASTEXITCODE -ne 0) { Fail "Gateway service installation failed" }
  }

  Write-Host ""
  Write-Host "LATCH installed successfully."
  Write-Host "Version: $($manifest.version)"
  Write-Host "Runtime: $installRoot"
  Write-Host "Privacy: durable user state remains local"
  Write-Host ""
  Write-Host "Run: latch gateway status"
  Write-Host "Run: latch cloud status"
  Write-Host "Run: latch test-lab"
}
finally {
  if (Test-Path $tempRoot) { Remove-Item -Recurse -Force $tempRoot -ErrorAction SilentlyContinue }
}
