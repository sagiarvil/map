#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -x .venv/bin/python ]]; then
  echo "İlk kurulum gerekli: bash setup-linux.sh" >&2
  exit 1
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY_RUN_OK: .venv/bin/python mevcut"
  exit 0
fi

exec .venv/bin/python app.py "$@"
