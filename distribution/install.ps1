param(
  [string]$Channel = $(if ($env:CIEAV_CHANNEL) { $env:CIEAV_CHANNEL } elseif ($env:LATCH_CHANNEL) { $env:LATCH_CHANNEL } else { "stable" }),
  [string]$BaseUrl = $(if ($env:CIEAV_DOWNLOAD_BASE_URL) { $env:CIEAV_DOWNLOAD_BASE_URL } elseif ($env:LATCH_DOWNLOAD_BASE_URL) { $env:LATCH_DOWNLOAD_BASE_URL } else { "__CIEAV_DOWNLOAD_BASE_URL__" }),
  [switch]$NoService
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
function Fail([string]$Message) { Write-Error "CIEAV install failed: $Message"; exit 1 }
function Get-PlatformKey {
  $os = if ($IsWindows) { "windows" } elseif ($IsMacOS) { "macos" } elseif ($IsLinux) { "linux" } else { Fail "unsupported operating system" }
  $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
  $arch = switch ($arch) { "x64" { "x64" }; "arm64" { "arm64" }; default { Fail "unsupported architecture: $arch" } }
  return "$os-$arch"
}
function Get-InstallRoot {
  if ($IsWindows) { if ($env:LOCALAPPDATA) { return (Join-Path $env:LOCALAPPDATA "CIEAV") }; return (Join-Path $HOME "AppData\Local\CIEAV") }
  return (Join-Path $HOME ".local/share/cieav")
}
function Get-BinRoot([string]$InstallRoot) { if ($IsWindows) { return (Join-Path $InstallRoot "bin") }; return (Join-Path $HOME ".local/bin") }

if (-not $BaseUrl -or $BaseUrl -eq "__CIEAV_DOWNLOAD_BASE_URL__") { Fail "installer was not rendered with an official download endpoint. Pass -BaseUrl or set CIEAV_DOWNLOAD_BASE_URL." }
$BaseUrl=$BaseUrl.TrimEnd('/'); if ($BaseUrl -notmatch '^https://') { Fail "the download endpoint must use HTTPS" }
$platform=Get-PlatformKey; $installRoot=Get-InstallRoot; $binRoot=Get-BinRoot $installRoot
$tempRoot=Join-Path ([System.IO.Path]::GetTempPath()) ("cieav-install-"+[guid]::NewGuid().ToString("N")); New-Item -ItemType Directory -Force -Path $tempRoot|Out-Null
try {
  $manifestUrl="$BaseUrl/$Channel/manifest.json"; $manifestPath=Join-Path $tempRoot "manifest.json"
  Write-Host "CIEAV · fetching release manifest"; Invoke-WebRequest -Uri $manifestUrl -OutFile $manifestPath -UseBasicParsing
  $manifest=Get-Content $manifestPath -Raw|ConvertFrom-Json
  if ($manifest.brand -and $manifest.brand -ne "CIEAV") { Fail "release manifest brand mismatch" }
  if (-not $manifest.version) { Fail "release manifest has no version" }
  if (-not $manifest.cloudUrl -or ([string]$manifest.cloudUrl) -notmatch '^https://') { Fail "release manifest has no valid HTTPS Cloud Intelligence URL" }
  $artifact=$manifest.artifacts.$platform; if (-not $artifact) { Fail "no CIEAV runtime published for $platform" }; if (-not $artifact.url -or -not $artifact.sha256) { Fail "artifact metadata is incomplete" }
  $artifactUrl=if ($artifact.url -match '^https://') { $artifact.url } else { "$BaseUrl/$($artifact.url.TrimStart('/'))" }; if ($artifactUrl -notmatch '^https://') { Fail "runtime artifacts must use HTTPS" }
  $archive=Join-Path $tempRoot "cieav-runtime.zip"; Write-Host "CIEAV · downloading $($manifest.version) for $platform"; Invoke-WebRequest -Uri $artifactUrl -OutFile $archive -UseBasicParsing
  $actual=(Get-FileHash -Algorithm SHA256 -Path $archive).Hash.ToLowerInvariant(); $expected=([string]$artifact.sha256).ToLowerInvariant(); if ($actual -ne $expected) { Fail "runtime checksum mismatch" }; Write-Host "CIEAV · checksum verified"
  $staging=Join-Path $tempRoot "runtime"; Expand-Archive -Path $archive -DestinationPath $staging -Force
  $payload=Join-Path $staging "cieav-runtime"; if (-not (Test-Path $payload)) { $payload=Join-Path $staging "latch-runtime" }; if (-not (Test-Path $payload)) { Fail "runtime archive is missing cieav-runtime/" }
  if (Test-Path $installRoot) { $backup="$installRoot.previous"; if (Test-Path $backup) { Remove-Item -Recurse -Force $backup }; Move-Item -Path $installRoot -Destination $backup }
  New-Item -ItemType Directory -Force -Path (Split-Path $installRoot -Parent)|Out-Null; Move-Item -Path $payload -Destination $installRoot; New-Item -ItemType Directory -Force -Path $binRoot|Out-Null
  $runtimeCieav=if ($IsWindows) { Join-Path $installRoot "bin/cieav.exe" } else { Join-Path $installRoot "bin/cieav" }
  if (-not (Test-Path $runtimeCieav)) { $legacy=if ($IsWindows) { Join-Path $installRoot "bin/latch.exe" } else { Join-Path $installRoot "bin/latch" }; if (Test-Path $legacy) { $runtimeCieav=$legacy } }
  $runtimeNode=if ($IsWindows) { Join-Path $installRoot "runtime/node.exe" } else { Join-Path $installRoot "runtime/node" }
  if (-not (Test-Path $runtimeCieav)) { Fail "installed runtime does not contain the CIEAV executable" }; if (-not (Test-Path $runtimeNode)) { Fail "installed runtime does not contain bundled Node" }
  if ($IsWindows) {
    Set-Content -Path (Join-Path $binRoot "cieav.cmd") -Encoding ASCII -Value "@echo off`r`n`"$runtimeCieav`" %*`r`n"
    Set-Content -Path (Join-Path $binRoot "latch.cmd") -Encoding ASCII -Value "@echo off`r`n`"$runtimeCieav`" %*`r`n"
    $userPath=[Environment]::GetEnvironmentVariable("Path","User"); $parts=@($userPath -split ';'|Where-Object { $_ }); if ($parts -notcontains $binRoot) { [Environment]::SetEnvironmentVariable("Path",(($parts+$binRoot)-join ';'),"User") }; $env:Path="$(Join-Path $installRoot 'runtime');$binRoot;$env:Path"
  } else {
    foreach ($name in @("cieav","latch")) { $shim=Join-Path $binRoot $name; $script="#!/bin/sh`nexec `"$runtimeCieav`" `"`$@`"`n"; Set-Content -Path $shim -Encoding UTF8 -NoNewline -Value $script; & chmod 0755 $shim }; & chmod 0755 $runtimeCieav $runtimeNode; $env:PATH="$(Join-Path $installRoot 'runtime'):$binRoot:$env:PATH"
  }
  $env:CIEAV_HOME=$installRoot; $env:CIEAV_CLOUD_URL=[string]$manifest.cloudUrl; $env:CIEAV_VERSION=[string]$manifest.version
  $env:LATCH_HOME=$installRoot; $env:LATCH_CLOUD_URL=[string]$manifest.cloudUrl; $env:LATCH_VERSION=[string]$manifest.version
  Write-Host "CIEAV · running runtime self-check"; & $runtimeCieav doctor; if ($LASTEXITCODE -ne 0) { Fail "runtime self-check failed" }
  Write-Host "CIEAV · enrolling with Cloud Intelligence"; & $runtimeCieav cloud enroll; if ($LASTEXITCODE -ne 0) { Fail "Cloud Intelligence enrollment failed" }
  Write-Host "CIEAV · running cloud safety probe"; & $runtimeCieav cloud probe; if ($LASTEXITCODE -ne 0) { Fail "Cloud Intelligence safety probe failed" }
  if (-not $NoService) { Write-Host "CIEAV · installing always-on Gateway"; & $runtimeCieav gateway install; if ($LASTEXITCODE -ne 0) { Fail "Gateway service installation failed" } }
  Write-Host ""; Write-Host "CIEAV installed successfully."; Write-Host "Version: $($manifest.version)"; Write-Host "Runtime: $installRoot"; Write-Host "Privacy: durable user state remains local"; Write-Host ""; Write-Host "Run: cieav gateway status"; Write-Host "Run: cieav cloud status"; Write-Host "Run: cieav test-lab"
}
finally { if (Test-Path $tempRoot) { Remove-Item -Recurse -Force $tempRoot -ErrorAction SilentlyContinue } }
