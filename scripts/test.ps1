param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if ($BackendOnly -and $FrontendOnly) {
    Write-Error "Choose at most one of -BackendOnly and -FrontendOnly."
    exit 1
}

if (-not $FrontendOnly) {
    $python = Join-Path $root "backend\.venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $python)) {
        Write-Error "Backend virtual environment not found. Create it first: cd backend; python -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt"
        exit 1
    }
    Push-Location (Join-Path $root "backend")
    try {
        & $python -m pytest
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }
}

if (-not $BackendOnly) {
    Push-Location (Join-Path $root "frontend")
    try {
        npm test
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }
}
