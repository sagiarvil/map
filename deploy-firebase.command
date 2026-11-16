#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
command -v firebase >/dev/null || { echo 'Firebase CLI gerekli: npm install -g firebase-tools'; exit 1; }

PYBIN=".venv/bin/python"
if [[ ! -x "$PYBIN" ]]; then
  PYBIN="python3"
fi

# 1. Yerel SQLite kataloğundan sıkıştırılmış CDN shard paketlerini üret (--rebuild-shards verilirse)
if [[ "${1:-}" == "--rebuild-shards" ]]; then
  "$PYBIN" scripts/build_shards.py
fi

# 2. Yalnızca dağıtılabilir V6 Pro kaynak kodlarını paketle (müşteri verisi ve .venv hariç)
"$PYBIN" - <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

out = Path('hosting/downloads/lead-intelligence-pro.zip')
out.parent.mkdir(parents=True, exist_ok=True)
files = [
    Path(x) for x in [
        'app.py', 'engine.py', 'catalog.py', 'export_xlsx.py', 'industrial_engine.py',
        'requirements.txt', 'setup.command', 'start.command', 'install-mac-service.command',
        'setup-linux.sh', 'start-linux.sh', 'install-linux-service.sh',
        'setup-windows.ps1', 'setup-windows.bat', 'start-windows.ps1', 'start-windows.bat', 'install-windows-service.ps1',
        'functions/package.json', 'functions/index.js',
        'README.md', 'TEST_REPORT.txt', 'import_template.csv',
        'hosting/index.html', 'hosting/app.js', 'hosting/style.css', 'hosting/xlsx-engine.js',
    ]
]
files += list(Path('tests').glob('*.py')) + list(Path('scripts').glob('*.py'))
with ZipFile(out, 'w', ZIP_DEFLATED) as z:
    for p in files:
        if p.is_file():
            z.write(p, Path('lead_intelligence_pro') / p)
print('ZIP paketlendi:', out)
PY

# 3. Firebase Hosting (https://haritalar.web.app) dağıtımı
firebase deploy --project erp-proje-51aa1 --only hosting:haritalar
