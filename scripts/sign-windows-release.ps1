param(
  [ValidateSet("pfx","store","artifact-signing")]
  [string]$Provider = $(if ($env:CIEAV_WINDOWS_SIGNING_PROVIDER) { $env:CIEAV_WINDOWS_SIGNING_PROVIDER } else { "pfx" }),
  [string[]]$Files = @("dist/cieav.exe","dist/cdp-win-bridge.exe"),
  [string]$TimestampUrl = $(if ($env:CIEAV_WINDOWS_TIMESTAMP_URL) { $env:CIEAV_WINDOWS_TIMESTAMP_URL } elseif ($env:WINDOWS_TIMESTAMP_URL) { $env:WINDOWS_TIMESTAMP_URL } else { "" }),
  [string]$ExpectedThumbprint = $(if ($env:CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT) { $env:CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT } elseif ($env:WINDOWS_CERT_THUMBPRINT) { $env:WINDOWS_CERT_THUMBPRINT } else { "" }),
  [string]$ExpectedSubject = $(if ($env:CIEAV_WINDOWS_CODE_SIGN_SUBJECT) { $env:CIEAV_WINDOWS_CODE_SIGN_SUBJECT } else { "" }),
  [string]$PfxPath = "",
  [string]$PfxPassword = $(if ($env:CIEAV_WINDOWS_CODE_SIGN_PFX_PASSWORD) { $env:CIEAV_WINDOWS_CODE_SIGN_PFX_PASSWORD } elseif ($env:WINDOWS_PFX_PASSWORD) { $env:WINDOWS_PFX_PASSWORD } else { "" }),
  [ValidateSet("CurrentUser","LocalMachine")]
  [string]$StoreLocation = "CurrentUser"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw "Windows release signing is Windows-only" }

function Normalize-Thumbprint([string]$Value) { return (($Value -replace '\s','').ToUpperInvariant()) }
function Resolve-SignTool {
  $root = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  $tool = Get-ChildItem -LiteralPath $root -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
    Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $tool) { throw "signtool.exe not found under $root" }
  return $tool.FullName
}

$signtool = Resolve-SignTool
$resolvedFiles = @($Files | ForEach-Object { (Resolve-Path -LiteralPath $_).Path })
if ($resolvedFiles.Count -eq 0) { throw "No Windows release files were supplied" }
$expectedThumb = Normalize-Thumbprint $ExpectedThumbprint
$expectedSubject = $ExpectedSubject.Trim()

if ($Provider -eq "pfx") {
  if (-not $PfxPath -or -not (Test-Path -LiteralPath $PfxPath)) { throw "PFX signing requires -PfxPath" }
  if (-not $PfxPassword) { throw "PFX signing requires a PFX password" }
  if (-not $TimestampUrl) { throw "PFX signing requires an RFC 3161 timestamp URL" }
  if ($expectedThumb -notmatch '^[0-9A-F]{40,64}$') { throw "PFX signing requires the expected production signer thumbprint" }
  foreach ($file in $resolvedFiles) {
    & $signtool sign /fd SHA256 /f $PfxPath /p $PfxPassword /tr $TimestampUrl /td SHA256 $file
    if ($LASTEXITCODE -ne 0) { throw "Authenticode PFX signing failed for $file" }
  }
} elseif ($Provider -eq "store") {
  if (-not $TimestampUrl) { throw "Certificate-store signing requires an RFC 3161 timestamp URL" }
  if ($expectedThumb -notmatch '^[0-9A-F]{40,64}$') { throw "Certificate-store signing requires the expected production signer thumbprint" }
  foreach ($file in $resolvedFiles) {
    $args = @("sign","/fd","SHA256","/sha1",$expectedThumb,"/s","My")
    if ($StoreLocation -eq "LocalMachine") { $args += "/sm" }
    $args += @("/tr",$TimestampUrl,"/td","SHA256",$file)
    & $signtool @args
    if ($LASTEXITCODE -ne 0) { throw "Authenticode certificate-store signing failed for $file" }
  }
} else {
  if (-not $expectedSubject -or $expectedSubject.Contains("`r") -or $expectedSubject.Contains("`n")) { throw "Artifact Signing verification requires CIEAV_WINDOWS_CODE_SIGN_SUBJECT" }
}

$thumbprints = @()
$subjects = @()
foreach ($file in $resolvedFiles) {
  & $signtool verify /pa /all /v $file
  if ($LASTEXITCODE -ne 0) { throw "Authenticode verification failed for $file" }
  $sig = Get-AuthenticodeSignature -LiteralPath $file
  if ($sig.Status -ne "Valid" -or -not $sig.SignerCertificate) { throw "Invalid Authenticode status for ${file}: $($sig.Status)" }
  $thumb = Normalize-Thumbprint ([string]$sig.SignerCertificate.Thumbprint)
  $subject = ([string]$sig.SignerCertificate.Subject).Trim()
  if ($thumb -notmatch '^[0-9A-F]{40,64}$') { throw "Invalid signer thumbprint for $file" }
  if ($Provider -in @("pfx","store") -and $thumb -ne $expectedThumb) { throw "Windows signer certificate thumbprint mismatch for $file" }
  if ($Provider -eq "artifact-signing" -and -not [string]::Equals($subject,$expectedSubject,[StringComparison]::OrdinalIgnoreCase)) { throw "Artifact Signing certificate subject mismatch for $file" }
  $thumbprints += $thumb
  $subjects += $subject
}

if (@($thumbprints | Select-Object -Unique).Count -ne 1) { throw "Windows release executables were not signed by the same leaf certificate" }
if (@($subjects | Select-Object -Unique).Count -ne 1) { throw "Windows release executables have different signer subjects" }
$actualThumb = $thumbprints[0]
if ($env:GITHUB_ENV) { Add-Content -LiteralPath $env:GITHUB_ENV -Value "CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT=$actualThumb" -Encoding utf8 }
Write-Host "CIEAV Windows signing verified · provider=$Provider · thumbprint=$actualThumb"
