param([int]$Port = 8000)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$venv = Join-Path $backend ".venv"
$python = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "Creating virtual environment in backend\.venv"
    python -m venv $venv
}

& $python -m pip install --upgrade pip | Out-Null
& $python -m pip install -r (Join-Path $backend "requirements.txt")
& $python -m uvicorn app.main:app --reload --app-dir $backend --port $Port
