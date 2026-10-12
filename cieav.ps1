<#
.SYNOPSIS
    CIEAV Native PowerShell Command Launcher.
    The Commit Layer for Computer Control & Autonomous Agents (like Alma & Claude Code).

.DESCRIPTION
    Runs the CIEAV governed NLP terminal assistant with full Windows computer control,
    local resume discovery, LinkedIn role matching, PII redaction, and two-phase undo.

.EXAMPLE
    cieav
    cieav "find jobs matching my resume and apply"
    cieav chat
    cieav status
    cieav undo
#>

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliScript = Join-Path $ScriptDir "python\cieav_platform\chat_cli.py"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "[ERROR] Python is not found in PATH. Please install Python 3.10+"
    exit 1
}

python $CliScript @args
