#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "HATA: python3 bulunamadı. Lütfen Python 3.11+ kurun (örn: sudo apt install python3 python3-venv)." >&2
  exit 1
fi

"$PYTHON_BIN" -c 'import sys; assert sys.version_info >= (3, 11), "Python 3.11+ gerekli"'

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY_RUN_OK: Linux kurulum ortamı doğrulandı ($("$PYTHON_BIN" --version))"
  exit 0
fi

"$PYTHON_BIN" -m venv .venv
.venv/bin/python -m pip install --upgrade pip -q
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m pip check
.venv/bin/overturemaps --help >/dev/null
.venv/bin/python -m unittest discover -s tests -q
exec .venv/bin/python app.py "$@"
