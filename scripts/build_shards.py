"""Build compact dictionary-encoded CDN data shards for Firebase Hosting (haritalar.web.app)."""
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


def build_shards(db_path: Path, out_dir: Path) -> dict[str, object]:
    out_dir.mkdir(parents=True, exist_ok=True)
    if not db_path.exists():
        manifest = {'version': 3, 'shards': {}}
        (out_dir / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
        return manifest

    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        excluded = {r[0] for r in conn.execute('SELECT email FROM suppression')}
        place_emails: dict[str, set[str]] = defaultdict(set)
        for pid, em in conn.execute(
            'SELECT l.place_id, t.email FROM place_jobs l JOIN contacts t ON t.job_id=l.job_id'
        ):
            if em not in excluded:
                place_emails[pid].add(em)

        place_phones: dict[str, set[str]] = defaultdict(set)
        for pid, ph in conn.execute(
            'SELECT l.place_id, t.phone FROM place_jobs l JOIN job_phones t ON t.job_id=l.job_id'
        ):
            place_phones[pid].add(ph)

        regions = [r[0] for r in conn.execute('SELECT DISTINCT region FROM places ORDER BY region')]
        shards_meta: dict[str, dict[str, object]] = {}

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

            websites = with_email = with_phone = 0
            cur = conn.execute(
                '''SELECT p.id, p.name, p.category, p.search_text, p.address,
                          p.lat, p.lon, p.website, p.confidence,
                          m.province, m.district, m.emails, m.phones
                   FROM places p LEFT JOIN place_meta m ON m.place_id = p.id
                   WHERE p.region = ?
                   ORDER BY (p.website != '') DESC, p.confidence DESC, p.id''',
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

                # Store only extra taxonomy tokens not already in folded name + category
                base_tokens = set(catalog.fold(r['name'] + ' ' + cat_clean).split())
                extra_tokens = [tok for tok in (r['search_text'] or '').split() if tok not in base_tokens]
                extra_str = ' '.join(extra_tokens[:16])

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
                    extra_str,
                ])

            payload = {
                'v': 3,
                'city': city_name,
                'region': reg,
                'cats': cats,
                'dists': dists,
                'rows': rows_out,
            }
            raw_json = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            shard_file = out_dir / f'{slug}.json'
            shard_file.write_bytes(raw_json)
            gz_size = len(gzip.compress(raw_json, compresslevel=6))

            shards_meta[slug] = {
                'city': city_name,
                'region': reg,
                'file': f'/data/{slug}.json',
                'count': len(rows_out),
                'websites': websites,
                'emails': with_email,
                'phones': with_phone,
                'raw_bytes': len(raw_json),
                'gzip_bytes': gz_size,
            }

        # Export full sector taxonomy dictionary so browser FTS matches Python V3 1:1
        taxonomy_export = {
            catalog.fold(k): [catalog.fold(x) for x in v.split('|') if x.strip()]
            for k, v in catalog.ALIASES.items()
        }
        manifest = {
            'version': 3,
            'shards': shards_meta,
            'districts': {k: list(v) for k, v in catalog.PROVINCE_DISTRICTS.items()},
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
    res = build_shards(ROOT / 'data' / 'leads.sqlite3', ROOT / 'hosting' / 'data')
    for slug, info in res.get('shards', {}).items():  # type: ignore[union-attr]
        print(
            f"Shard [{slug}]: {info['count']:,} işletme | "
            f"Site: {info['websites']:,} | E-posta: {info['emails']:,} | Tel: {info['phones']:,} | "
            f"Raw: {info['raw_bytes']/1048576:.2f} MB | Gzip CDN: {info['gzip_bytes']/1048576:.2f} MB"
        )
