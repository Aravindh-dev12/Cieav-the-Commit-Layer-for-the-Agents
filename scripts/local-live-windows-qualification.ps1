param(
  [switch]$ConfirmLocalMutation
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if (-not $ConfirmLocalMutation) { throw 'Refusing local live mutation without -ConfirmLocalMutation' }
if ($env:OS -ne 'Windows_NT') { throw 'Windows local live qualification requires Windows' }

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

function Invoke-Step([string]$Label, [scriptblock]$Body) {
  Write-Host "`n=== $Label ==="
  & $Body
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}
function Assert-CleanSource {
  $dirty = (& git status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw 'git status failed' }
  if ($dirty) { throw "Local live qualification requires a clean git worktree:`n$($dirty -join "`n")" }
}
function Remove-TestCertificate([string]$Thumbprint) {
  if (-not $Thumbprint) { return }
  foreach ($store in @('Cert:\CurrentUser\My','Cert:\CurrentUser\Root','Cert:\CurrentUser\TrustedPublisher')) {
    Get-ChildItem $store -ErrorAction SilentlyContinue | Where-Object Thumbprint -eq $Thumbprint | Remove-Item -Force -ErrorAction SilentlyContinue
  }
}

Assert-CleanSource
$Commit = (& git rev-parse HEAD).Trim()
$Package = Get-Content package.json -Raw | ConvertFrom-Json
$Version = [string]$Package.version
$Tmp = Join-Path $Root '.tmp\local-live-windows'
$Venv = Join-Path $Tmp 'venv'
$CertFile = Join-Path $Tmp 'cieav-local-live-code-signing.cer'
$Thumbprint = $null
$Checks = [ordered]@{}

try {
  New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

  Invoke-Step 'Local release verification + platform attestation' {
    & npm.cmd run release:verify
  }
  Assert-CleanSource
  $Checks.releaseVerification = $true

  Invoke-Step 'Create isolated Python packaging environment' {
    if (-not (Test-Path (Join-Path $Venv 'Scripts\python.exe'))) {
      & python -m venv $Venv
      if ($LASTEXITCODE -ne 0) { return }
    }
    $VenvPython = Join-Path $Venv 'Scripts\python.exe'
    & $VenvPython -m pip install --disable-pip-version-check --quiet pyinstaller
  }
  $VenvPython = Join-Path $Venv 'Scripts\python.exe'
  $Checks.packagingEnvironment = $true

  Invoke-Step 'Build standalone CIEAV executable' {
    & $VenvPython -m PyInstaller --noconfirm --clean --onefile --name cieav --paths python python/cieav_platform/__main__.py
  }
  if (-not (Test-Path 'dist\cieav.exe')) { throw 'PyInstaller did not produce dist\cieav.exe' }
  $Checks.standaloneExecutable = $true

  Invoke-Step 'Build native Windows private-CDP bridge' {
    New-Item -ItemType Directory -Force -Path dist | Out-Null
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path $vswhere)) { throw 'vswhere.exe not found' }
    $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $vs) { throw 'Visual C++ build tools not found' }
    $devcmd = Join-Path $vs 'Common7\Tools\VsDevCmd.bat'
    $command = '"' + $devcmd + '" -arch=x64 -host_arch=x64 && cl /nologo /std:c++17 /O2 /EHsc /DUNICODE /D_UNICODE /Fo:dist\cdp-win-bridge.obj native\windows\cdp-win-bridge.cpp /Fe:dist\cdp-win-bridge.exe /link /DYNAMICBASE /NXCOMPAT'
    & cmd.exe /d /s /c $command
  }
  if (-not (Test-Path 'dist\cdp-win-bridge.exe')) { throw 'Native CDP bridge was not produced' }
  $Checks.nativeCdpBridge = $true

  Invoke-Step 'Create temporary local-only Windows code-signing trust' {
    $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=CIEAV Local Live Test' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddDays(1)
    $script:Thumbprint = $cert.Thumbprint
    Export-Certificate -Cert $cert -FilePath $CertFile -Force | Out-Null
    Import-Certificate -FilePath $CertFile -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
    Import-Certificate -FilePath $CertFile -CertStoreLocation 'Cert:\CurrentUser\TrustedPublisher' | Out-Null
    foreach ($file in @('dist\cieav.exe','dist\cdp-win-bridge.exe')) {
      $signed = Set-AuthenticodeSignature -FilePath $file -Certificate $cert -HashAlgorithm SHA256
      if ($signed.Status -ne 'Valid') { throw "Local Authenticode signing failed for $file: $($signed.Status)" }
      $verify = Get-AuthenticodeSignature -FilePath $file
      if ($verify.Status -ne 'Valid' -or $verify.SignerCertificate.Thumbprint -ne $cert.Thumbprint) { throw "Local Authenticode verification failed for $file" }
    }
  }
  $Checks.localAuthenticode = $true

  Invoke-Step 'Assemble packaged Windows runtime' {
    $nodeExe = (& node -p 'process.execPath').Trim()
    & python scripts/build-release-runtime.py --cieav-exe dist/cieav.exe --node-exe $nodeExe --cdp-win-bridge dist/cdp-win-bridge.exe --version $Version --output-dir release-out
  }
  $Archive = Join-Path $Root "release-out\cieav-runtime-$Version-windows-x64.zip"
  if (-not (Test-Path $Archive)) { throw "Runtime archive not found: $Archive" }
  $Checks.runtimeArchive = $true

  Invoke-Step 'Clean extracted runtime qualification' {
    & python scripts/clean-runtime-smoke.py --archive $Archive --mode local --windows-signer-thumbprint $Thumbprint
  }
  $Checks.cleanRuntime = $true

  Invoke-Step 'Real CurrentUser Gateway service lifecycle' {
    & python scripts/service-lifecycle-smoke.py --archive $Archive --mode local --confirm-service-mutation
  }
  $Checks.serviceLifecycle = $true

  Assert-CleanSource
  $Checks.cleanSourceAfterMutation = $true

  $Evidence = [ordered]@{
    schemaVersion = 1
    product = 'CIEAV'
    kind = 'LOCAL_LIVE_WINDOWS_QUALIFICATION'
    authority = $false
    production = $false
    version = $Version
    commit = $Commit
    target = 'windows-x64'
    verifiedAt = [DateTime]::UtcNow.ToString('o')
    checks = $Checks
    limitations = @(
      'local self-signed Authenticode trust only; not a production publisher certificate',
      'no public domain/CDN or public CA TLS deployment tested',
      'macOS Secure Enclave and macOS packaging not tested on this Windows host',
      'Linux TPM2 and Linux packaging not tested on this Windows host',
      'CUDA GPU qualification not tested unless separately executed on GPU hardware',
      'GitHub self-hosted runner provenance is not claimed by this local qualification'
    )
  }
  New-Item -ItemType Directory -Force -Path 'release\reports' | Out-Null
  $Evidence | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 'release\reports\latest-local-live-windows-qualification.json'
  Write-Host "`nCIEAV LOCAL LIVE WINDOWS QUALIFICATION: PASS"
  Write-Host "Evidence: release\reports\latest-local-live-windows-qualification.json"
}
finally {
  if ($Thumbprint) { Remove-TestCertificate $Thumbprint }
  Remove-Item -Force -ErrorAction SilentlyContinue $CertFile
}
