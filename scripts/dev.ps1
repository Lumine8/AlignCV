# Starts the AlignCV dev server on http://localhost:5173
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root "frontend")

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    npm install
}
Write-Host "AlignCV (100% client-side) -> http://localhost:5173" -ForegroundColor Cyan
npm run dev
