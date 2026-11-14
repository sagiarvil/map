#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.sagiarvil.leadintelligence.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/data"

if [[ ! -x "$ROOT/.venv/bin/python" ]]; then
  "$ROOT/setup.command"
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sagiarvil.leadintelligence</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ROOT/.venv/bin/python</string>
    <string>$ROOT/app.py</string>
    <string>--port</string>
    <string>8765</string>
    <string>--workers</string>
    <string>128</string>
    <string>--no-browser</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$ROOT/data/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>$ROOT/data/daemon.err.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/com.sagiarvil.leadintelligence" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Lead Intelligence Pro V3 Turbo servisi aktif: http://127.0.0.1:8765 (haritalar.web.app köprüsü açık)"
