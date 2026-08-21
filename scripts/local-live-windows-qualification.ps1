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
  $global:LASTEXITCODE = 0
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
function Get-FreeLoopbackPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
  $listener.Start()
  try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}
function Start-LocalFixture([string]$Layout,[string]$Pfx,[string]$Password,[int]$Port,[bool]$FailAfterArtifact,[string]$LogPrefix) {
  $old = $env:CIEAV_LOCAL_LIVE_PFX_PASSWORD
  $env:CIEAV_LOCAL_LIVE_PFX_PASSWORD = $Password
  try {
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
    $arguments = @('scripts/local-live-loopback-server.mjs','--root',('"'+$Layout+'"'),'--pfx',('"'+$Pfx+'"'),'--port',[string]$Port)
    if ($FailAfterArtifact) { $arguments += '--fail-cloud-after-artifact' }
    $stdout = "$LogPrefix.out.log"; $stderr = "$LogPrefix.err.log"
    $proc = Start-Process -FilePath $nodeExe -ArgumentList $arguments -WorkingDirectory $Root -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
    $origin = "https://localhost:$Port"
    $ready = $false
    for ($i=0; $i -lt 80; $i++) {
      if ($proc.HasExited) { break }
      try {
        $health = Invoke-RestMethod -Uri "$origin/health" -Method Get -TimeoutSec 2
        if ($health.ok -eq $true) { $ready = $true; break }
      } catch { Start-Sleep -Milliseconds 100 }
    }
    if (-not $ready) {
      if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
      $detail = @()
      if (Test-Path $stdout) { $detail += Get-Content $stdout -Tail 40 }
      if (Test-Path $stderr) { $detail += Get-Content $stderr -Tail 40 }
      throw "Local HTTPS fixture did not become ready:`n$($detail -join "`n")"
    }
    return [pscustomobject]@{ Process=$proc; Origin=$origin }
  } finally {
    if ($null -eq $old) { Remove-Item Env:CIEAV_LOCAL_LIVE_PFX_PASSWORD -ErrorAction SilentlyContinue } else { $env:CIEAV_LOCAL_LIVE_PFX_PASSWORD = $old }
  }
}
function Stop-LocalFixture($Fixture) {
  if ($Fixture -and $Fixture.Process -and -not $Fixture.Process.HasExited) {
    Stop-Process -Id $Fixture.Process.Id -Force -ErrorAction SilentlyContinue
    try { $Fixture.Process.WaitForExit(5000) | Out-Null } catch {}
  }
}

Assert-CleanSource
$Commit = (& git rev-parse HEAD).Trim()
$Package = Get-Content package.json -Raw | ConvertFrom-Json
$Version = [string]$Package.version
$Tmp = Join-Path $Root '.tmp\local-live-windows'
$Venv = Join-Path $Tmp 'venv'
$CodeCertFile = Join-Path $Tmp 'cieav-local-live-code-signing.cer'
$TlsCer = Join-Path $Tmp 'cieav-local-live-tls.cer'
$TlsPfx = Join-Path $Tmp 'cieav-local-live-tls.pfx'
$Layout = Join-Path $Tmp 'layout'
$LayoutInput = Join-Path $Tmp 'layout-input'
$ReleaseKeys = Join-Path $Tmp 'release-signing'
$CodeThumbprint = $null
$TlsThumbprint = $null
$Fixture = $null
$Checks = [ordered]@{}
$OldLocalAppData = $env:LOCALAPPDATA
$OldStateDir = $env:CIEAV_STATE_DIR
$OldLatchStateDir = $env:LATCH_STATE_DIR
$OldCloudToken = $env:CIEAV_CLOUD_TOKEN
$OldLatchCloudToken = $env:LATCH_CLOUD_TOKEN
$OldChromium = $env:CIEAV_CHROMIUM

try {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $Tmp
  New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

  Invoke-Step 'Local release verification + platform attestation' {
    & npm.cmd run release:verify
  }
  Assert-CleanSource
  $Checks.releaseVerification = $true

  Invoke-Step 'Create isolated Python packaging environment' {
    & python -m venv $Venv
    if ($LASTEXITCODE -ne 0) { return }
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
    $script:CodeThumbprint = $cert.Thumbprint
    Export-Certificate -Cert $cert -FilePath $CodeCertFile -Force | Out-Null
    Import-Certificate -FilePath $CodeCertFile -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
    Import-Certificate -FilePath $CodeCertFile -CertStoreLocation 'Cert:\CurrentUser\TrustedPublisher' | Out-Null
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
  $Metadata = Join-Path $Root 'release-out\metadata-windows-x64.json'
  if (-not (Test-Path $Archive) -or -not (Test-Path $Metadata)) { throw 'Windows runtime archive/metadata were not produced' }
  $Checks.runtimeArchive = $true

  Invoke-Step 'Clean extracted runtime qualification' {
    & python scripts/clean-runtime-smoke.py --archive $Archive --mode local --windows-signer-thumbprint $CodeThumbprint
  }
  $Checks.cleanRuntime = $true

  Invoke-Step 'Real CurrentUser Gateway service lifecycle' {
    & python scripts/service-lifecycle-smoke.py --archive $Archive --mode local --confirm-service-mutation
  }
  $Checks.serviceLifecycle = $true

  Invoke-Step 'Create isolated loopback TLS trust' {
    $tls = New-SelfSignedCertificate -DnsName 'localhost' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddDays(1)
    $script:TlsThumbprint = $tls.Thumbprint
    Export-Certificate -Cert $tls -FilePath $TlsCer -Force | Out-Null
    Import-Certificate -FilePath $TlsCer -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
    $script:TlsPassword = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    $secure = ConvertTo-SecureString -String $TlsPassword -AsPlainText -Force
    Export-PfxCertificate -Cert $tls -FilePath $TlsPfx -Password $secure -Force | Out-Null
  }
  $Checks.loopbackTls = $true

  $Port = Get-FreeLoopbackPort
  $Origin = "https://localhost:$Port"
  New-Item -ItemType Directory -Force -Path $Layout,$LayoutInput,$ReleaseKeys,(Join-Path $Layout 'stable'),(Join-Path $Layout 'stable\signatures') | Out-Null
  Copy-Item $Archive -Destination (Join-Path $Layout 'stable') -Force
  Copy-Item $Metadata -Destination (Join-Path $LayoutInput 'metadata-windows-x64.json') -Force

  $ReleasePrivate = Join-Path $ReleaseKeys 'private.pem'
  $ReleasePublic = Join-Path $ReleaseKeys 'public.pem'
  Invoke-Step 'Generate ephemeral local installer release trust root' {
    & node scripts/release-sign.mjs generate --private-key $ReleasePrivate --public-key $ReleasePublic
  }
  $ReleaseParams = (& node scripts/release-sign.mjs params --public-key $ReleasePublic | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0 -or -not $ReleaseParams.keyId) { throw 'Unable to derive local release verification parameters' }

  $Manifest = Join-Path $Layout 'stable\manifest.json'
  $Signatures = Join-Path $Layout 'stable\signatures'
  Invoke-Step 'Build and sign local HTTPS release manifest' {
    & python scripts/make-release-manifest.py --input-dir $LayoutInput --output $Manifest --version $Version --cloud-url $Origin --channel stable
    if ($LASTEXITCODE -ne 0) { return }
    & node scripts/release-sign.mjs sign --private-key $ReleasePrivate --public-key $ReleasePublic --output-dir $Signatures $Manifest
  }
  $Checks.signedLocalManifest = $true

  Invoke-Step 'Render local signed installer with pinned test trust' {
    & python scripts/render-installers.py --download-base-url $Origin --cloud-url $Origin --release-version $Version --windows-signer-thumbprint $CodeThumbprint --macos-signing-identity 'CIEAV Local Live Test' --release-key-id $ReleaseParams.keyId --release-rsa-modulus-b64 $ReleaseParams.modulus --release-rsa-exponent-b64 $ReleaseParams.exponent --release-public-key-pem-b64 $ReleaseParams.publicKeyPemBase64 --output-dir $Layout
  }
  $Installer = Join-Path $Layout 'install.ps1'
  if (-not (Test-Path $Installer)) { throw 'Local rendered installer was not produced' }
  $Checks.renderedInstaller = $true

  $ChromeCandidates = @(
    (Join-Path $OldLocalAppData 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
  ) | Where-Object { $_ -and (Test-Path $_) }
  if ($ChromeCandidates.Count -gt 0) { $env:CIEAV_CHROMIUM = $ChromeCandidates[0] }
  $env:LOCALAPPDATA = Join-Path $Tmp 'installer-localappdata'
  $env:CIEAV_STATE_DIR = Join-Path $Tmp 'installer-state'
  $env:LATCH_STATE_DIR = $env:CIEAV_STATE_DIR
  Remove-Item Env:CIEAV_CLOUD_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:LATCH_CLOUD_TOKEN -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $env:LOCALAPPDATA,$env:CIEAV_STATE_DIR | Out-Null

  Invoke-Step 'Live local installer success over trusted loopback HTTPS' {
    $script:Fixture = Start-LocalFixture $Layout $TlsPfx $TlsPassword $Port $false (Join-Path $Tmp 'https-success')
    try {
      & python scripts/installer-live-smoke.py --installer $Installer --scenario success --mode local --confirm-install-mutation
    } finally { Stop-LocalFixture $Fixture; $script:Fixture = $null }
  }
  $Checks.installerSuccess = $true

  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $env:CIEAV_STATE_DIR
  New-Item -ItemType Directory -Force -Path $env:CIEAV_STATE_DIR | Out-Null
  Invoke-Step 'Live local transactional rollback after controlled Cloud outage' {
    $script:Fixture = Start-LocalFixture $Layout $TlsPfx $TlsPassword $Port $true (Join-Path $Tmp 'https-rollback')
    try {
      & python scripts/installer-live-smoke.py --installer $Installer --scenario rollback --mode local --confirm-install-mutation
    } finally { Stop-LocalFixture $Fixture; $script:Fixture = $null }
  }
  $Checks.installerRollback = $true

  Assert-CleanSource
  $Checks.cleanSourceAfterMutation = $true

  $Evidence = [ordered]@{
    schemaVersion = 2
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
      'loopback HTTPS uses a temporary locally trusted certificate; no public domain/CDN or public CA TLS deployment tested',
      'installer release trust root is ephemeral and test-only; it is not the production release signing identity',
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
  Stop-LocalFixture $Fixture
  if ($CodeThumbprint) { Remove-TestCertificate $CodeThumbprint }
  if ($TlsThumbprint) { Remove-TestCertificate $TlsThumbprint }
  foreach ($file in @($CodeCertFile,$TlsCer,$TlsPfx)) { Remove-Item -Force -ErrorAction SilentlyContinue $file }
  if ($null -eq $OldLocalAppData) { Remove-Item Env:LOCALAPPDATA -ErrorAction SilentlyContinue } else { $env:LOCALAPPDATA = $OldLocalAppData }
  if ($null -eq $OldStateDir) { Remove-Item Env:CIEAV_STATE_DIR -ErrorAction SilentlyContinue } else { $env:CIEAV_STATE_DIR = $OldStateDir }
  if ($null -eq $OldLatchStateDir) { Remove-Item Env:LATCH_STATE_DIR -ErrorAction SilentlyContinue } else { $env:LATCH_STATE_DIR = $OldLatchStateDir }
  if ($null -eq $OldCloudToken) { Remove-Item Env:CIEAV_CLOUD_TOKEN -ErrorAction SilentlyContinue } else { $env:CIEAV_CLOUD_TOKEN = $OldCloudToken }
  if ($null -eq $OldLatchCloudToken) { Remove-Item Env:LATCH_CLOUD_TOKEN -ErrorAction SilentlyContinue } else { $env:LATCH_CLOUD_TOKEN = $OldLatchCloudToken }
  if ($null -eq $OldChromium) { Remove-Item Env:CIEAV_CHROMIUM -ErrorAction SilentlyContinue } else { $env:CIEAV_CHROMIUM = $OldChromium }
}
