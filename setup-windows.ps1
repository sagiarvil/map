$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$pyCmd = $null
foreach ($cand in @("py", "python", "python3")) {
  if (Get-Command $cand -ErrorAction SilentlyContinue) {
    $pyCmd = $cand
    break
  }
}
if (-not $pyCmd) {
  Write-Error "Python 3.11+ bulunamadi. Lutfen https://www.python.org/downloads/windows/ adresinden kurun."
  exit 1
}

& $pyCmd -c "import sys; assert sys.version_info >= (3, 11), 'Python 3.11+ gerekli'"
& $pyCmd -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip -q
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
& .\.venv\Scripts\python.exe -m pip check
& .\.venv\Scripts\overturemaps.exe --help | Out-Null
& .\.venv\Scripts\python.exe -m unittest discover -s tests -q
& .\.venv\Scripts\python.exe app.py @args
