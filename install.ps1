# CIEAV One-Line Windows Installer
# Usage: irm https://raw.githubusercontent.com/Aravindh-dev12/cieav-agent-workforce/main/install.ps1 | iex

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   CIEAV: THE COMMIT LAYER FOR THE INTERNET & AGENTS        " -ForegroundColor Green
Write-Host "   One-Line Native Windows Installer                        " -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan

$InstallDir = Join-Path $HOME ".cieav"
$RepoUrl = "https://github.com/Aravindh-dev12/cieav-agent-workforce.git"

# Check Python
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    Write-Host "[ERROR] Python 3.10+ is required. Please install Python from https://python.org" -ForegroundColor Red
    exit 1
}

# Check Git
$GitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $GitCmd) {
    Write-Host "[ERROR] Git is required. Please install Git from https://git-scm.com" -ForegroundColor Red
    exit 1
}

Write-Host "[1/4] Cloning/Updating CIEAV into $InstallDir..." -ForegroundColor Yellow
if (Test-Path $InstallDir) {
    Set-Location $InstallDir
    git pull origin main
} else {
    git clone $RepoUrl $InstallDir
    Set-Location $InstallDir
}

Write-Host "[2/4] Installing Python dependencies..." -ForegroundColor Yellow
python -m pip install --quiet -r requirements.txt

Write-Host "[3/4] Configuring User PATH..." -ForegroundColor Yellow
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    $env:Path = "$env:Path;$InstallDir"
    Write-Host "  Added $InstallDir to User PATH." -ForegroundColor Green
}

Write-Host "[4/4] Verifying CIEAV..." -ForegroundColor Yellow
& (Join-Path $InstallDir "cieav.cmd") /status

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "   ✅ CIEAV INSTALLED SUCCESSFULLY!                         " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "You can now run 'cieav' from any PowerShell or Command Prompt:`n" -ForegroundColor White
Write-Host "  cieav                                            # Launch interactive NLP terminal" -ForegroundColor Cyan
Write-Host "  cieav `"find jobs based on my resume and apply`"   # Alma computer control agent" -ForegroundColor Cyan
Write-Host "  cieav /status                                    # Verify Ed25519 hash chain" -ForegroundColor Cyan
Write-Host "  cieav /receipts                                  # View immutable receipts" -ForegroundColor Cyan
Write-Host "  cieav /undo                                      # Atomic two-phase rollback" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Green
