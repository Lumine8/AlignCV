# Builds the static site into frontend/dist for deployment.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/build.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root "frontend")

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    npm install
}
Write-Host "Building static site..." -ForegroundColor Cyan
npm run build
Write-Host "Done. Deploy the contents of frontend/dist to any static host." -ForegroundColor Green
