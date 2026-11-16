#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_FILE="$UNIT_DIR/leadintelligence.service"

mkdir -p "$UNIT_DIR" "$ROOT/data"

if [[ ! -x "$ROOT/.venv/bin/python" && "${DRY_RUN:-0}" != "1" ]]; then
  bash "$ROOT/setup-linux.sh" --no-browser
fi

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Haritalar Lead Intelligence Pro V7 Local Turbo Engine
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
ExecStart=$ROOT/.venv/bin/python $ROOT/app.py --port 8765 --workers 128 --no-browser
Restart=always
RestartSec=3
StandardOutput=append:$ROOT/data/daemon.log
StandardError=append:$ROOT/data/daemon.err.log

[Install]
WantedBy=default.target
EOF

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY_RUN_OK: systemd birim dosyası üretildi -> $UNIT_FILE"
  exit 0
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload
  systemctl --user enable --now leadintelligence.service
  echo "Lead Intelligence Pro servisi aktif: http://127.0.0.1:8765"
else
  echo "Uyarı: systemctl bulunamadı; birim dosyası $UNIT_FILE konumuna yazıldı." >&2
fi
