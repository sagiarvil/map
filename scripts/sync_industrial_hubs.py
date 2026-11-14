"""High-speed parallel multi-province S3 GeoParquet + Overpass ingestion, hygiene purge, spatial deduplication, and 128-coroutine Lexbor crawl burst."""
from __future__ import annotations

import asyncio
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import overturemaps.core as overture_core  # noqa: E402

import app as app_mod  # noqa: E402
import catalog  # noqa: E402
import engine  # noqa: E402

# Turkey's Top 12 Industrial, Manufacturing & Commercial Hubs (OSB, Furniture, Machinery, Construction, Logistics, Tech)
INDUSTRIAL_HUBS: list[tuple[str, tuple[float, float, float, float]]] = [
    ('İzmir, Türkiye', (26.20, 37.80, 28.50, 39.40)),
    ('İstanbul, Türkiye', (28.45, 40.80, 29.55, 41.32)),
    ('Ankara, Türkiye', (32.35, 39.70, 33.15, 40.20)),
    ('Bursa, Türkiye', (28.75, 39.95, 29.70, 40.35)),
    ('Kayseri, Türkiye', (35.25, 38.60, 35.70, 38.88)),
    ('Konya, Türkiye', (32.35, 37.75, 32.70, 38.05)),
    ('Kocaeli, Türkiye', (29.30, 40.70, 30.10, 40.95)),
    ('Gaziantep, Türkiye', (37.20, 37.00, 37.55, 37.25)),
    ('Antalya, Türkiye', (30.50, 36.75, 31.25, 37.05)),
    ('Adana, Türkiye', (35.15, 36.90, 35.65, 37.15)),
    ('Denizli, Türkiye', (28.95, 37.70, 29.30, 37.90)),
    ('Manisa, Türkiye', (27.30, 38.55, 27.60, 38.72)),
]


def purge_legacy_junk_contacts(store: app_mod.Store) -> tuple[int, int]:
    """Purge any previously crawled webfont/tracker/junk emails and repeated-digit fake phones."""
    bad_contact_ids: list[int] = []
    bad_phones: list[tuple[int, str]] = []
    with store.db() as c:
        for row in c.execute('SELECT id, email FROM contacts'):
            if not catalog._clean_poi_email(row['email']):
                bad_contact_ids.append(int(row['id']))
        for row in c.execute('SELECT job_id, phone FROM job_phones'):
            if not engine.phone_normalize(row['phone']):
                bad_phones.append((int(row['job_id']), str(row['phone'])))

        if bad_contact_ids:
            for idx in range(0, len(bad_contact_ids), 500):
                chunk = bad_contact_ids[idx:idx + 500]
                ph = ','.join('?' for _ in chunk)
                c.execute(f'DELETE FROM contacts WHERE id IN ({ph})', chunk)
        if bad_phones:
            c.executemany('DELETE FROM job_phones WHERE job_id=? AND phone=?', bad_phones)

    return len(bad_contact_ids), len(bad_phones)


def stream_hub_worker(
    store: app_mod.Store,
    db_lock: threading.Lock,
    osm_sem: threading.Semaphore,
    region: str,
    bbox: tuple[float, float, float, float],
) -> dict[str, Any]:
    t0 = time.monotonic()
    w, s, e, n = bbox
    expected_prov = catalog.province_of(region.split(',')[0])
    src_label = f'{catalog.SOURCE} / PyArrow S3, bbox {w},{s},{e},{n}'
    tiles = catalog.split_bbox(w, s, e, n, max_tile_area=3.6)

    read_total = valid_total = 0
    buffer: list[tuple[tuple[Any, ...], tuple[str, str, str, str, str]]] = []

    for tw, ts, te, tn in tiles:
        reader = overture_core.record_batch_reader(
            'place',
            bbox=(tw, ts, te, tn),
            connect_timeout=15,
            request_timeout=60,
        )
        if reader is None:
            continue
        for batch in reader:
            rows = batch.to_pylist()
            read_total += len(rows)
            for raw in rows:
                f = catalog._arrow_row_to_feature(raw)
                if f is None:
                    continue
                rec = catalog.feature(f, region, src_label)
                if rec is None:
                    continue
                m_rec = catalog.meta(f, rec[0], region)
                if expected_prov and m_rec[1] and m_rec[1] != expected_prov:
                    continue
                buffer.append((rec, m_rec))
                valid_total += 1
                if len(buffer) >= 12000:
                    with db_lock:
                        catalog._upsert_pairs(store, buffer)
                    buffer.clear()

    if buffer:
        with db_lock:
            catalog._upsert_pairs(store, buffer)
        buffer.clear()

    # Live OpenStreetMap B2B supplement (furniture, industrial, craft, commercial offices with websites/emails)
    osm_valid = 0
    if region != 'İzmir, Türkiye':  # İzmir OSM already merged; refresh fast for new hubs
        with osm_sem:
            try:
                bb = f'({s},{w},{n},{e})'
                ql = (
                    f'[out:json][timeout:22];('
                    f'nwr["shop"~"furniture|interior_decoration|kitchen|lighting|doors|carpet|curtain|bed|tiles|hardware|doityourself"]{bb};'
                    f'nwr["craft"]{bb};'
                    f'nwr["industrial"]{bb};'
                    f'nwr["office"]["website"]{bb};'
                    f'nwr["contact:email"]{bb};'
                    f');out center tags;'
                )
                elements = catalog._query_overpass(ql, timeout=26)
                with db_lock:
                    osm_stats = catalog._ingest_osm_elements(store, elements, region, f'OpenStreetMap Overpass, bbox {w},{s},{e},{n}')
                    osm_valid = osm_stats['valid']
            except Exception:
                osm_valid = 0

    elapsed = round(time.monotonic() - t0, 1)
    return {
        'region': region,
        'read': read_total,
        'valid': valid_total,
        'osm_valid': osm_valid,
        'seconds': elapsed,
    }


async def turbo_lexbor_enrichment_burst(store: app_mod.Store, max_jobs: int = 550) -> dict[str, int]:
    """Queue high-value industrial/furniture corporate domains across top hubs and crawl with 128 HTTP/2 Lexbor coroutines."""
    store.recover()
    with store.db() as c:
        requeued = c.execute(
            "UPDATE jobs SET status='queued', error='', available=0 WHERE status='empty'"
        ).rowcount

    for hub_reg in ('Bursa, Türkiye', 'Ankara, Türkiye', 'Kayseri, Türkiye', 'İstanbul, Türkiye', 'Konya, Türkiye', 'Kocaeli, Türkiye'):
        catalog.queue(store, 'Mobilya', hub_reg, minimum=0.70, limit=95)

    batch: list[dict[str, Any]] = []
    while len(batch) < max_jobs:
        chunk = store.claim_batch(min(64, max_jobs - len(batch)))
        if not chunk:
            break
        batch.extend(chunk)

    if not batch:
        return {'crawled': 0, 'emails_found': 0, 'phones_found': 0, 'requeued': requeued}

    sem = asyncio.Semaphore(128)
    emails_found = 0
    phones_found = 0
    crawled = 0
    outcomes: list[tuple[str, dict[str, Any], Any, bool, bool]] = []

    async with engine.AsyncCrawlSession(concurrency=128) as session:
        async def run_one(job: dict[str, Any]) -> None:
            nonlocal emails_found, phones_found, crawled
            async with sem:
                try:
                    res = await asyncio.wait_for(
                        engine.async_crawl(session, job['url'], pages=4),
                        timeout=14.0,
                    )
                    outcomes.append(('ok', job, res, False, False))
                    emails_found += len(res['contacts'])
                    phones_found += len(res['phones'])
                    crawled += 1
                except engine.ScanError as err:
                    outcomes.append(('fail', job, str(err), False, False))
                except Exception as err:
                    outcomes.append(('fail', job, f'Zaman aşımı / Bağlantı ({type(err).__name__})', False, False))

        await asyncio.gather(*(run_one(j) for j in batch))

    for idx in range(0, len(outcomes), 100):
        store.flush_outcomes(outcomes[idx:idx + 100])

    return {
        'crawled': crawled,
        'emails_found': emails_found,
        'phones_found': phones_found,
        'requeued': requeued,
    }


def main() -> None:
    crawl_only = '--crawl-only' in sys.argv
    t_start = time.monotonic()
    db_path = ROOT / 'data' / 'leads.sqlite3'
    store = app_mod.Store(db_path)
    try:
        purged_em, purged_ph = purge_legacy_junk_contacts(store)
        print(f'[1/4] Hijyen temizliği: {purged_em} çöp e-posta, {purged_ph} sahte telefon temizlendi.', flush=True)

        total_deduped = 0
        if not crawl_only:
            db_lock = threading.Lock()
            osm_sem = threading.Semaphore(2)
            print(f'[2/4] {len(INDUSTRIAL_HUBS)} büyük sanayi & ticaret ili paralel C++ PyArrow S3 + Overpass ile çekiliyor...', flush=True)
            with ThreadPoolExecutor(max_workers=6) as pool:
                futs = {
                    pool.submit(stream_hub_worker, store, db_lock, osm_sem, reg, box): reg
                    for reg, box in INDUSTRIAL_HUBS
                }
                for fut in as_completed(futs):
                    st = fut.result()
                    print(
                        f"  -> {st['region']:<18} | Overture: {st['valid']:>7,} | OSM: +{st['osm_valid']:>5,} | Süre: {st['seconds']:>4.1f}s",
                        flush=True,
                    )

            print('[3/4] Mekansal tekilleştirme (55m + marka/telefon birleştirme) çalışıyor...', flush=True)
            for reg, _ in INDUSTRIAL_HUBS:
                dropped = catalog.deduplicate_region(store, reg)
                total_deduped += dropped
                if dropped:
                    print(f'  -> {reg:<18}: {dropped:,} mükerrer kayıt birleştirildi', flush=True)

            with store.db() as c:
                c.execute("INSERT INTO places_fts(places_fts) VALUES('optimize')")

        print('[4/4] 128-Korutin HTTP/2 + C99 Lexbor + SPA (__NEXT_DATA__) hızlı zenginleştirme turu...', flush=True)
        burst = asyncio.run(turbo_lexbor_enrichment_burst(store, max_jobs=550))
        print(
            f"  -> Taranan Site: {burst['crawled']} | Yeni Kurumsal E-posta: +{burst['emails_found']} | Telefon: +{burst['phones_found']}",
            flush=True,
        )

        with store.db() as c:
            total_places = c.execute('SELECT count(*) FROM places').fetchone()[0]
            total_web = c.execute("SELECT count(*) FROM places WHERE website!=''").fetchone()[0]
            total_contacts = c.execute("SELECT count(DISTINCT email) FROM contacts WHERE mx NOT IN ('nxdomain','null_mx')").fetchone()[0]
            meta_emails = c.execute("SELECT count(*) FROM place_meta WHERE emails!='[]'").fetchone()[0]
            meta_phones = c.execute("SELECT count(*) FROM place_meta WHERE phones!='[]'").fetchone()[0]

        print(
            f'\nTAMAMLANDI ({time.monotonic() - t_start:.1f}s): '
            f'Toplam Tekil Firma: {total_places:,} | Web Siteli: {total_web:,} | '
            f'Doğrudan E-postalı POI: {meta_emails:,} | Taranan Kurumsal E-posta: {total_contacts:,} | '
            f'Telefonlu POI: {meta_phones:,} | Birleştirilen Mükerrer: {total_deduped:,}',
            flush=True,
        )
    finally:
        store.close()


if __name__ == '__main__':
    main()
