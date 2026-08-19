param(
  [string]$Channel = $(if ($env:CIEAV_CHANNEL) { $env:CIEAV_CHANNEL } elseif ($env:LATCH_CHANNEL) { $env:LATCH_CHANNEL } else { "stable" }),
  [string]$BaseUrl = $(if ($env:CIEAV_DOWNLOAD_BASE_URL) { $env:CIEAV_DOWNLOAD_BASE_URL } elseif ($env:LATCH_DOWNLOAD_BASE_URL) { $env:LATCH_DOWNLOAD_BASE_URL } else { "__CIEAV_DOWNLOAD_BASE_URL__" }),
  [switch]$NoService,
  [switch]$NoOpenClaw
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$PinnedCloudUrl = "__CIEAV_CLOUD_URL__"
$PinnedReleaseVersion = "__CIEAV_RELEASE_VERSION__"
$PinnedWindowsSigner = "__CIEAV_WINDOWS_SIGNER_THUMBPRINT__"
$PinnedMacSigner = "__CIEAV_MACOS_SIGNING_IDENTITY__"
$PinnedReleaseKeyId = "__CIEAV_RELEASE_KEY_ID__"
$PinnedReleaseRsaModulusB64 = "__CIEAV_RELEASE_RSA_MODULUS_B64__"
$PinnedReleaseRsaExponentB64 = "__CIEAV_RELEASE_RSA_EXPONENT_B64__"
$PinnedReleasePublicKeyPemB64 = "__CIEAV_RELEASE_PUBLIC_KEY_PEM_B64__"
function Fail([string]$Message) { throw "CIEAV install failed: $Message" }
function Get-PlatformKey {
  $os = if ($IsWindows -or $env:OS -eq "Windows_NT") { "windows" } elseif ($IsMacOS) { "macos" } elseif ($IsLinux) { "linux" } else { Fail "unsupported operating system" }
  $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
  $arch = switch ($arch) { "x64" { "x64" }; "arm64" { "arm64" }; default { Fail "unsupported architecture: $arch" } }
  return "$os-$arch"
}
function Get-InstallRoot {
  if ($IsWindows -or $env:OS -eq "Windows_NT") { if ($env:LOCALAPPDATA) { return (Join-Path $env:LOCALAPPDATA "CIEAV") }; return (Join-Path $HOME "AppData\Local\CIEAV") }
  return (Join-Path $HOME ".local/share/cieav")
}
function Get-BinRoot([string]$InstallRoot) { if ($IsWindows -or $env:OS -eq "Windows_NT") { return (Join-Path $InstallRoot "bin") }; return (Join-Path $HOME ".local/bin") }
function Get-CieavFile([string]$Uri,[string]$OutFile) {
  $u=[Uri]$Uri
  if ($u.Scheme -ne "https") { Fail "download URL must use HTTPS" }
  Invoke-WebRequest -Uri $u -OutFile $OutFile -UseBasicParsing -MaximumRedirection 0
}
function Assert-ReleaseMetadataSignature([string]$DataPath,[string]$SignaturePath,[string]$ExpectedFile) {
  $envelope=Get-Content $SignaturePath -Raw|ConvertFrom-Json
  if ($envelope.schemaVersion -ne 2 -or $envelope.product -ne "CIEAV" -or $envelope.algorithm -ne "RSA-SHA256" -or $envelope.file -ne $ExpectedFile) { Fail "release metadata signature envelope is invalid" }
  if ([string]$envelope.keyId -ne $PinnedReleaseKeyId) { Fail "release metadata signature key does not match the pinned trust root" }
  if ([string]$envelope.sha256 -notmatch '^[0-9a-f]{64}$') { Fail "release metadata signed digest is invalid" }
  $actualDigest=(Get-FileHash -Algorithm SHA256 -Path $DataPath).Hash.ToLowerInvariant()
  if ($actualDigest -ne [string]$envelope.sha256) { Fail "release metadata digest does not match its signed envelope" }
  try {
    $modulus=[Convert]::FromBase64String($PinnedReleaseRsaModulusB64); $exponent=[Convert]::FromBase64String($PinnedReleaseRsaExponentB64); $signature=[Convert]::FromBase64String([string]$envelope.signature)
  } catch { Fail "release verification key or signature encoding is invalid" }
  if ($modulus.Length -ne 384 -or $exponent.Length -lt 3 -or $exponent.Length -gt 8 -or $signature.Length -ne 384) { Fail "release verification key or signature length is invalid" }
  $params=New-Object System.Security.Cryptography.RSAParameters; $params.Modulus=$modulus; $params.Exponent=$exponent
  $rsa=New-Object System.Security.Cryptography.RSACryptoServiceProvider
  $sha=[System.Security.Cryptography.SHA256]::Create()
  try {
    $rsa.ImportParameters($params)
    $bytes=[IO.File]::ReadAllBytes($DataPath)
    $oid=[System.Security.Cryptography.CryptoConfig]::MapNameToOID("SHA256")
    if (-not $rsa.VerifyData($bytes,$oid,$signature)) { Fail "release metadata RSA signature verification failed" }
  } finally { $sha.Dispose(); $rsa.Dispose() }
  Write-Host "CIEAV · release metadata signature verified"
}
function Assert-RuntimePublisher([string]$Executable) {
  if ($IsWindows -or $env:OS -eq "Windows_NT") {
    if ($PinnedWindowsSigner -eq "__CIEAV_WINDOWS_SIGNER_THUMBPRINT__" -or $PinnedWindowsSigner -notmatch '^[0-9A-F]{40,128}$') { Fail "installer has no pinned Windows signer" }
    $sig=Get-AuthenticodeSignature -FilePath $Executable
    if ($sig.Status -ne "Valid" -or -not $sig.SignerCertificate) { Fail "CIEAV executable does not have a valid Authenticode signature" }
    $actual=([string]$sig.SignerCertificate.Thumbprint -replace '\s','').ToUpperInvariant()
    if ($actual -ne $PinnedWindowsSigner) { Fail "CIEAV executable signer does not match the pinned publisher" }
    Write-Host "CIEAV · Authenticode publisher verified"; return
  }
  if ($IsMacOS) {
    if ($PinnedMacSigner -eq "__CIEAV_MACOS_SIGNING_IDENTITY__") { Fail "installer has no pinned macOS signer" }
    & /usr/bin/codesign --verify --strict --verbose=2 $Executable 2>$null
    if ($LASTEXITCODE -ne 0) { Fail "CIEAV executable failed macOS code-signature verification" }
    $detail=(& /usr/bin/codesign -dv --verbose=4 $Executable 2>&1 | Out-String)
    if ($detail -notmatch [regex]::Escape("Authority=$PinnedMacSigner")) { Fail "CIEAV executable signer does not match the pinned Developer ID" }
    Write-Host "CIEAV · macOS Developer ID verified"
  }
}
function Try-ConnectOpenClaw([string]$RuntimeCieav) {
  if ($NoOpenClaw) { Write-Host "CIEAV · OpenClaw auto-connect disabled"; return }
  $openclaw=Get-Command openclaw -ErrorAction SilentlyContinue
  if (-not $openclaw) { Write-Host "CIEAV · OpenClaw not detected; standalone install complete"; Write-Host "CIEAV · run 'cieav openclaw connect' after installing OpenClaw"; return }
  Write-Host "CIEAV · OpenClaw detected; registering governed MCP boundary"
  try {
    & $RuntimeCieav openclaw connect
    if ($LASTEXITCODE -ne 0) { throw "CIEAV OpenClaw connector exited $LASTEXITCODE" }
    Write-Host "CIEAV · OpenClaw connected"
  } catch {
    Write-Warning "CIEAV installed, but OpenClaw auto-connect did not complete: $($_.Exception.Message)"
    Write-Warning "Retry later with: cieav openclaw connect"
  }
}

if (-not $BaseUrl -or $BaseUrl -eq "__CIEAV_DOWNLOAD_BASE_URL__") { Fail "installer was not rendered with an official download endpoint. Pass -BaseUrl or set CIEAV_DOWNLOAD_BASE_URL." }
if ($PinnedCloudUrl -eq "__CIEAV_CLOUD_URL__" -or $PinnedReleaseVersion -eq "__CIEAV_RELEASE_VERSION__") { Fail "installer is missing pinned release metadata" }
if ($PinnedReleaseKeyId -eq "__CIEAV_RELEASE_KEY_ID__" -or $PinnedReleaseKeyId -notmatch '^[0-9a-f]{64}$') { Fail "installer is missing a valid release verification key ID" }
if ($PinnedReleaseRsaModulusB64 -eq "__CIEAV_RELEASE_RSA_MODULUS_B64__" -or $PinnedReleaseRsaExponentB64 -eq "__CIEAV_RELEASE_RSA_EXPONENT_B64__" -or $PinnedReleasePublicKeyPemB64 -eq "__CIEAV_RELEASE_PUBLIC_KEY_PEM_B64__") { Fail "installer is missing release verification key material" }
if ($PinnedReleaseVersion -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') { Fail "installer has an invalid pinned release version" }
try { $baseUri=[Uri]$BaseUrl } catch { Fail "download endpoint is not a valid URI" }
if ($baseUri.Scheme -ne "https" -or -not $baseUri.Host) { Fail "download endpoint must use HTTPS" }
if ($baseUri.UserInfo -or $baseUri.Query -or $baseUri.Fragment -or ($baseUri.AbsolutePath -ne "/" -and $baseUri.AbsolutePath -ne "")) { Fail "download endpoint must be a clean HTTPS origin with no credentials, path, query, or fragment" }
$BaseUrl=("https://"+$baseUri.Authority).TrimEnd('/')
try { $pinnedCloudUri=[Uri]$PinnedCloudUrl } catch { Fail "pinned Cloud endpoint is invalid" }
if ($pinnedCloudUri.Scheme -ne "https" -or -not $pinnedCloudUri.Host -or $pinnedCloudUri.UserInfo -or $pinnedCloudUri.Query -or $pinnedCloudUri.Fragment -or ($pinnedCloudUri.AbsolutePath -ne "/" -and $pinnedCloudUri.AbsolutePath -ne "")) { Fail "pinned Cloud endpoint must be a clean HTTPS origin" }
$PinnedCloudUrl=("https://"+$pinnedCloudUri.Authority).TrimEnd('/')
if ($Channel -notmatch '^[A-Za-z0-9._-]+$') { Fail "invalid release channel" }
$platform=Get-PlatformKey; $installRoot=Get-InstallRoot; $binRoot=Get-BinRoot $installRoot; $backup="$installRoot.previous"
$tempRoot=Join-Path ([System.IO.Path]::GetTempPath()) ("cieav-install-"+[guid]::NewGuid().ToString("N")); New-Item -ItemType Directory -Force -Path $tempRoot|Out-Null
$success=$false; $runtimeReplaced=$false
try {
  $manifestUrl="$BaseUrl/$Channel/manifest.json"; $manifestPath=Join-Path $tempRoot "manifest.json"; $signaturePath=Join-Path $tempRoot "manifest.sig.json"
  Write-Host "CIEAV · fetching signed release manifest"; Get-CieavFile $manifestUrl $manifestPath; Get-CieavFile "$BaseUrl/$Channel/signatures/manifest.json.sig.json" $signaturePath
  Assert-ReleaseMetadataSignature $manifestPath $signaturePath "manifest.json"
  $manifest=Get-Content $manifestPath -Raw|ConvertFrom-Json
  if ($manifest.brand -and $manifest.brand -ne "CIEAV") { Fail "release manifest brand mismatch" }
  if (-not $manifest.version -or ([string]$manifest.version) -notmatch '^[A-Za-z0-9._-]+$') { Fail "release manifest has invalid version" }
  if ([string]$manifest.version -ne $PinnedReleaseVersion) { Fail "release manifest version does not match the installer-pinned release" }
  if (-not $manifest.cloudUrl) { Fail "release manifest has no Cloud Intelligence URL" }
  try { $cloudUri=[Uri]([string]$manifest.cloudUrl) } catch { Fail "Cloud Intelligence URL is invalid" }
  if ($cloudUri.Scheme -ne "https" -or -not $cloudUri.Host -or $cloudUri.UserInfo -or $cloudUri.Query -or $cloudUri.Fragment -or ($cloudUri.AbsolutePath -ne "/" -and $cloudUri.AbsolutePath -ne "")) { Fail "Cloud Intelligence URL must be a clean credential-free HTTPS origin" }
  $manifestCloud=("https://"+$cloudUri.Authority).TrimEnd('/'); if ($manifestCloud -ne $PinnedCloudUrl) { Fail "release manifest Cloud endpoint does not match the installer-pinned endpoint" }
  $artifact=$manifest.artifacts.$platform; if (-not $artifact) { Fail "no CIEAV runtime published for $platform" }; if (-not $artifact.url -or -not $artifact.sha256) { Fail "artifact metadata is incomplete" }
  if (([string]$artifact.sha256) -notmatch '^[0-9A-Fa-f]{64}$') { Fail "artifact SHA-256 metadata is invalid" }
  $artifactPath=[string]$artifact.url
  if ($artifactPath -match '^[A-Za-z][A-Za-z0-9+.-]*://' -or $artifactPath.StartsWith('/') -or $artifactPath.Contains('..') -or $artifactPath.Contains('?') -or $artifactPath.Contains('#') -or $artifactPath.Contains('\') -or $artifactPath -notmatch '^[A-Za-z0-9._/-]+$') { Fail "artifact path must be a safe relative path on the CIEAV download origin" }
  if (-not $artifactPath.StartsWith("$Channel/",[StringComparison]::Ordinal)) { Fail "artifact path must remain inside the selected release channel" }
  $artifactUrl="$BaseUrl/$artifactPath"; $archive=Join-Path $tempRoot "cieav-runtime.zip"; Write-Host "CIEAV · downloading $($manifest.version) for $platform"; Get-CieavFile $artifactUrl $archive
  $actual=(Get-FileHash -Algorithm SHA256 -Path $archive).Hash.ToLowerInvariant(); $expected=([string]$artifact.sha256).ToLowerInvariant(); if ($actual -ne $expected) { Fail "runtime checksum mismatch" }; Write-Host "CIEAV · checksum verified"
  $staging=Join-Path $tempRoot "runtime"; Expand-Archive -Path $archive -DestinationPath $staging -Force
  $payload=Join-Path $staging "cieav-runtime"; if (-not (Test-Path $payload)) { $payload=Join-Path $staging "latch-runtime" }; if (-not (Test-Path $payload)) { Fail "runtime archive is missing cieav-runtime/" }
  $isWin=($IsWindows -or $env:OS -eq "Windows_NT"); $stagedCieav=if ($isWin) { Join-Path $payload "bin/cieav.exe" } else { Join-Path $payload "bin/cieav" }
  if (-not (Test-Path $stagedCieav)) { $legacy=if ($isWin) { Join-Path $payload "bin/latch.exe" } else { Join-Path $payload "bin/latch" }; if (Test-Path $legacy) { $stagedCieav=$legacy } }
  if (-not (Test-Path $stagedCieav)) { Fail "runtime archive does not contain the CIEAV executable" }
  Assert-RuntimePublisher $stagedCieav
  if (Test-Path $backup) { Remove-Item -Recurse -Force $backup }; if (Test-Path $installRoot) { Move-Item -Path $installRoot -Destination $backup }
  New-Item -ItemType Directory -Force -Path (Split-Path $installRoot -Parent)|Out-Null; Move-Item -Path $payload -Destination $installRoot; $runtimeReplaced=$true; New-Item -ItemType Directory -Force -Path $binRoot|Out-Null
  $runtimeCieav=if ($isWin) { Join-Path $installRoot "bin/cieav.exe" } else { Join-Path $installRoot "bin/cieav" }
  if (-not (Test-Path $runtimeCieav)) { $legacy=if ($isWin) { Join-Path $installRoot "bin/latch.exe" } else { Join-Path $installRoot "bin/latch" }; if (Test-Path $legacy) { $runtimeCieav=$legacy } }
  $runtimeNode=if ($isWin) { Join-Path $installRoot "runtime/node.exe" } else { Join-Path $installRoot "runtime/node" }
  if (-not (Test-Path $runtimeCieav)) { Fail "installed runtime does not contain the CIEAV executable" }; if (-not (Test-Path $runtimeNode)) { Fail "installed runtime does not contain bundled Node" }
  if ($isWin) {
    Set-Content -Path (Join-Path $binRoot "cieav.cmd") -Encoding ASCII -Value "@echo off`r`n`"$runtimeCieav`" %*`r`n"; Set-Content -Path (Join-Path $binRoot "latch.cmd") -Encoding ASCII -Value "@echo off`r`n`"$runtimeCieav`" %*`r`n"
    $userPath=[Environment]::GetEnvironmentVariable("Path","User"); $parts=@($userPath -split ';'|Where-Object { $_ }); if ($parts -notcontains $binRoot) { [Environment]::SetEnvironmentVariable("Path",(($parts+$binRoot)-join ';'),"User") }; $env:Path="$(Join-Path $installRoot 'runtime');$binRoot;$env:Path"
  } else {
    foreach ($name in @("cieav","latch")) { $shim=Join-Path $binRoot $name; $script="#!/bin/sh`nexec `"$runtimeCieav`" `"`$@`"`n"; Set-Content -Path $shim -Encoding UTF8 -NoNewline -Value $script; & chmod 0755 $shim }; & chmod 0755 $runtimeCieav $runtimeNode; $env:PATH="$(Join-Path $installRoot 'runtime');${binRoot}:$env:PATH"
  }
  $env:CIEAV_HOME=$installRoot; $env:CIEAV_CLOUD_URL=$PinnedCloudUrl; $env:CIEAV_VERSION=$PinnedReleaseVersion; $env:LATCH_HOME=$installRoot; $env:LATCH_CLOUD_URL=$PinnedCloudUrl; $env:LATCH_VERSION=$PinnedReleaseVersion
  Write-Host "CIEAV · running runtime self-check"; & $runtimeCieav doctor; if ($LASTEXITCODE -ne 0) { Fail "runtime self-check failed" }
  Write-Host "CIEAV · enrolling with Cloud Intelligence"; & $runtimeCieav cloud enroll; if ($LASTEXITCODE -ne 0) { Fail "Cloud Intelligence enrollment failed" }
  Write-Host "CIEAV · running cloud safety probe"; & $runtimeCieav cloud probe; if ($LASTEXITCODE -ne 0) { Fail "Cloud Intelligence safety probe failed" }
  if (-not $NoService) { Write-Host "CIEAV · installing always-on Gateway"; & $runtimeCieav gateway install; if ($LASTEXITCODE -ne 0) { Fail "Gateway service installation failed" } }
  if (-not $NoService) { Try-ConnectOpenClaw $runtimeCieav } elseif (-not $NoOpenClaw) { Write-Host "CIEAV · OpenClaw auto-connect skipped because -NoService leaves local authority offline" }
  $success=$true; Write-Host ""; Write-Host "CIEAV installed successfully."; Write-Host "Version: $PinnedReleaseVersion"; Write-Host "Runtime: $installRoot"; Write-Host "Consumer dependencies: none (runtime is bundled)"; Write-Host "Privacy: durable user state remains local"; Write-Host ""; Write-Host "Run: cieav gateway status"; Write-Host "Run: cieav openclaw status"; Write-Host "Run: cieav cloud status"; Write-Host "Run: cieav test-lab"
}
catch { Write-Error $_; exit 1 }
finally {
  if (-not $success -and $runtimeReplaced) { Write-Warning "CIEAV install failed; restoring previous runtime"; if (Test-Path $installRoot) { Remove-Item -Recurse -Force $installRoot -ErrorAction SilentlyContinue }; if (Test-Path $backup) { Move-Item -Path $backup -Destination $installRoot -ErrorAction SilentlyContinue } }
  if (Test-Path $tempRoot) { Remove-Item -Recurse -Force $tempRoot -ErrorAction SilentlyContinue }
}
