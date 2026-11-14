#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
python3 -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11+ gerekli: https://www.python.org/downloads/macos/"'
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip -q
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m pip check
.venv/bin/overturemaps --help >/dev/null
.venv/bin/python -m unittest discover -s tests -v
exec .venv/bin/python app.py
