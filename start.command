#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then echo 'İlk kurulum: bash setup.command'; exit 1; fi
exec .venv/bin/python app.py "$@"
