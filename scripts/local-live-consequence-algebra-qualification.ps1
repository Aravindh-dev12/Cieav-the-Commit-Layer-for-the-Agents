param(
  [switch]$FullProduction,
  [switch]$SkipInstall
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

function Invoke-Checked {
  param(
    [Parameter(Mandatory=$true)][string]$File,
    [Parameter()][string[]]$CommandArgs = @()
  )
  Write-Host "> $File $($CommandArgs -join ' ')" -ForegroundColor Cyan
  & $File @CommandArgs
  if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE" }
}

Invoke-Checked -File 'git' -CommandArgs @('rev-parse','--is-inside-work-tree')
$Head = (& git rev-parse HEAD).Trim()
$Branch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($Branch -ne 'tmp-consequence-algebra-build') { throw "Checkout tmp-consequence-algebra-build before qualification. Current branch: $Branch" }
& git diff --quiet
if ($LASTEXITCODE -ne 0) { throw 'Working tree has unstaged changes; qualification requires an exact clean checkout.' }
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Working tree has staged changes; qualification requires an exact clean checkout.' }

$NodeVersion = (& node -p "process.versions.node").Trim()
$NodeMajor = [int]($NodeVersion.Split('.')[0])
if ($NodeMajor -lt 22) { throw "Node 22+ required; found $NodeVersion" }
Write-Host "CIEAV Consequence Algebra qualification" -ForegroundColor Green
Write-Host "Branch: $Branch"
Write-Host "Commit: $Head"
Write-Host "Node:   $NodeVersion"
Write-Host "OS:     Windows $([Environment]::OSVersion.VersionString)"

if (-not $SkipInstall) { Invoke-Checked -File 'npm.cmd' -CommandArgs @('ci','--ignore-scripts') }
Invoke-Checked -File 'node' -CommandArgs @('scripts/qualify-consequence-algebra.mjs')

$Receipt = Join-Path $Root 'release/reports/latest-consequence-algebra-qualification.json'
if (-not (Test-Path $Receipt)) { throw 'Qualification receipt was not produced.' }
$Evidence = Get-Content $Receipt -Raw | ConvertFrom-Json
if ($Evidence.verdict -ne 'PASS') { throw "Consequence Algebra qualification verdict is $($Evidence.verdict)" }
if ($Evidence.commit -ne $Head) { throw "Receipt commit mismatch: $($Evidence.commit) != $Head" }
if ($Evidence.platform.os -ne 'win32') { throw "Receipt platform mismatch: $($Evidence.platform.os)" }
Write-Host "PASS exact-head Windows qualification: $Receipt" -ForegroundColor Green

if ($FullProduction) {
  Invoke-Checked -File 'node' -CommandArgs @('scripts/qualify-production-with-consequence-algebra.mjs')
  Write-Host 'Full CIEAV production + Consequence Algebra qualification completed.' -ForegroundColor Green
}
