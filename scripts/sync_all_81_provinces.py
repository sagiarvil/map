"""Stream all 81 Turkish provinces from AWS S3 Overture Maps GeoParquet into SQLite."""
from __future__ import annotations

import math
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from overturemaps import core as overture_core  # noqa: E402

import catalog  # noqa: E402
from app import Store  # noqa: E402

# Official 81 Turkish Province Centroids (lat, lon)
TR_PROVINCE_CENTROIDS: dict[str, tuple[float, float]] = {
    'Adana': (37.0000, 35.3213),
    'Adıyaman': (37.7648, 38.2786),
    'Afyonkarahisar': (38.7507, 30.5567),
    'Ağrı': (39.7191, 43.0503),
    'Aksaray': (38.3687, 34.0370),
    'Amasya': (40.6499, 35.8353),
    'Ankara': (39.9334, 32.8597),
    'Antalya': (36.8969, 30.7133),
    'Ardahan': (41.1105, 42.7022),
    'Artvin': (41.1828, 41.8183),
    'Aydın': (37.8560, 27.8416),
    'Balıkesir': (39.6484, 27.8826),
    'Bartın': (41.6344, 32.3375),
    'Batman': (37.8812, 41.1351),
    'Bayburt': (40.2552, 40.2249),
    'Bilecik': (40.1451, 29.9799),
    'Bingöl': (38.8854, 40.4983),
    'Bitlis': (38.4006, 42.1095),
    'Bolu': (40.7350, 31.6061),
    'Burdur': (37.7203, 30.2908),
    'Bursa': (40.1885, 29.0610),
    'Çanakkale': (40.1553, 26.4142),
    'Çankırı': (40.6013, 33.6134),
    'Çorum': (40.5506, 34.9556),
    'Denizli': (37.7765, 29.0864),
    'Diyarbakır': (37.9144, 40.2306),
    'Düzce': (40.8438, 31.1565),
    'Edirne': (41.6771, 26.5557),
    'Elazığ': (38.6810, 39.2264),
    'Erzincan': (39.7500, 39.5000),
    'Erzurum': (39.9043, 41.2679),
    'Eskişehir': (39.7767, 30.5206),
    'Gaziantep': (37.0662, 37.3833),
    'Giresun': (40.9128, 38.3895),
    'Gümüşhane': (40.4603, 39.4814),
    'Hakkari': (37.5833, 43.7333),
    'Hatay': (36.4018, 36.3498),
    'Iğdır': (39.9167, 44.0333),
    'Isparta': (37.7648, 30.5566),
    'İstanbul': (41.0082, 28.9784),
    'İzmir': (38.4237, 27.1428),
    'Kahramanmaraş': (37.5858, 36.9371),
    'Karabük': (41.2061, 32.6204),
    'Karaman': (37.1759, 33.2287),
    'Kars': (40.6013, 43.0975),
    'Kastamonu': (41.3887, 33.7827),
    'Kayseri': (38.7312, 35.4787),
    'Kırıkkale': (39.8468, 33.5153),
    'Kırklareli': (41.7333, 27.2167),
    'Kırşehir': (39.1425, 34.1709),
    'Kilis': (36.7184, 37.1212),
    'Kocaeli': (40.8533, 29.8815),
    'Konya': (37.8746, 32.4932),
    'Kütahya': (39.4167, 29.9833),
    'Malatya': (38.3552, 38.3095),
    'Manisa': (38.6191, 27.4289),
    'Mardin': (37.3212, 40.7245),
    'Mersin': (36.8121, 34.6415),
    'Muğla': (37.2153, 28.3636),
    'Muş': (38.7432, 41.5065),
    'Nevşehir': (38.6244, 34.7239),
    'Niğde': (37.9667, 34.6833),
    'Ordu': (40.9839, 37.8764),
    'Osmaniye': (37.0742, 36.2478),
    'Rize': (41.0201, 40.5234),
    'Sakarya': (40.7569, 30.3783),
    'Samsun': (41.2867, 36.3300),
    'Siirt': (37.9333, 41.9500),
    'Sinop': (42.0231, 35.1531),
    'Sivas': (39.7477, 37.0179),
    'Şanlıurfa': (37.1591, 38.7969),
    'Şırnak': (37.5164, 42.4611),
    'Tekirdağ': (40.9833, 27.5167),
    'Tokat': (40.3167, 36.5500),
    'Trabzon': (41.0027, 39.7168),
    'Tunceli': (39.1079, 39.5401),
    'Uşak': (38.6823, 29.4082),
    'Van': (38.4891, 43.4089),
    'Yalova': (40.6500, 29.2667),
    'Yozgat': (39.8181, 34.8147),
    'Zonguldak': (41.4564, 31.7987),
}

TR_81_SET = set(TR_PROVINCE_CENTROIDS.keys())


def nearest_tr_province(lat: float, lon: float) -> str:
    best_prov = ''
    best_d2 = 999.0
    cos_lat = math.cos(math.radians(lat))
    for prov, (plat, plon) in TR_PROVINCE_CENTROIDS.items():
        dlat = lat - plat
        dlon = (lon - plon) * cos_lat
        d2 = dlat * dlat + dlon * dlon
        if d2 < best_d2:
            best_d2 = d2
            best_prov = prov
    return best_prov if best_d2 <= 0.68 * 0.68 else ''


def _has_explicit_tr_country(f: dict[str, Any]) -> tuple[bool, bool]:
    """Return (has_foreign_country, has_tr_country)."""
    addrs = (f.get('properties') or {}).get('addresses')
    if not isinstance(addrs, list):
        return False, False
    has_foreign = False
    has_tr = False
    for a in addrs:
        if isinstance(a, dict):
            c = str(a.get('country') or '').strip().upper()
            if c == 'TR':
                has_tr = True
            elif c:
                has_foreign = True
    return has_foreign, has_tr


def _fetch_tile_pairs(
    tile: tuple[float, float, float, float],
    skip_provinces: set[str],
) -> tuple[int, list[tuple[tuple[Any, ...], tuple[str, str, str, str, str]]]]:
    tw, ts, te, tn = tile
    src_label = f'{catalog.SOURCE} / PyArrow S3 TR-81, bbox {tw:.2f},{ts:.2f},{te:.2f},{tn:.2f}'
    read_cnt = 0
    out_pairs: list[tuple[tuple[Any, ...], tuple[str, str, str, str, str]]] = []
    try:
        reader = overture_core.record_batch_reader(
            'place',
            bbox=(tw, ts, te, tn),
            connect_timeout=15,
            request_timeout=60,
        )
        if reader is None:
            return 0, out_pairs
        for batch in reader:
            rows = batch.to_pylist()
            read_cnt += len(rows)
            for raw in rows:
                f = catalog._arrow_row_to_feature(raw)
                if f is None:
                    continue
                has_foreign, has_tr = _has_explicit_tr_country(f)
                if has_foreign and not has_tr:
                    continue
                # First probe metadata without fallback province
                m_probe = catalog.meta(f, str(f.get('id') or ''), ', Türkiye')
                prov = m_probe[1]
                if prov not in TR_81_SET:
                    if not has_tr:
                        continue
                    xy = f['geometry']['coordinates']
                    prov = nearest_tr_province(float(xy[1]), float(xy[0]))
                    if prov not in TR_81_SET:
                        continue
                if prov in skip_provinces:
                    continue
                reg = f'{prov}, Türkiye'
                rec = catalog.feature(f, reg, src_label)
                if rec is None:
                    continue
                m_final = (rec[0], prov, m_probe[2], m_probe[3], m_probe[4])
                out_pairs.append((rec, m_final))
    except Exception as exc:
        print(f'[WARN] Tile {tile} error: {exc}', flush=True)
    return read_cnt, out_pairs


def main() -> None:
    t0 = time.perf_counter()
    db_path = ROOT / 'data' / 'leads.sqlite3'
    store = Store(db_path)

    with store.db() as c:
        existing_counts = {
            r[0].split(',')[0].strip(): int(r[1])
            for r in c.execute(
                "SELECT region, count(*) FROM places WHERE region LIKE '%, Türkiye' GROUP BY region"
            )
        }

    skip_provs = {p for p, cnt in existing_counts.items() if p in TR_81_SET and cnt >= 5_000}
    missing_provs = sorted(TR_81_SET - skip_provs)
    print(
        f'Mevcut büyük iller ({len(skip_provs)}): {sorted(skip_provs)}\n'
        f'S3 GeoParquet ile çekilecek iller ({len(missing_provs)}): {missing_provs}',
        flush=True,
    )

    if missing_provs:
        tiles = catalog.split_bbox(25.66, 35.80, 44.83, 42.11, max_tile_area=3.2)
        print(f'Türkiye 81 İl BBox {len(tiles)} Quadtree karosuna bölündü (8 paralel S3 akışı)…', flush=True)

        total_read = 0
        total_inserted = 0
        touched_provinces: set[str] = set()

        with ThreadPoolExecutor(max_workers=8) as pool:
            futs = {pool.submit(_fetch_tile_pairs, tile, skip_provs): idx for idx, tile in enumerate(tiles)}
            done_tiles = 0
            pending_buf: list[tuple[tuple[Any, ...], tuple[str, str, str, str, str]]] = []
            for fut in as_completed(futs):
                done_tiles += 1
                rcnt, pairs = fut.result()
                total_read += rcnt
                for rec, m_rec in pairs:
                    touched_provinces.add(m_rec[1])
                pending_buf.extend(pairs)
                if len(pending_buf) >= 20_000:
                    catalog._upsert_pairs(store, pending_buf)
                    total_inserted += len(pending_buf)
                    pending_buf.clear()
                if done_tiles % 8 == 0 or done_tiles == len(tiles):
                    print(
                        f'  [{done_tiles}/{len(tiles)} karo] S3 okunan: {total_read:,} | '
                        f'Yeni il kaydı yazılan: {total_inserted + len(pending_buf):,}',
                        flush=True,
                    )
            if pending_buf:
                catalog._upsert_pairs(store, pending_buf)
                total_inserted += len(pending_buf)
                pending_buf.clear()

        print(f'Tekilleştirme (Deduplication) çalışıyor ({len(touched_provinces)} il)…', flush=True)
        for prov in sorted(touched_provinces):
            catalog.deduplicate_region(store, f'{prov}, Türkiye')

    # Verify all 81 provinces exist; top up any tiny province with < 25 rows via targeted bbox download
    with store.db() as c:
        final_counts = {
            r[0].split(',')[0].strip(): int(r[1])
            for r in c.execute(
                "SELECT region, count(*) FROM places WHERE region LIKE '%, Türkiye' GROUP BY region"
            )
        }

    for prov in sorted(TR_81_SET):
        if final_counts.get(prov, 0) < 25:
            plat, plon = TR_PROVINCE_CENTROIDS[prov]
            box_str = f'{plon - 0.22:.4f},{plat - 0.18:.4f},{plon + 0.22:.4f},{plat + 0.18:.4f}'
            print(f'  [Tamamlama] {prov} ({final_counts.get(prov, 0)} kayıt) -> {box_str}', flush=True)
            try:
                catalog.download(store, f'{prov}, Türkiye', box=box_str, source_mode='hybrid')
            except Exception as exc:
                print(f'  [WARN] {prov} top-up: {exc}', flush=True)

    with store.db() as c:
        c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        prov_rows = c.execute(
            "SELECT region, count(*) FROM places WHERE region LIKE '%, Türkiye' GROUP BY region ORDER BY count(*) DESC"
        ).fetchall()
        grand_total = sum(int(r[1]) for r in prov_rows)

    dt = time.perf_counter() - t0
    print(
        f'\nTAMAMLANDI ({dt:.1f} sn): {len(prov_rows)}/81 İl SQLite Veritabanında Hazır | '
        f'Toplam Firma: {grand_total:,}',
        flush=True,
    )


if __name__ == '__main__':
    main()
