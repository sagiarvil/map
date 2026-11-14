#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
command -v firebase >/dev/null || { echo 'Firebase CLI gerekli: npm install -g firebase-tools'; exit 1; }
# Yalnızca dağıtılabilir kaynaklar; veritabanları, kimlik bilgileri ve müşteri verisi dahil edilmez.
python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
out=Path('hosting/downloads/lead-intelligence-pro.zip');out.parent.mkdir(parents=True,exist_ok=True)
files=[Path(x) for x in ['app.py','engine.py','catalog.py','export_xlsx.py','requirements.txt','setup.command','start.command','README.md','TEST_REPORT.txt','import_template.csv']]
files+=list(Path('static').glob('*'))+list(Path('tests').glob('*.py'))
with ZipFile(out,'w',ZIP_DEFLATED) as z:
    for p in files:
        if p.is_file():z.write(p,Path('lead_intelligence_pro')/p)
print(out)
PY
firebase deploy --project erp-proje-51aa1 --only hosting:haritalar
