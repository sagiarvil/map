"""Lead Intelligence Pro V3 — Local Industrial B2B Geospatial & Async Research Server."""
from __future__ import annotations

import argparse
import asyncio
import csv
import datetime
import io
import inspect
import json
import os
import secrets
import shutil
import sqlite3
import sys
import tempfile
import threading
import time
import weakref
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import parse_qs, urlsplit

import catalog
import engine
import industrial_engine
try:
    import orjson as _orjson
except ImportError:  # pragma: no cover
    _orjson = None  # type: ignore[assignment]
from engine import (
    AsyncCrawlSession,
    Fetcher,
    ScanError,
    async_crawl,
    crawl,
    discover,
    domain_key,
    normalize,
    now,
)
from export_xlsx import generate as generate_xlsx

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('LEAD_DATA', str(ROOT / 'data'))).expanduser()
TOKEN = secrets.token_urlsafe(32)

SCHEMA = '''
CREATE TABLE IF NOT EXISTS jobs(
 id INTEGER PRIMARY KEY, url TEXT NOT NULL, domain TEXT NOT NULL, sector TEXT NOT NULL,
 region TEXT NOT NULL, origin TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
 pages INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '',
 added TEXT NOT NULL, updated TEXT NOT NULL, available REAL NOT NULL DEFAULT 0,
 UNIQUE(domain, sector, region));
CREATE TABLE IF NOT EXISTS contacts(
 id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 email TEXT NOT NULL, source TEXT NOT NULL, mx TEXT NOT NULL,
 same_domain INTEGER NOT NULL, seen TEXT NOT NULL, UNIQUE(job_id, email));
CREATE TABLE IF NOT EXISTS job_phones(
 job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 phone TEXT NOT NULL, PRIMARY KEY(job_id, phone));
CREATE TABLE IF NOT EXISTS job_meta(
 job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
 province TEXT NOT NULL DEFAULT '', district TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS suppression(email TEXT PRIMARY KEY, added TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO config VALUES('paused', '0');
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, available, id);
CREATE INDEX IF NOT EXISTS jobs_domain_sec_reg ON jobs(domain, sector, region);
CREATE INDEX IF NOT EXISTS contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS contacts_job ON contacts(job_id);
'''


class Store:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._conns_lock = threading.Lock()
        self._conns: list[sqlite3.Connection] = []
        self._finalizer = weakref.finalize(self, Store._cleanup_conns, self._conns, self._conns_lock)
        with self.db() as c:
            c.execute('PRAGMA journal_mode=WAL')
            c.execute('PRAGMA synchronous=NORMAL')
            c.executescript(SCHEMA)
            c.executescript(catalog.SCHEMA)
            if catalog.HAS_FTS5:
                p_cnt = c.execute('SELECT count(*) FROM places').fetchone()[0]
                if p_cnt > 0:
                    f_cnt = c.execute('SELECT count(*) FROM places_fts').fetchone()[0]
                    if f_cnt == 0:
                        c.execute("INSERT INTO places_fts(places_fts) VALUES('rebuild')")

    def _get_conn(self) -> sqlite3.Connection:
        c: sqlite3.Connection | None = getattr(self._local, 'conn', None)
        if c is None:
            c = sqlite3.connect(self.path, timeout=30.0, check_same_thread=False)
            c.row_factory = sqlite3.Row
            c.execute('PRAGMA foreign_keys=ON')
            c.execute('PRAGMA busy_timeout=30000')
            c.execute('PRAGMA synchronous=NORMAL')
            c.execute('PRAGMA temp_store=MEMORY')
            c.execute('PRAGMA cache_size=-32768')
            c.execute('PRAGMA mmap_size=134217728')
            self._local.conn = c
            with self._conns_lock:
                self._conns.append(c)
        return c

    @staticmethod
    def _cleanup_conns(conns: list[sqlite3.Connection], lock: threading.Lock) -> None:
        with lock:
            items = list(conns)
            conns.clear()
        for c in items:
            try:
                c.close()
            except sqlite3.Error:
                pass

    def close(self) -> None:
        self._local = threading.local()
        Store._cleanup_conns(self._conns, self._conns_lock)

    @contextmanager
    def db(self) -> Iterator[sqlite3.Connection]:
        c = self._get_conn()
        try:
            with c:
                yield c
        finally:
            if c.in_transaction:
                c.rollback()

    def add(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        accepted = duplicates = 0
        rejected: list[dict[str, Any]] = []
        prepared: list[tuple[str, str, str, str, str, str, str]] = []
        stamp = now()
        for i, r in enumerate(rows):
            try:
                u = normalize(str(r.get('url', '')))
                sec = str(r.get('sector', '')).strip()[:200]
                reg = str(r.get('region', '')).strip()[:200]
                origin = str(r.get('origin', '')).strip()[:1000]
                if not sec or not reg or not origin:
                    raise ScanError('Sektör, bölge ve kaynak zorunlu')
                prepared.append((u, domain_key(u), sec, reg, origin, stamp, stamp))
            except (ScanError, AttributeError) as e:
                rejected.append({'row': i + 1, 'reason': str(e)})
        if prepared:
            with self.db() as c:
                c.execute('BEGIN IMMEDIATE')
                before = c.total_changes
                c.executemany(
                    'INSERT OR IGNORE INTO jobs(url,domain,sector,region,origin,added,updated) VALUES(?,?,?,?,?,?,?)',
                    prepared,
                )
                accepted = c.total_changes - before
                duplicates = len(prepared) - accepted
        return {'accepted': accepted, 'duplicates': duplicates, 'rejected': rejected}

    def recover(self) -> None:
        with self.db() as c:
            c.execute(
                "UPDATE jobs SET status='queued', attempts=max(0, attempts-1), available=0, "
                "error='Kesinti sonrası yeniden sıraya alındı' WHERE status='running'"
            )

    def paused(self) -> bool:
        with self.db() as c:
            return c.execute("SELECT value FROM config WHERE key='paused'").fetchone()[0] == '1'

    def pause(self, value: bool) -> None:
        with self.db() as c:
            c.execute("UPDATE config SET value=? WHERE key='paused'", ('1' if value else '0',))

    def claim(self) -> dict[str, Any] | None:
        batch = self.claim_batch(1)
        return batch[0] if batch else None

    def claim_batch(self, limit: int = 1) -> list[dict[str, Any]]:
        limit = max(1, min(limit, 128))
        with self.db() as c:
            c.execute('BEGIN IMMEDIATE')
            if c.execute("SELECT value FROM config WHERE key='paused'").fetchone()[0] == '1':
                return []
            rows = c.execute(
                "SELECT * FROM jobs WHERE status='queued' AND available<=? ORDER BY id LIMIT ?",
                (time.time(), limit),
            ).fetchall()
            if not rows:
                return []
            stamp = now()
            ids = [r['id'] for r in rows]
            placeholders = ','.join('?' for _ in ids)
            c.execute(
                f"UPDATE jobs SET status='running', attempts=attempts+1, updated=? WHERE id IN ({placeholders})",
                [stamp] + ids,
            )
            claimed: list[dict[str, Any]] = []
            for r in rows:
                d = dict(r)
                d['attempts'] += 1
                claimed.append(d)
            return claimed

    def _apply_finish(self, c: sqlite3.Connection, job: dict[str, Any], result: dict[str, Any], stamp: str) -> None:
        jid = job['id']
        c.execute('DELETE FROM contacts WHERE job_id=?', (jid,))
        for r in result['contacts']:
            c.execute(
                'INSERT INTO contacts(job_id,email,source,mx,same_domain,seen) VALUES(?,?,?,?,?,?)',
                (jid, r['email'], r['source'], r['mx'], int(r['same_domain']), r['seen']),
            )
        c.execute('DELETE FROM job_phones WHERE job_id=?', (jid,))
        phones = result.get('phones', [])
        if phones:
            c.executemany('INSERT OR IGNORE INTO job_phones VALUES(?,?)', [(jid, v) for v in phones])
        meta_info = result.get('meta') or {}
        if meta_info.get('province') or meta_info.get('district') or meta_info.get('address'):
            c.execute(
                '''INSERT INTO job_meta(job_id, province, district, address) VALUES(?,?,?,?)
                   ON CONFLICT(job_id) DO UPDATE SET
                     province=excluded.province, district=excluded.district, address=excluded.address''',
                (
                    jid,
                    str(meta_info.get('province', ''))[:120],
                    str(meta_info.get('district', ''))[:120],
                    str(meta_info.get('address', ''))[:500],
                ),
            )
        status = 'done' if result['contacts'] or phones else 'empty'
        if result['warnings']:
            status = 'partial'
        c.execute(
            'UPDATE jobs SET title=?, status=?, pages=?, error=?, updated=? WHERE id=?',
            (result['title'], status, result['pages'], '; '.join(result['warnings'])[:1500], stamp, jid),
        )

    def finish(self, job: dict[str, Any], result: dict[str, Any]) -> None:
        with self.db() as c:
            self._apply_finish(c, job, result, now())

    def fail(self, job: dict[str, Any], error: Any, retry: bool = False, interrupted: bool = False) -> None:
        status = 'queued' if interrupted or (retry and job['attempts'] < 3) else 'failed'
        avail = (time.time() + (0 if interrupted else 20 * job['attempts'])) if status == 'queued' else 0
        with self.db() as c:
            c.execute(
                'UPDATE jobs SET status=?, error=?, updated=?, available=?, attempts=max(0, attempts-?) WHERE id=?',
                (status, str(error)[:1000], now(), avail, int(interrupted), job['id']),
            )

    def flush_outcomes(self, outcomes: list[tuple[str, dict[str, Any], Any, bool, bool]]) -> None:
        if not outcomes:
            return
        stamp = now()
        now_t = time.time()
        with self.db() as c:
            c.execute('BEGIN IMMEDIATE')
            for kind, job, payload, retry, interrupted in outcomes:
                if kind == 'ok':
                    self._apply_finish(c, job, payload, stamp)
                else:
                    status = 'queued' if interrupted or (retry and job['attempts'] < 3) else 'failed'
                    avail = (now_t + (0 if interrupted else 20 * job['attempts'])) if status == 'queued' else 0
                    c.execute(
                        'UPDATE jobs SET status=?, error=?, updated=?, available=?, attempts=max(0, attempts-?) WHERE id=?',
                        (status, str(payload)[:1000], stamp, avail, int(interrupted), job['id']),
                    )

    def retry(self, jid: int) -> int:
        with self.db() as c:
            return c.execute(
                "UPDATE jobs SET status='queued', attempts=0, available=0, updated=? "
                "WHERE id=? AND status IN ('failed','partial','empty','done')",
                (now(), jid),
            ).rowcount

    def retry_all_failed(self) -> int:
        with self.db() as c:
            return c.execute(
                "UPDATE jobs SET status='queued', attempts=0, available=0, updated=? WHERE status='failed'",
                (now(),),
            ).rowcount

    def delete(self, jid: int) -> int:
        with self.db() as c:
            return c.execute("DELETE FROM jobs WHERE id=? AND status!='running'", (jid,)).rowcount

    def suppress(self, email: str) -> None:
        email = email.strip().lower()
        if '@' not in email or len(email) > 254:
            raise ValueError('E-posta geçersiz')
        with self.db() as c:
            c.execute('INSERT OR IGNORE INTO suppression VALUES(?,?)', (email, now()))

    def status(self) -> dict[str, Any]:
        with self.db() as c:
            counts = {r[0]: r[1] for r in c.execute('SELECT status, count(*) FROM jobs GROUP BY status')}
            contacts = c.execute(
                'SELECT count(DISTINCT email) FROM contacts WHERE email NOT IN (SELECT email FROM suppression)'
            ).fetchone()[0]
            verified = c.execute(
                "SELECT count(DISTINCT email) FROM contacts "
                "WHERE mx='mx' AND same_domain=1 AND email NOT IN (SELECT email FROM suppression)"
            ).fetchone()[0]
            phones = c.execute('SELECT count(DISTINCT phone) FROM job_phones').fetchone()[0]
            paused = c.execute("SELECT value FROM config WHERE key='paused'").fetchone()[0] == '1'
            return {
                'counts': counts,
                'contacts': contacts,
                'strong': verified,
                'phones': phones,
                'paused': paused,
            }

    def listing(self, q: str = '', status: str = '', limit: int = 100, offset: int = 0) -> dict[str, Any]:
        where = ' WHERE (j.domain LIKE ? OR j.title LIKE ? OR j.sector LIKE ? OR j.region LIKE ?)'
        params: list[Any] = ['%' + q + '%'] * 4
        if status:
            where += ' AND j.status=?'
            params.append(status)
        with self.db() as c:
            total = c.execute('SELECT count(*) FROM jobs j' + where, params).fetchone()[0]
            rows = [
                dict(x)
                for x in c.execute(
                    '''SELECT j.*,
                              (SELECT count(*) FROM contacts t WHERE t.job_id=j.id AND t.email NOT IN (SELECT email FROM suppression)) AS emails,
                              (SELECT count(*) FROM job_phones tp WHERE tp.job_id=j.id) AS phones
                       FROM jobs j'''
                    + where
                    + ' ORDER BY j.id DESC LIMIT ? OFFSET ?',
                    params + [limit, offset],
                )
            ]
            return {'rows': rows, 'total': total}

    def details(self, jid: int) -> list[dict[str, Any]]:
        with self.db() as c:
            return [
                dict(x)
                for x in c.execute(
                    'SELECT * FROM contacts WHERE job_id=? AND email NOT IN (SELECT email FROM suppression) '
                    'ORDER BY same_domain DESC, email',
                    (jid,),
                )
            ]

    def job_phones(self, jid: int) -> list[str]:
        with self.db() as c:
            return [r[0] for r in c.execute('SELECT phone FROM job_phones WHERE job_id=? ORDER BY phone', (jid,))]

    def export(self) -> bytes:
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow([
            'Firma sayfa başlığı', 'Web sitesi', 'Sektör (kullanıcı etiketi)', 'Bölge (kullanıcı etiketi)',
            'Kurumsal e-posta', 'E-posta kaynak URL', 'MX durumu', 'Aynı alan',
            'Son görülme (UTC)', 'Giriş kaynağı', 'Tarama durumu',
        ])

        def safe(x: Any) -> str:
            s = str(x if x is not None else '')
            if s.lstrip().startswith(('=', '+', '-', '@')) or s.startswith(('\r', '\n', '\t')):
                return "'" + s
            return s

        with self.db() as c:
            for r in c.execute(
                '''SELECT j.title, j.url, j.sector, j.region, t.email, t.source, t.mx, t.same_domain,
                          t.seen, j.origin, j.status
                   FROM contacts t JOIN jobs j ON j.id = t.job_id
                   WHERE t.email NOT IN (SELECT email FROM suppression)
                     AND t.id = (
                       SELECT t2.id FROM contacts t2
                       WHERE t2.email = t.email
                       ORDER BY t2.same_domain DESC, (t2.mx='mx') DESC, t2.seen DESC, t2.id ASC LIMIT 1
                     )
                   ORDER BY j.sector, j.domain, t.email'''
            ):
                writer.writerow([safe(x) for x in r])
        return ('\ufeff' + out.getvalue()).encode('utf-8')

    def backup(self, dest: str | Path) -> None:
        with self.db() as c:
            target = sqlite3.connect(dest)
            try:
                c.backup(target)
            finally:
                target.close()


class Workers:
    """Hybrid industrial worker engine: HTTP/2 asyncio loop in production, thread-pool for sync fixtures."""

    def __init__(self, store: Store, fetch: Any, workers: int = 64) -> None:
        self.store = store
        self.fetch = fetch
        self.workers = max(1, min(workers, 256))
        self.stop = threading.Event()
        self._use_async = bool(getattr(fetch, 'supports_async', False))
        self._thread: threading.Thread | None = None
        self.pool: ThreadPoolExecutor | None = (
            None if self._use_async else ThreadPoolExecutor(max_workers=self.workers)
        )

    def start(self) -> None:
        self.store.recover()
        if self._use_async:
            self._thread = threading.Thread(target=self._run_async_driver, name='AsyncCrawler', daemon=True)
            self._thread.start()
        elif self.pool is not None:
            for _ in range(self.workers):
                self.pool.submit(self._run_sync_worker)

    def _run_sync_worker(self) -> None:
        while not self.stop.is_set():
            try:
                job = self.store.claim()
            except sqlite3.Error:
                self.stop.wait(0.5)
                continue
            if not job:
                self.stop.wait(0.08)
                continue
            try:
                res = crawl(self.fetch, job['url'], stop=self.stop.is_set)
                self.store.finish(job, res)
            except ScanError as e:
                self.store.fail(job, e, e.retry, self.stop.is_set())
            except Exception as e:
                self.store.fail(job, 'İşlem hatası: ' + type(e).__name__, True)

    def _run_async_driver(self) -> None:
        try:
            import uvloop  # type: ignore[import-not-found]
            asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
        except ImportError:
            pass
        asyncio.run(self._async_supervisor())

    async def _async_supervisor(self) -> None:
        delay = getattr(self.fetch, 'default_delay', 0.35)
        out_buf: list[tuple[str, dict[str, Any], Any, bool, bool]] = []
        active: set[asyncio.Task[None]] = set()
        batch_size = max(4, min(32, self.workers // 2))

        async def flush() -> None:
            if not out_buf:
                return
            items = list(out_buf)
            out_buf.clear()
            await asyncio.to_thread(self.store.flush_outcomes, items)

        async with AsyncCrawlSession(concurrency=self.workers, default_delay=delay) as session:
            async def handle_job(job: dict[str, Any]) -> None:
                try:
                    res = await async_crawl(session, job['url'], stop=self.stop.is_set)
                    out_buf.append(('ok', job, res, False, False))
                except ScanError as e:
                    out_buf.append(('err', job, e, e.retry, self.stop.is_set()))
                except Exception as e:
                    out_buf.append(('err', job, 'İşlem hatası: ' + type(e).__name__, True, self.stop.is_set()))

            last_flush = time.monotonic()
            while not self.stop.is_set():
                done = {t for t in active if t.done()}
                active -= done
                if len(out_buf) >= 24 or (out_buf and time.monotonic() - last_flush >= 0.3):
                    await flush()
                    last_flush = time.monotonic()

                capacity = self.workers - len(active)
                if capacity > 0:
                    try:
                        claimed = await asyncio.to_thread(self.store.claim_batch, min(capacity, batch_size))
                    except sqlite3.Error:
                        claimed = []
                    for job in claimed:
                        t = asyncio.create_task(handle_job(job))
                        active.add(t)
                    if not claimed:
                        if active:
                            await asyncio.wait(active, timeout=0.15, return_when=asyncio.FIRST_COMPLETED)
                        else:
                            await flush()
                            await asyncio.sleep(0.2)
                        continue
                else:
                    await asyncio.wait(active, timeout=0.2, return_when=asyncio.FIRST_COMPLETED)

            if active:
                await asyncio.gather(*active, return_exceptions=True)
            await flush()

    def close(self) -> None:
        self.stop.set()
        if self._thread is not None:
            self._thread.join(timeout=15.0)
        if self.pool is not None:
            self.pool.shutdown(wait=True)


class Handler(BaseHTTPRequestHandler):
    server_version = 'LeadLocal/3.0'
    CLOUD_ORIGINS = ('https://haritalar.web.app', 'https://haritalar.firebaseapp.com')

    def _allowed_origins(self) -> tuple[str, ...]:
        port = self.server.server_port  # type: ignore[attr-defined]
        return (f'http://127.0.0.1:{port}', f'http://localhost:{port}', *self.CLOUD_ORIGINS)

    def _cors_headers(self) -> dict[str, str]:
        origin = self.headers.get('Origin')
        if origin and origin in self._allowed_origins():
            return {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Local-Token',
                'Access-Control-Allow-Private-Network': 'true',
                'Access-Control-Expose-Headers': 'Content-Disposition',
                'Vary': 'Origin',
            }
        return {}

    def send_data(
        self,
        body: bytes,
        typ: str = 'application/json; charset=utf-8',
        code: int = 200,
        extra: dict[str, str] | None = None,
    ) -> None:
        self.send_response(code)
        self.send_header('Content-Type', typ)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header(
            'Content-Security-Policy',
            "default-src 'self'; script-src 'self' https://unpkg.com blob:; worker-src 'self' blob:; child-src blob:; "
            "style-src 'self' 'unsafe-inline' https://unpkg.com; "
            "connect-src 'self' https://dns.google https://crt.sh https://nominatim.openstreetmap.org "
            "https://photon.komoot.io https://api.openstreetmap.org "
            "https://maps.mail.ru https://overpass-api.de https://overpass.private.coffee https://unpkg.com "
            "https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://tiles.openfreemap.org; "
            "img-src 'self' data: blob: https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com; "
            "font-src 'self' data: https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://tiles.openfreemap.org; "
            "object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        )
        for k, v in self._cors_headers().items():
            self.send_header(k, v)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def out(self, value: Any, code: int = 200) -> None:
        raw = _orjson.dumps(value) if _orjson is not None else json.dumps(value, ensure_ascii=False).encode()
        self.send_data(raw, code=code)

    def check(self, api: bool = False) -> bool:
        port = self.server.server_port  # type: ignore[attr-defined]
        if self.headers.get('Host') not in (f'127.0.0.1:{port}', f'localhost:{port}'):
            self.out({'error': 'Geçersiz Host'}, 403)
            return False
        origin = self.headers.get('Origin')
        if origin is not None and origin not in self._allowed_origins():
            self.out({'error': 'Geçersiz Origin'}, 403)
            return False
        if api and not secrets.compare_digest(self.headers.get('X-Local-Token', ''), TOKEN):
            self.out({'error': 'Oturum anahtarı gerekli'}, 403)
            return False
        return True

    def do_OPTIONS(self) -> None:
        port = self.server.server_port  # type: ignore[attr-defined]
        if self.headers.get('Host') not in (f'127.0.0.1:{port}', f'localhost:{port}'):
            self.out({'error': 'Geçersiz Host'}, 403)
            return
        origin = self.headers.get('Origin')
        if origin is not None and origin not in self._allowed_origins():
            self.out({'error': 'Geçersiz Origin'}, 403)
            return
        self.send_response(204)
        for k, v in self._cors_headers().items():
            self.send_header(k, v)
        self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()

    def do_GET(self) -> None:
        p = urlsplit(self.path)
        q = parse_qs(p.query)
        api = p.path.startswith('/api/')
        if not self.check(api and p.path != '/api/session'):
            return
        s: Store = self.server.store  # type: ignore[attr-defined]
        try:
            if p.path == '/api/session':
                self.out({'token': TOKEN, 'engine': 'v7-pro'})
                return
            if p.path == '/api/status':
                self.out(s.status())
                return
            if p.path == '/api/jobs':
                self.out(
                    s.listing(
                        q.get('q', [''])[0][:200],
                        q.get('status', [''])[0],
                        100,
                        max(0, int(q.get('offset', ['0'])[0])),
                    )
                )
                return
            if p.path == '/api/contacts':
                self.out(s.details(int(q['id'][0])))
                return
            if p.path == '/api/phones':
                self.out({'phones': s.job_phones(int(q['id'][0]))})
                return
            if p.path == '/api/places':
                self.out(
                    catalog.listing(
                        s,
                        q.get('sector', [''])[0],
                        q.get('region', [''])[0],
                        q.get('minimum', ['0'])[0],
                        q.get('box', [''])[0],
                        int(q.get('offset', ['0'])[0]),
                        q.get('district', [''])[0],
                    )
                )
                return
            if p.path == '/api/portfolio':
                self.out(
                    catalog.portfolio_listing(
                        s,
                        q.get('sector', [''])[0],
                        q.get('region', [''])[0],
                        q.get('district', [''])[0],
                        q.get('contact_mode', ['all'])[0],
                        q.get('minimum', ['0'])[0],
                        q.get('box', [''])[0],
                        int(q.get('offset', ['0'])[0]),
                        int(q.get('limit', ['100'])[0]),
                    )
                )
                return
            if p.path == '/api/industrial/status':
                self.out(industrial_engine.get_engine_status())
                return
            if p.path == '/api/industrial/analytics':
                self.out(industrial_engine.get_database_analytics(DATA / 'leads.sqlite3'))
                return
            if p.path == '/api/industrial/h3_clusters':
                reg = q.get('region', ['İstanbul, Türkiye'])[0]
                sec = q.get('sector', [''])[0]
                res_lvl = int(q.get('resolution', ['7'])[0])
                self.out(industrial_engine.get_city_h3_clusters(DATA / 'leads.sqlite3', reg, sec, res_lvl))
                return
            if p.path == '/api/industrial/domain_intel':
                dom = q.get('domain', [''])[0].strip()
                if not dom:
                    raise ValueError('Alan adı gerekli')
                self.out(industrial_engine.inspect_domain_infrastructure(dom))
                return
            if p.path == '/api/ct_logs':
                query_str = q.get('query', [''])[0]
                try:
                    limit_int = min(200, max(1, int(q.get('limit', ['50'])[0])))
                except (ValueError, TypeError):
                    limit_int = 50
                try:
                    res_ct = engine.fetch_ct_logs(query_str, limit_int)
                    if inspect.isawaitable(res_ct):
                        logs = asyncio.run(res_ct)
                    else:
                        logs = res_ct
                except Exception as exc:
                    self.out({'error': str(exc)}, 500)
                    return
                self.out({'query': query_str, 'count': len(logs), 'domains': logs})
                return
            if p.path == '/api/export.xlsx':
                with tempfile.TemporaryDirectory(prefix='lead_export_') as tmp:
                    dest = Path(tmp) / 'leads.xlsx'
                    generate_xlsx(
                        s,
                        dest,
                        q.get('sector', [''])[0],
                        q.get('region', [''])[0],
                        float(q.get('minimum', ['0'])[0]),
                        q.get('box', [''])[0],
                        q.get('district', [''])[0],
                        q.get('contact_mode', ['all'])[0],
                    )
                    self.send_response(200)
                    self.send_header(
                        'Content-Type',
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    )
                    self.send_header('Content-Length', str(dest.stat().st_size))
                    self.send_header('Content-Disposition', 'attachment; filename="firmalar.xlsx"')
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('X-Content-Type-Options', 'nosniff')
                    for k, v in self._cors_headers().items():
                        self.send_header(k, v)
                    self.end_headers()
                    with dest.open('rb') as f:
                        shutil.copyfileobj(f, self.wfile)
                return
            if p.path == '/api/export':
                self.send_data(
                    s.export(),
                    'text/csv; charset=utf-8',
                    extra={'Content-Disposition': 'attachment; filename="lead-contacts.csv"'},
                )
                return
            files = {
                '/': ('index.html', 'text/html; charset=utf-8'),
                '/index.html': ('index.html', 'text/html; charset=utf-8'),
                '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
                '/xlsx-engine.js': ('xlsx-engine.js', 'text/javascript; charset=utf-8'),
                '/style.css': ('style.css', 'text/css; charset=utf-8'),
                '/data/manifest.json': ('data/manifest.json', 'application/json; charset=utf-8'),
                '/downloads/lead-intelligence-pro.zip': ('downloads/lead-intelligence-pro.zip', 'application/zip'),
            }
            if p.path in files:
                f_name, typ = files[p.path]
                f_path = ROOT / 'hosting' / f_name
                if f_path.is_file():
                    self.send_data(f_path.read_bytes(), typ)
                    return
            if p.path.startswith('/data/') and p.path.endswith('.json.gz'):
                safe_name = Path(p.path).name
                gz_path = (ROOT / 'hosting' / 'data' / safe_name).resolve()
                if gz_path.parent == (ROOT / 'hosting' / 'data').resolve() and gz_path.is_file():
                    self.send_data(gz_path.read_bytes(), 'application/gzip')
                    return
            self.out({'error': 'Bulunamadı'}, 404)
        except (ValueError, KeyError):
            self.out({'error': 'Geçersiz parametre'}, 400)
        except Exception as e:
            self.out({'error': 'Yerel işlem hatası: ' + type(e).__name__}, 500)

    def do_POST(self) -> None:
        if not self.check(True):
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            p = urlsplit(self.path).path
            s: Store = self.server.store  # type: ignore[attr-defined]
            if not 0 < size <= (catalog.MAX_BYTES if p == '/api/places/import' else 8_000_000):
                raise ValueError('İstek boyutu sınırı')
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                raise ValueError('JSON gerekli')
            d = json.loads(self.rfile.read(size))
            if p == '/api/industrial/dedup':
                records = d.get('records', [])
                if not isinstance(records, list) or len(records) > 50000:
                    raise ValueError('En çok 50.000 kayıt')
                self.out({'records': industrial_engine.deduplicate_records_splink(records)})
                return
            if p == '/api/industrial/fuzzy_match':
                records = d.get('records', [])
                query_str = str(d.get('query', '')).strip()
                if not isinstance(records, list) or len(records) > 50000:
                    raise ValueError('En çok 50.000 kayıt')
                limit_int = min(1000, max(1, int(d.get('limit', 200))))
                cutoff_f = max(0.0, min(100.0, float(d.get('score_cutoff', 52.0))))
                ranked = industrial_engine.fuzzy_rank_records(records, query_str, limit=limit_int, score_cutoff=cutoff_f)
                self.out({'count': len(ranked), 'records': ranked})
                return
            if p == '/api/industrial/crawl':
                url = d.get('url', '')
                if not url:
                    raise ValueError('URL gerekli')
                stealth = bool(d.get('stealth', False))
                res = asyncio.run(industrial_engine.tiered_crawl_intelligence(url, stealth))
                self.out(res)
                return
            if p == '/api/industrial/overture/sync':
                raw_bbox = d.get('bbox', [28.9, 41.0, 29.1, 41.2])
                if not isinstance(raw_bbox, (list, tuple)) or len(raw_bbox) != 4:
                    raise ValueError('Geçersiz BBox formatı [minx, miny, maxx, maxy]')
                bbox_tuple = (float(raw_bbox[0]), float(raw_bbox[1]), float(raw_bbox[2]), float(raw_bbox[3]))
                limit = min(2000, max(1, int(d.get('limit', 500))))
                places = industrial_engine.fetch_overture_places(bbox_tuple, limit=limit)
                self.out({'count': len(places), 'places': places})
                return
            if p == '/api/industrial/global_search':
                city_str = str(d.get('city', '')).strip()[:100]
                country_str = str(d.get('country', 'Türkiye')).strip()[:100] or 'Türkiye'
                sector_str = str(d.get('sector', '')).strip()[:200]
                if not city_str:
                    raise ValueError('Şehir adı gerekli')
                if not self.server.discovery.acquire(timeout=45.0):  # type: ignore[attr-defined]
                    self.out({'error': 'Önceki küresel tarama tamamlanıyor, birkaç saniye sonra tekrar deneyin'}, 409)
                    return
                try:
                    res = industrial_engine.global_sector_city_search(
                        s,
                        city=city_str,
                        country=country_str,
                        sector=sector_str,
                        box=d.get('box'),
                        contact_mode=str(d.get('contact_mode', 'all'))[:40],
                        district=str(d.get('district', ''))[:100],
                        offset=max(0, int(d.get('offset', 0))),
                        limit=min(500, max(1, int(d.get('limit', 100)))),
                        force_refresh=bool(d.get('force_refresh', False)),
                    )
                    self.out(res)
                finally:
                    self.server.discovery.release()  # type: ignore[attr-defined]
                return
            if p == '/api/erp/webhook':
                webhook_url = str(d.get('webhook_url', '')).strip()
                payload = d.get('payload')
                if not isinstance(payload, dict):
                    raise ValueError('Geçersiz ERP payload')
                res = industrial_engine.dispatch_erp_webhook(webhook_url, payload)
                self.out(res)
                return
            if p in ('/api/places/import', '/api/places/download', '/api/places/queue'):
                if d.get('authorized') is not True:
                    raise ValueError('Kaynak ve kullanım koşulları onayı gerekli')
                if p == '/api/places/queue':
                    self.out(
                        catalog.queue(
                            s,
                            d['sector'],
                            d['region'],
                            d.get('minimum', 0),
                            d.get('box'),
                            int(d.get('limit', 5000)),
                            d.get('district', ''),
                        )
                    )
                    return
                if not self.server.discovery.acquire(timeout=45.0):  # type: ignore[attr-defined]
                    self.out({'error': 'Önceki bölge taraması tamamlanıyor, birkaç saniye sonra tekrar deneyin'}, 409)
                    return
                try:
                    if p == '/api/places/import':
                        self.out(catalog.ingest(s, d['data'], d['region'], catalog.SOURCE + ' / kullanıcı GeoJSON aktarımı'))
                    else:
                        self.out(
                            catalog.download(
                                s,
                                d['region'],
                                d['box'],
                                d.get('sector', ''),
                                d.get('source_mode', 'hybrid'),
                            )
                        )
                finally:
                    self.server.discovery.release()  # type: ignore[attr-defined]
                return
            if p == '/api/add':
                if d.get('authorized') is not True:
                    raise ValueError('Kaynak kullanım izni onayı gerekli')
                rows = d['rows']
                if not isinstance(rows, list) or len(rows) > 50000 or any(not isinstance(x, dict) for x in rows):
                    raise ValueError('En çok 50.000 kayıt')
                self.out(s.add(rows))
                return
            if p == '/api/discover':
                if d.get('authorized') is not True:
                    raise ValueError('Kaynak kullanım izni onayı gerekli')
                if not self.server.discovery.acquire(blocking=False):  # type: ignore[attr-defined]
                    self.out({'error': 'Bir rehber araştırması zaten çalışıyor'}, 409)
                    return
                try:
                    self.out(discover(self.server.fetch, d['url']))  # type: ignore[attr-defined]
                finally:
                    self.server.discovery.release()  # type: ignore[attr-defined]
                return
            if p == '/api/pause':
                s.pause(bool(d['paused']))
                self.out(s.status())
                return
            if p == '/api/retry':
                self.out({'updated': s.retry(int(d['id']))})
                return
            if p == '/api/retry-failed':
                self.out({'updated': s.retry_all_failed()})
                return
            if p == '/api/delete':
                self.out({'updated': s.delete(int(d['id']))})
                return
            if p == '/api/suppress':
                s.suppress(d['email'])
                self.out({'ok': True})
                return
            if p == '/api/backup':
                dest = DATA / ('backup-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.sqlite3')
                s.backup(dest)
                self.out({'file': str(dest)})
                return
            self.out({'error': 'Bulunamadı'}, 404)
        except (ValueError, KeyError, TypeError, ScanError) as e:
            self.out({'error': str(e)}, 400)
        except Exception as e:
            self.out({'error': 'Yerel işlem hatası: ' + type(e).__name__}, 500)

    def log_message(self, fmt: str, *args: Any) -> None:
        pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--workers', type=int, default=64, choices=range(1, 257), metavar='1..256')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    DATA.mkdir(parents=True, exist_ok=True)
    import fcntl

    with open(DATA / 'instance.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit('Bu veri tabanı için başka bir uygulama çalışıyor.')
        store = Store(DATA / 'leads.sqlite3')
        fetch = Fetcher()
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
        server.store = store  # type: ignore[attr-defined]
        server.fetch = fetch  # type: ignore[attr-defined]
        server.discovery = threading.BoundedSemaphore(1)  # type: ignore[attr-defined]
        workers = Workers(store, fetch, args.workers)
        workers.start()
        print(
            f'LEAD INTELLIGENCE PRO V3 (Industrial Async Engine — {args.workers} Korutin): '
            f'http://127.0.0.1:{args.port}\nVeri: {DATA}\nDurdurmak için Ctrl+C',
            flush=True,
        )
        if not args.no_browser:
            webbrowser.open(f'http://127.0.0.1:{args.port}')
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
            workers.close()
            store.backup(DATA / 'last-shutdown.sqlite3')
            store.close()


if __name__ == '__main__':
    main()
