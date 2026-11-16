$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

if (-not (Test-Path -LiteralPath ".\.venv\Scripts\python.exe")) {
  Write-Error "Ilk kurulum gerekli: .\setup-windows.bat calistirin."
  exit 1
}
& .\.venv\Scripts\python.exe app.py @args
