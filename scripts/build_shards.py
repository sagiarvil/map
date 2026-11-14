"""Build compact dictionary-encoded V4 CDN data shards for Firebase Hosting (haritalar.web.app)."""
from __future__ import annotations

import gzip
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import catalog  # noqa: E402


def slugify_city(region: str) -> str:
    head = region.split(',')[0].strip()
    prov = catalog.province_of(head) or head
    return catalog.fold(prov).replace(' ', '-')


def build_shards(db_path: Path, out_dir: Path, min_rows: int = 0) -> dict[str, object]:
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in list(out_dir.glob('*.json')) + list(out_dir.glob('*.gz')):
        if stale.name != 'manifest.json':
            stale.unlink()
    if not db_path.exists():
        manifest = {'version': 4, 'shards': {}, 'districts': {}, 'taxonomy': {}}
        (out_dir / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
        return manifest

    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        excluded = {r[0] for r in conn.execute('SELECT email FROM suppression')}
        place_emails: dict[str, set[str]] = defaultdict(set)
        for pid, em in conn.execute(
            "SELECT l.place_id, t.email FROM place_jobs l JOIN contacts t ON t.job_id=l.job_id "
            "WHERE t.mx NOT IN ('nxdomain', 'null_mx')"
        ):
            if em not in excluded:
                place_emails[pid].add(em)

        place_phones: dict[str, set[str]] = defaultdict(set)
        for pid, ph in conn.execute(
            'SELECT l.place_id, t.phone FROM place_jobs l JOIN job_phones t ON t.job_id=l.job_id'
        ):
            place_phones[pid].add(ph)

        regions = [
            r[0]
            for r in conn.execute(
                'SELECT region FROM places GROUP BY region HAVING count(*) >= ? ORDER BY region',
                (min_rows,),
            )
        ]
        shards_meta: dict[str, dict[str, object]] = {}
        discovered_districts: dict[str, set[str]] = {
            k: set(v) for k, v in catalog.PROVINCE_DISTRICTS.items()
        }

        for reg in regions:
            slug = slugify_city(reg)
            if not slug:
                continue
            city_name = catalog.province_of(reg.split(',')[0]) or reg.split(',')[0].strip()
            cat_map: dict[str, int] = {}
            cats: list[str] = []
            dist_map: dict[str, int] = {'': 0}
            dists: list[str] = ['']
            rows_out: list[list[object]] = []

            websites = with_email = with_phone = with_both = 0
            cur = conn.execute(
                '''SELECT p.id, p.name, p.category, p.search_text, p.address,
                          p.lat, p.lon, p.website, p.confidence,
                          m.province, m.district, m.emails, m.phones
                   FROM places p LEFT JOIN place_meta m ON m.place_id = p.id
                   WHERE p.region = ?''',
                (reg,),
            )
            for r in cur:
                pid = r['id']
                cat_clean = (r['category'] or 'business').replace('_', ' ').strip()
                c_idx = cat_map.get(cat_clean)
                if c_idx is None:
                    c_idx = len(cats)
                    cat_map[cat_clean] = c_idx
                    cats.append(cat_clean)

                dist_clean = (r['district'] or '').strip()
                if dist_clean and len(dist_clean) <= 45:
                    discovered_districts.setdefault(city_name, set()).add(dist_clean)
                d_idx = dist_map.get(dist_clean)
                if d_idx is None:
                    d_idx = len(dists)
                    dist_map[dist_clean] = d_idx
                    dists.append(dist_clean)

                ems = sorted((set(json.loads(r['emails'] or '[]')) - excluded) | place_emails.get(pid, set()))
                phs = sorted(set(json.loads(r['phones'] or '[]')) | place_phones.get(pid, set()))
                site = r['website'] or ''
                if site:
                    websites += 1
                if ems:
                    with_email += 1
                if phs:
                    with_phone += 1
                if ems and phs:
                    with_both += 1

                # Pre-fold name + extra taxonomy tokens (excluding category tokens already in cats[c_idx])
                cat_tokens = set(catalog.fold(cat_clean).split())
                row_tokens = [tok for tok in (r['search_text'] or '').split() if tok not in cat_tokens]
                search_tokens = ' '.join(dict.fromkeys(row_tokens[:22]))

                rows_out.append([
                    r['name'],
                    c_idx,
                    d_idx,
                    site,
                    ems,
                    phs,
                    r['address'] or '',
                    round(float(r['lat']), 5),
                    round(float(r['lon']), 5),
                    int(round(float(r['confidence'] or 0.75) * 100)),
                    search_tokens,
                ])

            # Quality-first ranking: verified email+phone -> email -> site+phone -> site -> phone -> confidence
            rows_out.sort(
                key=lambda x: (
                    int(bool(x[4]) and bool(x[5])),
                    int(bool(x[4])),
                    int(bool(x[3]) and bool(x[5])),
                    int(bool(x[3])),
                    int(bool(x[5])),
                    int(x[9]),  # type: ignore[arg-type]
                ),
                reverse=True,
            )

            payload = {
                'v': 4,
                'city': city_name,
                'region': reg,
                'cats': cats,
                'dists': dists,
                'rows': rows_out,
            }
            raw_json = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            gz_bytes = gzip.compress(raw_json, compresslevel=9)
            shard_file = out_dir / f'{slug}.json.gz'
            shard_file.write_bytes(gz_bytes)

            shards_meta[slug] = {
                'city': city_name,
                'region': reg,
                'file': f'/data/{slug}.json.gz',
                'count': len(rows_out),
                'websites': websites,
                'emails': with_email,
                'phones': with_phone,
                'both': with_both,
                'raw_bytes': len(raw_json),
                'gzip_bytes': len(gz_bytes),
            }

        taxonomy_export = {
            catalog.fold(k): [catalog.fold(x) for x in v.split('|') if x.strip()]
            for k, v in catalog.ALIASES.items()
        }
        manifest = {
            'version': 4,
            'shards': shards_meta,
            'districts': {k: sorted(v) for k, v in discovered_districts.items() if v},
            'taxonomy': taxonomy_export,
        }
        (out_dir / 'manifest.json').write_text(
            json.dumps(manifest, ensure_ascii=False, separators=(',', ':')),
            encoding='utf-8',
        )
        return manifest
    finally:
        conn.close()


if __name__ == '__main__':
    res = build_shards(ROOT / 'data' / 'leads.sqlite3', ROOT / 'hosting' / 'data', min_rows=15_000)
    total_firms = 0
    for slug, info in res.get('shards', {}).items():  # type: ignore[union-attr]
        total_firms += int(info['count'])  # type: ignore[arg-type]
        print(
            f"Shard [{slug}]: {info['count']:,} firma | "
            f"Site: {info['websites']:,} | E-posta: {info['emails']:,} | Tel: {info['phones']:,} | "
            f"Gzip CDN: {info['gzip_bytes']/1048576:.2f} MB"
        )
    print(f'TOPLAM CDN HAZIR FİRMA: {total_firms:,}')
