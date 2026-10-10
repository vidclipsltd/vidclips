$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue

if ($pythonLauncher) {
  & py -3.11 --version
  if ($LASTEXITCODE -ne 0) {
    throw "Python 3.11 is required. Install it from python.org and enable the Python Launcher, then run this script again."
  }
  $basePython = "py"
  $baseArgs = @("-3.11")
} elseif ($pythonCommand) {
  $version = & python --version 2>&1
  if ($version -notmatch "Python 3\.(11|12)\.") {
    throw "Python 3.11 or 3.12 is required. Found: $version"
  }
  $basePython = "python"
  $baseArgs = @()
} else {
  throw "Python 3.11 or 3.12 is not installed. Install Python from https://www.python.org/downloads/windows/ and select 'Add python.exe to PATH'."
}

$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
  Push-Location $repoRoot
  try {
    & $basePython @baseArgs -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw "Could not create the Python virtual environment." }
  } finally { Pop-Location }
}

Write-Host "Updating pip in the project-only virtual environment..."
& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed." }

Write-Host "Installing local AI dependencies. This can take a long time and several GB of disk space."
Write-Host "No video files are uploaded by this setup; Python packages are downloaded from package repositories."
& $venvPython -m pip install -r (Join-Path $repoRoot "requirements.txt")
if ($LASTEXITCODE -ne 0) {
  throw "AI dependency installation failed. See the pip error above. Python 3.11 x64 is the recommended version."
}

Write-Host ""
Write-Host "Local AI dependencies are installed."
Write-Host "Next: open a terminal in the desktop folder and run npm install, then npm run dev."
