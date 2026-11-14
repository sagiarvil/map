"""High-throughput, permission-aware corporate website intelligence engine (V3 Pro).

Preserves strict security invariants (SSRF private-IP block, robots.txt compliance,
HTTPS downgrade prevention, same-domain scope, CAPTCHA/403/429 fail-closed stop,
and zero Google Maps automated scraping) while adding:
- Async HTTP/2 multiplexed connection pooling (httpx + gzip/deflate)
- Non-blocking domain token-bucket scheduling (zero thread-sleep starvation)
- Native async/cached DNS & MX resolution (dnspython + persistent cache callback)
- High-recall structured extraction: Schema.org JSON-LD, Cloudflare data-cfemail,
  WhatsApp business links, visible-text Turkish phones (fax-filtered), KVKK/Künye pages,
  and 120+ Turkish/English/German/French corporate role & brand mailboxes.
"""
from __future__ import annotations

import asyncio
import datetime
import gzip
import html as html_lib
import http.client
import ipaddress
import json
import re
import shutil
import socket
import ssl
import subprocess
import threading
import time
import zlib
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any, Callable
from urllib.parse import parse_qs, quote, unquote, urljoin, urlsplit, urlunsplit

try:
    import httpx
    HAS_HTTPX = True
except ImportError:  # pragma: no cover
    httpx = None  # type: ignore[assignment]
    HAS_HTTPX = False

try:
    import dns.asyncresolver
    import dns.exception
    import dns.resolver
    HAS_DNSPYTHON = True
except ImportError:  # pragma: no cover
    HAS_DNSPYTHON = False

AGENT = 'LeadResearchLocal'
MAX_BYTES = 2_000_000
DEFAULT_DOMAIN_DELAY = 0.35

ROLE = re.compile(
    r'^(info|iletisim|iletisimmerkezi|iletisim2|info2|contact|hello|merhaba|'
    r'sales|satis|satış|kurumsalsatis|toptan|perakende|wholesale|'
    r'office|ofis|merkez|genelmerkez|headquarters|hq|zentrale|'
    r'export|ihracat|import|ithalat|dis-ticaret|disticaret|foreigntrade|'
    r'marketing|pazarlama|kurumsal|bilgi|mail|eposta|email|posta|'
    r'support|destek|service|servis|teknik|teknikservis|yardim|help|care|'
    r'enquiry|enquiries|inquiry|inquiries|commercial|orders|siparis|sipariş|order|'
    r'teklif|fiyat|ihale|tender|proje|projeler|project|projects|'
    r'mimari|mimarlik|tasarim|design|uretim|üretim|fabrika|imalat|atolye|atölye|'
    r'showroom|magaza|mağaza|sube|şube|bayi|bayilik|franchise|'
    r'satinalma|satınalma|purchasing|procurement|tedarik|einkauf|'
    r'lojistik|sevkiyat|depo|kargo|shipping|logistics|operasyon|operations|'
    r'reception|resepsiyon|reservation|rezervasyon|booking|'
    r'general|admin|yonetim|yönetim|mudurluk|sekreterlik|secreteriat|sekreterya|secretariat|'
    r'muhasebe|accounting|finans|finance|fatura|efatura|'
    r'ik|insankaynaklari|hr|kariyer|career|careers|'
    r'b2b|customer|customerservice|musteri|müşteri|musterihizmetleri|'
    r'kvkk|hukuk|legal|press|basin|medya|pr|'
    r'verkauf|kontakt|vertrieb|anfrage|bestellung|'
    r'accueil|vente|ventes|commandes|devis)(?:[._+-][a-z0-9]{1,25})?$',
    re.I,
)

EMAIL = re.compile(
    r'(?<![\w.+-])[A-Z0-9.!#$%&\'*+/=?^_`{|}~-]{1,64}@'
    r'[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+',
    re.I,
)

OBFUSCATED_AT = re.compile(
    r'([A-Za-z0-9._+-]{1,64})\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\})\s*'
    r'([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)',
    re.I,
)

CONTACT_P0 = re.compile(
    r'contact|iletisim|iletişim|bize-ulas|bize_ulas|ulasim|ulaşım|kontakt|nous-contacter|anschrift|adres',
    re.I,
)
CONTACT_P1 = re.compile(
    r'sube|şube|magaza|mağaza|showroom|fabrika|merkez|bayi|kunye|künye|kvkk|aydinlatma|aydınlatma|impressum|imprint',
    re.I,
)
CONTACT = re.compile(
    r'contact|iletisim|iletişim|ulasim|ulaşım|bize-ulas|bize_ulas|adres|konum|lokasyon|'
    r'sube|şube|magaza|mağaza|showroom|fabrika|merkez|bayi|'
    r'hakkimizda|hakkımızda|about|kurumsal|kunye|künye|kvkk|aydinlatma|aydınlatma|'
    r'impressum|imprint|legal|kontakt|nous-contacter|export|ihracat|sales|satis|satış|teklif|team|reach|anschrift',
    re.I,
)

SKIP_EXT = re.compile(r'\.(pdf|zip|rar|7z|jpg|jpeg|png|gif|webp|svg|mp4|mp3|avi|docx?|xlsx?|pptx?|css|js|woff2?)$', re.I)

# Formatted visible-text Turkish & corporate phone patterns (requires separators/prefix to avoid random integers).
TEXT_PHONE_TR = re.compile(
    r'(?<!\d)(?:'
    r'(?:\+90|0090)\s*[\(\[]?[234589]\d{2}[\)\]]?[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}'
    r'|0\s*\([234589]\d{2}\)\s*\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}'
    r'|0[234589]\d{2}[\s.\-]\d{3}[\s.\-]\d{2}[\s.\-]\d{2}'
    r'|0[234589]\d{2}[\s.\-]\d{3}[\s.\-]\d{4}'
    r'|444[\s.\-]?\d[\s.\-]?\d{3}'
    r')(?!\d)'
)
FAX_PREFIX = re.compile(r'(?:faks|fax|belgege[cç]er)\s*[:.\-]?\s*$', re.I)
CHALLENGE_RE = re.compile(
    r'cf-chl-|captcha-delivery|<title>\s*(just a moment|access denied|attention required)',
    re.I,
)

BLOCK = (
    'google.com', 'google.com.tr', 'goo.gl', 'g.page', 'googleusercontent.com',
    'googleapis.com', 'gstatic.com', 'google.co.uk', 'google.de', 'google.fr',
    'google.be', 'facebook.com', 'instagram.com', 'linkedin.com', 'tiktok.com',
    'youtube.com', 'youtu.be', 'x.com', 'twitter.com', 'whatsapp.com', 'wa.me',
    't.me', 'bing.com', 'yahoo.com', 'duckduckgo.com', 'yandex.com', 'yandex.com.tr',
)

BAD_EMAIL_TLDS = (
    'png', 'jpg', 'jpeg', 'svg', 'css', 'js', 'webp', 'gif', 'ico', 'woff', 'woff2',
    'example', 'invalid', 'test', 'local', 'sentry',
)
BAD_EMAIL_DOMAINS = (
    'example.com', 'example.org', 'example.net', 'domain.com', 'email.com',
    'yoursite.com', 'yourdomain.com', 'wixpress.com', 'sentry.io',
)


class ScanError(Exception):
    def __init__(self, message: str, retry: bool = False) -> None:
        super().__init__(message)
        self.retry = retry


def now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')


def host_of(url: str) -> str:
    return urlsplit(url).hostname or ''


def domain_key(url: str) -> str:
    return host_of(url).removeprefix('www.')


def brand_stem(scope: str) -> str:
    """Extract clean brand stem from domain (e.g. 'egemobilya.com.tr' -> 'egemobilya')."""
    if not scope:
        return ''
    first = scope.lower().removeprefix('www.').split('.', 1)[0]
    clean = re.sub(r'[^a-z0-9]', '', first)
    return clean if len(clean) >= 5 and clean not in ('firma', 'company', 'iletisim', 'online', 'kurumsal') else ''


def normalize(raw: str) -> str:
    raw = raw.strip()
    if not raw or len(raw) > 2048 or any(ord(c) < 32 for c in raw) or '\\' in raw:
        raise ScanError('Geçersiz URL')
    if '://' not in raw:
        raw = 'https://' + raw
    try:
        p = urlsplit(raw)
        h = (p.hostname or '').rstrip('.').encode('idna').decode().lower()
        port = p.port
    except (ValueError, UnicodeError) as e:
        raise ScanError('Geçersiz URL') from e
    if (
        p.scheme not in ('http', 'https')
        or p.username
        or p.password
        or not h
        or port not in (None, 80 if p.scheme == 'http' else 443)
    ):
        raise ScanError('Yalnızca standart HTTP/S adresleri')
    if (
        not re.fullmatch(r'[a-z0-9.-]+', h)
        or '.' not in h
        or any(not x or len(x) > 63 or x.startswith('-') or x.endswith('-') for x in h.split('.'))
    ):
        raise ScanError('Geçersiz alan adı')
    try:
        ipaddress.ip_address(h)
    except ValueError:
        pass
    else:
        raise ScanError('IP adresiyle doğrudan tarama kapalı')
    if any(h == b or h.endswith('.' + b) for b in BLOCK) or re.search(r'(^|\.)google\.[a-z.]{2,12}$', h):
        raise ScanError('Bu platform otomatik taramaya kapalı')
    path = quote(p.path or '/', safe="/%:@!$&'()*+,;=-._~")
    return urlunsplit((p.scheme, h, path, quote(p.query, safe="%=&?/:+;,@-._~"), ''))


_DNS_CACHE_LOCK = threading.Lock()
_DNS_CACHE: dict[tuple[str, int], tuple[float, list[str]]] = {}
_MX_CACHE_LOCK = threading.Lock()
_MX_CACHE: dict[str, tuple[float, str]] = {}


def resolve_public(host: str, port: int) -> list[str]:
    try:
        ips = list(dict.fromkeys(x[4][0] for x in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)))
    except OSError as e:
        raise ScanError('DNS çözümlenemedi', True) from e
    if not ips or any(not ipaddress.ip_address(x).is_global or ipaddress.ip_address(x).is_multicast for x in ips):
        raise ScanError('Özel/yerel ağ adresi engellendi')
    return ips


def resolve_public_cached(host: str, port: int, ttl: float = 600.0) -> list[str]:
    key = (host, port)
    now_mono = time.monotonic()
    with _DNS_CACHE_LOCK:
        hit = _DNS_CACHE.get(key)
        if hit and now_mono - hit[0] < ttl:
            return hit[1]
    ips = resolve_public(host, port)
    with _DNS_CACHE_LOCK:
        if len(_DNS_CACHE) > 20000:
            _DNS_CACHE.clear()
        _DNS_CACHE[key] = (now_mono, ips)
    return ips


async def resolve_public_async(host: str, port: int, ttl: float = 600.0) -> list[str]:
    key = (host, port)
    now_mono = time.monotonic()
    with _DNS_CACHE_LOCK:
        hit = _DNS_CACHE.get(key)
        if hit and now_mono - hit[0] < ttl:
            return hit[1]
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        ips = list(dict.fromkeys(x[4][0] for x in infos))
    except OSError as e:
        raise ScanError('DNS çözümlenemedi', True) from e
    if not ips or any(not ipaddress.ip_address(x).is_global or ipaddress.ip_address(x).is_multicast for x in ips):
        raise ScanError('Özel/yerel ağ adresi engellendi')
    with _DNS_CACHE_LOCK:
        if len(_DNS_CACHE) > 20000:
            _DNS_CACHE.clear()
        _DNS_CACHE[key] = (now_mono, ips)
    return ips


def decode_cfemail(hex_str: str) -> str:
    """Decode standard Cloudflare hex-encoded email attribute on public HTML."""
    s = hex_str.strip().split('#')[-1].split('?')[0]
    if len(s) < 6 or len(s) % 2 != 0 or not re.fullmatch(r'[0-9a-fA-F]+', s):
        return ''
    try:
        key = int(s[:2], 16)
        decoded = bytes(int(s[i:i + 2], 16) ^ key for i in range(2, len(s), 2)).decode('utf-8')
        return decoded.strip() if '@' in decoded else ''
    except (ValueError, UnicodeDecodeError):
        return ''


def deobfuscate_emails(text: str) -> str:
    text = html_lib.unescape(text)
    if 'at' in text.lower():
        text = OBFUSCATED_AT.sub(r'\1@\2', text)
    return text


def _decompress_body(data: bytes, encoding: str) -> bytes:
    enc = encoding.strip().lower()
    if not enc or enc == 'identity':
        return data
    if enc in ('gzip', 'x-gzip'):
        return gzip.decompress(data)
    if enc == 'deflate':
        try:
            return zlib.decompress(data)
        except zlib.error:
            return zlib.decompress(data, -zlib.MAX_WBITS)
    raise ScanError('Desteklenmeyen içerik kodlama')


@dataclass
class Response:
    url: str
    status: int
    typ: str
    text: str
    location: str = ''


class Robots:
    def __init__(self, txt: str) -> None:
        groups: list[tuple[list[str], list[tuple[bool, str]], float]] = []
        agents: list[str] = []
        rules: list[tuple[bool, str]] = []
        delay: float = 0
        started = False
        for line in txt.splitlines():
            line = line.split('#', 1)[0].strip()
            if ':' not in line:
                continue
            tag, val = (x.strip() for x in line.split(':', 1))
            tag = tag.lower()
            if tag == 'user-agent':
                if started:
                    groups.append((agents, rules, delay))
                    agents, rules, delay, started = [], [], 0, False
                agents.append(val.lower())
            elif agents and tag in ('allow', 'disallow', 'crawl-delay'):
                started = True
                if tag == 'crawl-delay':
                    try:
                        delay = max(delay, float(val))
                    except ValueError:
                        pass
                elif val:
                    rules.append((tag == 'allow', val))
        if agents:
            groups.append((agents, rules, delay))
        exact = [g for g in groups if AGENT.lower() in g[0]]
        selected = exact or [g for g in groups if '*' in g[0]]
        self.rules: list[tuple[int, bool, re.Pattern[str]]] = []
        self.delay: float = max((g[2] for g in selected), default=0)
        for g in selected:
            for allow, path in g[1]:
                if len(path) > 2048 or path.count('*') > 12:
                    raise ScanError('Karmaşık robots kuralı; otomatik tarama kapalı')
                end = path.endswith('$')
                body = path[:-1] if end else path
                pattern = '^' + '.*'.join(re.escape(x) for x in body.split('*')) + ('$' if end else '')
                self.rules.append((len(body.replace('*', '')), allow, re.compile(pattern)))

    def allowed(self, url: str) -> bool:
        p = urlsplit(url)
        path = p.path + ('?' + p.query if p.query else '')
        for value in (path, unquote(path)):
            hits = [(n, a) for n, a, r in self.rules if r.search(value)]
            if hits and not max(hits)[1]:
                return False
        return True


class Fetcher:
    supports_async = HAS_HTTPX

    def __init__(self, default_delay: float = DEFAULT_DOMAIN_DELAY) -> None:
        self._guard = threading.Lock()
        self._locks: dict[str, threading.RLock] = {}
        self._last: dict[str, float] = {}
        self._robots: dict[str, tuple[float, Robots]] = {}
        self._blocked: set[str] = set()
        self._tls = ssl.create_default_context()
        self.default_delay = default_delay

    def _lock(self, h: str) -> threading.RLock:
        with self._guard:
            return self._locks.setdefault(h, threading.RLock())

    def _request(self, url: str, delay: float | None = None) -> Response:
        if delay is None:
            delay = self.default_delay
        url = normalize(url)
        p = urlsplit(url)
        h = p.hostname or ''
        port = 443 if p.scheme == 'https' else 80
        key = domain_key(url)
        with self._lock(key):
            if key in self._blocked:
                raise ScanError('Sunucu erişimi reddetti; bu oturumda durduruldu')
            ips = resolve_public(h, port)
            wait_for = max(0.0, delay - (time.monotonic() - self._last.get(key, 0.0)))
            if wait_for > 0:
                time.sleep(wait_for)
            conn = http.client.HTTPConnection(h, port, timeout=8)
            raw = None
            try:
                for ip in ips[:3]:
                    try:
                        raw = socket.create_connection((ip, port), timeout=5)
                        break
                    except OSError:
                        continue
                if raw is None:
                    raise ScanError('Bağlantı kurulamadı', True)
                conn.sock = self._tls.wrap_socket(raw, server_hostname=h) if p.scheme == 'https' else raw
                conn.sock.settimeout(8)
                conn.request(
                    'GET',
                    p.path + ('?' + p.query if p.query else ''),
                    headers={
                        'User-Agent': AGENT + '/3.0',
                        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, identity',
                        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
                        'Connection': 'close',
                    },
                )
                r = conn.getresponse()
                typ = r.getheader('Content-Type', '')
                status = r.status
                if status in (401, 403, 429):
                    self._blocked.add(key)
                    raise ScanError(f'HTTP {status}: erişim reddedildi, tekrar denenmeyecek')
                if status in (301, 302, 303, 307, 308):
                    return Response(url, status, typ, '', r.getheader('Location', ''))
                if status >= 500:
                    raise ScanError(f'HTTP {status}', True)
                if status != 200:
                    return Response(url, status, typ, '')
                if not any(x in typ.lower() for x in ('text/html', 'text/plain', 'application/xhtml+xml')):
                    raise ScanError('HTML veya metin olmayan içerik atlandı')
                encoding = r.getheader('Content-Encoding', 'identity').lower()
                if encoding not in ('', 'identity', 'gzip', 'x-gzip', 'deflate'):
                    raise ScanError('Desteklenmeyen içerik kodlama')
                length = r.getheader('Content-Length')
                if length and length.isdigit() and int(length) > MAX_BYTES:
                    raise ScanError('İçerik boyutu sınırı aşıldı')
                chunks: list[bytes] = []
                size = 0
                deadline = time.monotonic() + 18
                while True:
                    if time.monotonic() > deadline:
                        raise ScanError('Yanıt süre sınırı', True)
                    chunk = r.read1(min(65536, MAX_BYTES + 1 - size))
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ScanError('İçerik boyutu sınırı aşıldı')
                    if not chunk:
                        break
                    chunks.append(chunk)
                data = _decompress_body(b''.join(chunks), encoding)
                if len(data) > MAX_BYTES * 3:
                    raise ScanError('İçerik boyutu sınırı aşıldı')
                charset = r.headers.get_content_charset() or 'utf-8'
                try:
                    txt = data.decode(charset, errors='replace')
                except LookupError:
                    txt = data.decode('utf-8', errors='replace')
                return Response(url, status, typ, txt)
            except (OSError, http.client.HTTPException) as e:
                raise ScanError('Bağlantı/TLS hatası: ' + type(e).__name__, True) from e
            finally:
                self._last[key] = time.monotonic()
                conn.close()
                if raw is not None:
                    raw.close()

    def _robots_for(self, url: str) -> Robots:
        p = urlsplit(url)
        origin = p.scheme + '://' + p.netloc
        key = domain_key(url)
        with self._lock(key):
            cached = self._robots.get(origin)
            if cached and time.monotonic() - cached[0] < 3600:
                return cached[1]
            dest = origin + '/robots.txt'
            for _ in range(6):
                r = self._request(dest, delay=0.0)
                if r.status in (301, 302, 303, 307, 308):
                    dest = normalize(urljoin(dest, r.location))
                    if domain_key(dest) != key:
                        raise ScanError('robots.txt alan dışına yönlendiriliyor')
                    continue
                if r.status in (404, 410):
                    pol = Robots('')
                elif r.status == 200 and len(r.text) <= 512000 and ('text/plain' in r.typ.lower() or not r.text.lstrip().startswith('<')):
                    pol = Robots(r.text)
                else:
                    raise ScanError('robots.txt politikası doğrulanamadı')
                self._robots[origin] = (time.monotonic(), pol)
                return pol
            raise ScanError('robots.txt yönlendirme sınırı')

    def get(self, url: str, scope: str | None = None) -> Response:
        url = normalize(url)
        scope = scope or domain_key(url)
        for _ in range(6):
            if domain_key(url) != scope:
                raise ScanError('Alan dışı yönlendirme; manuel inceleme gerekli')
            pol = self._robots_for(url)
            if not pol.allowed(url):
                raise ScanError('robots.txt taramaya izin vermiyor')
            if pol.delay > 60:
                raise ScanError('Tarama bekleme süresi 60 saniyeden uzun')
            r = self._request(url, max(self.default_delay, pol.delay))
            if r.status in (301, 302, 303, 307, 308):
                if not r.location:
                    raise ScanError('Boş yönlendirme')
                dest = normalize(urljoin(url, r.location))
                if url.startswith('https:') and dest.startswith('http:'):
                    raise ScanError('HTTPS güvenlik düşürme engellendi')
                url = dest
                continue
            if r.status != 200:
                raise ScanError(f'HTTP {r.status}')
            if CHALLENGE_RE.search(r.text):
                raise ScanError('Erişim doğrulama ekranı; tarama durduruldu')
            return r
        raise ScanError('Yönlendirme sınırı')


class AsyncCrawlSession:
    """Industrial HTTP/2 async session with non-blocking per-domain pacing."""

    def __init__(self, concurrency: int = 64, default_delay: float = DEFAULT_DOMAIN_DELAY) -> None:
        self.concurrency = max(1, min(concurrency, 256))
        self.default_delay = default_delay
        self._robots: dict[str, tuple[float, Robots]] = {}
        self._robots_locks: dict[str, asyncio.Lock] = {}
        self._next_at: dict[str, float] = {}
        self._blocked: set[str] = set()
        self._client: Any = None

    async def __aenter__(self) -> 'AsyncCrawlSession':
        limits = httpx.Limits(
            max_connections=max(64, self.concurrency * 2),
            max_keepalive_connections=max(32, self.concurrency),
            keepalive_expiry=20.0,
        )
        self._client = httpx.AsyncClient(
            http2=True,
            verify=True,
            follow_redirects=False,
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=10.0),
            limits=limits,
            headers={
                'User-Agent': AGENT + '/3.0',
                'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9',
                'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            },
        )
        return self

    async def __aexit__(self, *exc: Any) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _pace(self, key: str, delay: float) -> None:
        if delay <= 0:
            return
        now_m = time.monotonic()
        scheduled = max(now_m, self._next_at.get(key, 0.0))
        self._next_at[key] = scheduled + delay
        wait_s = scheduled - now_m
        if wait_s > 0:
            await asyncio.sleep(wait_s)

    async def _raw_get(self, url: str, delay: float) -> Response:
        url = normalize(url)
        p = urlsplit(url)
        h = p.hostname or ''
        port = 443 if p.scheme == 'https' else 80
        key = domain_key(url)
        if key in self._blocked:
            raise ScanError('Sunucu erişimi reddetti; bu oturumda durduruldu')
        await resolve_public_async(h, port)
        await self._pace(key, delay)
        try:
            async with self._client.stream('GET', url) as r:
                status = r.status_code
                typ = r.headers.get('Content-Type', '')
                if status in (401, 403, 429):
                    self._blocked.add(key)
                    raise ScanError(f'HTTP {status}: erişim reddedildi, tekrar denenmeyecek')
                if status in (301, 302, 303, 307, 308):
                    return Response(url, status, typ, '', r.headers.get('Location', ''))
                if status >= 500:
                    raise ScanError(f'HTTP {status}', True)
                if status != 200:
                    return Response(url, status, typ, '')
                if not any(x in typ.lower() for x in ('text/html', 'text/plain', 'application/xhtml+xml')):
                    raise ScanError('HTML veya metin olmayan içerik atlandı')
                cl = r.headers.get('Content-Length')
                if cl and cl.isdigit() and int(cl) > MAX_BYTES:
                    raise ScanError('İçerik boyutu sınırı aşıldı')
                chunks: list[bytes] = []
                size = 0
                async for chunk in r.aiter_bytes(65536):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ScanError('İçerik boyutu sınırı aşıldı')
                    chunks.append(chunk)
                data = b''.join(chunks)
                enc = r.encoding or 'utf-8'
                try:
                    txt = data.decode(enc, errors='replace')
                except LookupError:
                    txt = data.decode('utf-8', errors='replace')
                return Response(url, status, typ, txt)
        except httpx.HTTPError as e:
            raise ScanError('Bağlantı/TLS hatası: ' + type(e).__name__, True) from e

    async def _robots_for(self, url: str) -> Robots:
        p = urlsplit(url)
        origin = p.scheme + '://' + p.netloc
        key = domain_key(url)
        cached = self._robots.get(origin)
        if cached and time.monotonic() - cached[0] < 3600:
            return cached[1]
        lock = self._robots_locks.setdefault(origin, asyncio.Lock())
        async with lock:
            cached = self._robots.get(origin)
            if cached and time.monotonic() - cached[0] < 3600:
                return cached[1]
            dest = origin + '/robots.txt'
            for _ in range(6):
                r = await self._raw_get(dest, delay=0.0)
                if r.status in (301, 302, 303, 307, 308):
                    dest = normalize(urljoin(dest, r.location))
                    if domain_key(dest) != key:
                        raise ScanError('robots.txt alan dışına yönlendiriliyor')
                    continue
                if r.status in (404, 410):
                    pol = Robots('')
                elif r.status == 200 and len(r.text) <= 512000 and ('text/plain' in r.typ.lower() or not r.text.lstrip().startswith('<')):
                    pol = Robots(r.text)
                else:
                    raise ScanError('robots.txt politikası doğrulanamadı')
                self._robots[origin] = (time.monotonic(), pol)
                return pol
            raise ScanError('robots.txt yönlendirme sınırı')

    async def get(self, url: str, scope: str | None = None) -> Response:
        url = normalize(url)
        scope = scope or domain_key(url)
        for _ in range(6):
            if domain_key(url) != scope:
                raise ScanError('Alan dışı yönlendirme; manuel inceleme gerekli')
            pol = await self._robots_for(url)
            if not pol.allowed(url):
                raise ScanError('robots.txt taramaya izin vermiyor')
            if pol.delay > 60:
                raise ScanError('Tarama bekleme süresi 60 saniyeden uzun')
            r = await self._raw_get(url, max(self.default_delay, pol.delay))
            if r.status in (301, 302, 303, 307, 308):
                if not r.location:
                    raise ScanError('Boş yönlendirme')
                dest = normalize(urljoin(url, r.location))
                if url.startswith('https:') and dest.startswith('http:'):
                    raise ScanError('HTTPS güvenlik düşürme engellendi')
                url = dest
                continue
            if r.status != 200:
                raise ScanError(f'HTTP {r.status}')
            if CHALLENGE_RE.search(r.text):
                raise ScanError('Erişim doğrulama ekranı; tarama durduruldu')
            return r
        raise ScanError('Yönlendirme sınırı')


def phone_normalize(raw: Any) -> str:
    """Keep published public business numbers as normalized E.164/444 text."""
    if not isinstance(raw, str):
        return ''
    raw = unquote(raw).strip().split(';', 1)[0].split('?', 1)[0]
    raw = re.sub(r'(?i)\s*(?:dahili|ext\.?|iç hat)\s*[:.]?\s*\d+\s*$', '', raw).strip()
    if not re.fullmatch(r'[+0-9().\s\-/\[\]]+', raw):
        return ''
    digits = re.sub(r'\D', '', raw)
    if digits.startswith('00'):
        digits = digits[2:]
        raw = '+' + digits
    if len(digits) == 12 and digits.startswith('90') and digits[2] in '234589':
        return '+' + digits
    if len(digits) == 11 and digits.startswith('0') and digits[1] in '234589':
        return '+90' + digits[1:]
    if len(digits) == 10 and digits[0] in '234589':
        return '+90' + digits
    if raw.startswith('+') and 7 <= len(digits) <= 15:
        return '+' + digits
    if len(digits) == 7 and digits.startswith('444'):
        return digits
    return ''


def _whatsapp_phone(href: str) -> str:
    low = href.lower()
    if 'wa.me/' in low:
        part = href.split('wa.me/', 1)[1].split('?', 1)[0].split('/', 1)[0].strip()
        return phone_normalize('+' + part.lstrip('+'))
    if 'whatsapp' in low and 'phone=' in low:
        q = parse_qs(urlsplit(href).query)
        val = (q.get('phone') or [''])[0].strip()
        if val:
            return phone_normalize('+' + val.lstrip('+'))
    return ''


def extract_text_phones(visible_text: str) -> set[str]:
    found: set[str] = set()
    for m in TEXT_PHONE_TR.finditer(visible_text):
        prefix_window = visible_text[max(0, m.start() - 20):m.start()]
        if FAX_PREFIX.search(prefix_window):
            continue
        norm_p = phone_normalize(m.group(0))
        if norm_p:
            found.add(norm_p)
    return found


def _walk_jsonld(node: Any, mails: list[str], tels: list[str], addr_out: dict[str, str]) -> None:
    if isinstance(node, list):
        for item in node[:50]:
            _walk_jsonld(item, mails, tels, addr_out)
        return
    if not isinstance(node, dict):
        return
    for k in ('email', 'emails'):
        val = node.get(k)
        if isinstance(val, str):
            mails.append(val.removeprefix('mailto:'))
        elif isinstance(val, list):
            mails.extend(str(x).removeprefix('mailto:') for x in val if isinstance(x, str))
    for k in ('telephone', 'phone'):
        val = node.get(k)
        if isinstance(val, str):
            tels.append(val)
        elif isinstance(val, list):
            tels.extend(str(x) for x in val if isinstance(x, str))
    addr = node.get('address')
    if isinstance(addr, dict):
        street = str(addr.get('streetAddress') or '').strip()
        locality = str(addr.get('addressLocality') or '').strip()
        region = str(addr.get('addressRegion') or '').strip()
        postal = str(addr.get('postalCode') or '').strip()
        full = ', '.join(x for x in (street, locality, region, postal) if x)
        if full and not addr_out.get('address'):
            addr_out['address'] = full[:500]
        if region and not addr_out.get('province'):
            addr_out['province'] = region[:100]
        if locality and not addr_out.get('district'):
            addr_out['district'] = locality[:100]
    elif isinstance(addr, str) and addr.strip() and not addr_out.get('address'):
        addr_out['address'] = addr.strip()[:500]
    for k in ('@graph', 'contactPoint', 'department', 'subOrganization', 'location', 'mainEntity'):
        if k in node:
            _walk_jsonld(node[k], mails, tels, addr_out)


class Page(HTMLParser):
    def __init__(self, txt: str) -> None:
        super().__init__(convert_charrefs=True)
        self.text: list[str] = []
        self.links: list[list[str]] = []
        self.mail: list[str] = []
        self.tel: list[str] = []
        self.title: list[str] = []
        self.addr_info: dict[str, str] = {}
        self.skip = 0
        self.in_jsonld = False
        self._jsonld_buf: list[str] = []
        self.intitle = False
        self.anchor: list[str] | None = None
        self.feed(txt)
        self.close()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        d = {k.lower(): (v or '') for k, v in attrs}
        cf = d.get('data-cfemail')
        if cf and not self.skip:
            dec = decode_cfemail(cf)
            if dec:
                self.mail.append(dec)
        if tag == 'script':
            typ = d.get('type', '').split(';', 1)[0].strip().lower()
            if typ == 'application/ld+json' and not self.skip:
                self.in_jsonld = True
                self._jsonld_buf = []
                return
            self.skip += 1
            return
        if tag in ('style', 'template', 'noscript'):
            self.skip += 1
            return
        if self.skip:
            return
        if tag == 'title':
            self.intitle = True
        if tag == 'a' and d.get('href'):
            href = d['href']
            self.anchor = [href, '']
            self.links.append(self.anchor)
            low = href.lower()
            if low.startswith('mailto:'):
                self.mail.append(unquote(href[7:].split('?')[0]))
            elif '/cdn-cgi/l/email-protection' in low:
                dec = decode_cfemail(href)
                if dec:
                    self.mail.append(dec)
            elif low.startswith('tel:'):
                self.tel.append(href[4:])
            elif 'wa.me/' in low or 'whatsapp' in low:
                wp = _whatsapp_phone(href)
                if wp:
                    self.tel.append(wp)

    def handle_endtag(self, tag: str) -> None:
        if tag == 'script' and self.in_jsonld:
            self.in_jsonld = False
            raw_json = ''.join(self._jsonld_buf).strip()
            if raw_json and len(raw_json) <= 300_000:
                try:
                    _walk_jsonld(json.loads(raw_json), self.mail, self.tel, self.addr_info)
                except (ValueError, TypeError, RecursionError):
                    pass
            self._jsonld_buf = []
            return
        if tag in ('script', 'style', 'template', 'noscript') and self.skip:
            self.skip -= 1
        if tag == 'title':
            self.intitle = False
        if tag == 'a':
            self.anchor = None

    def handle_data(self, s: str) -> None:
        if self.in_jsonld:
            self._jsonld_buf.append(s)
            return
        if self.skip:
            return
        self.text.append(s)
        if self.intitle:
            self.title.append(s)
        if self.anchor is not None:
            self.anchor[1] += ' ' + s[:160]

    def phones(self) -> list[str]:
        explicit = {v for raw in self.tel if (v := phone_normalize(raw))}
        visible = ' '.join(self.text)
        from_text = extract_text_phones(visible)
        return sorted(explicit | from_text)[:50]

    def emails(self, scope: str = '') -> list[str]:
        alltext = deobfuscate_emails(' '.join(self.text + self.mail))
        stem = brand_stem(scope)
        result: set[str] = set()
        for m in EMAIL.finditer(alltext):
            e = m.group().lower()
            local, _, domain = e.partition('@')
            if len(e) > 254 or local.startswith('.') or '..' in local:
                continue
            tld = domain.rsplit('.', 1)[-1]
            if tld in BAD_EMAIL_TLDS or domain in BAD_EMAIL_DOMAINS:
                continue
            clean_local = re.sub(r'[^a-z0-9]', '', local)
            is_brand_box = bool(stem and (clean_local == stem or (clean_local.startswith(stem) and len(clean_local) <= len(stem) + 4)))
            if ROLE.fullmatch(local) or is_brand_box:
                result.add(e)
        return sorted(result)[:100]


def mx_status(email: str) -> str:
    domain = email.rsplit('@', 1)[-1].lower()
    dig = shutil.which('dig')
    if not dig:
        return 'unknown'
    try:
        p = subprocess.run(
            [dig, '+time=2', '+tries=1', '+noall', '+comments', '+answer', domain, 'MX'],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if p.returncode or 'status: NOERROR' not in p.stdout:
            return 'nxdomain' if 'status: NXDOMAIN' in p.stdout else 'unknown'
        mx = [line.split()[-2:] for line in p.stdout.splitlines() if re.search(r'\sMX\s', line)]
        if any(x[1] == '.' for x in mx):
            return 'null_mx'
        return 'mx' if mx else 'no_mx'
    except (OSError, subprocess.TimeoutExpired):
        return 'unknown'


_DEFAULT_MX_STATUS = mx_status


def fast_mx_status(email_or_domain: str, ttl: float = 14400.0) -> str:
    """High-speed native DNS MX check with in-memory TTL cache (zero subprocess)."""
    domain = email_or_domain.rsplit('@', 1)[-1].lower().strip('.')
    now_m = time.monotonic()
    with _MX_CACHE_LOCK:
        hit = _MX_CACHE.get(domain)
        if hit and now_m - hit[0] < ttl:
            return hit[1]
    status = 'unknown'
    if HAS_DNSPYTHON:
        try:
            res = dns.resolver.Resolver()
            res.lifetime = 3.0
            res.timeout = 1.8
            answers = res.resolve(domain, 'MX')
            records = [str(r.exchange).strip() for r in answers]
            if any(x == '.' for x in records):
                status = 'null_mx'
            else:
                status = 'mx' if records else 'no_mx'
        except dns.resolver.NXDOMAIN:
            status = 'nxdomain'
        except dns.resolver.NoAnswer:
            status = 'no_mx'
        except dns.exception.DNSException:
            status = 'unknown'
    else:
        status = _DEFAULT_MX_STATUS('info@' + domain)
    with _MX_CACHE_LOCK:
        if len(_MX_CACHE) > 50000:
            _MX_CACHE.clear()
        _MX_CACHE[domain] = (now_m, status)
    return status


async def async_mx_status(email_or_domain: str, ttl: float = 14400.0) -> str:
    domain = email_or_domain.rsplit('@', 1)[-1].lower().strip('.')
    now_m = time.monotonic()
    with _MX_CACHE_LOCK:
        hit = _MX_CACHE.get(domain)
        if hit and now_m - hit[0] < ttl:
            return hit[1]
    status = 'unknown'
    if HAS_DNSPYTHON:
        try:
            res = dns.asyncresolver.Resolver()
            res.lifetime = 3.0
            res.timeout = 1.8
            answers = await res.resolve(domain, 'MX')
            records = [str(r.exchange).strip() for r in answers]
            if any(x == '.' for x in records):
                status = 'null_mx'
            else:
                status = 'mx' if records else 'no_mx'
        except dns.resolver.NXDOMAIN:
            status = 'nxdomain'
        except dns.resolver.NoAnswer:
            status = 'no_mx'
        except dns.exception.DNSException:
            status = 'unknown'
    else:
        loop = asyncio.get_running_loop()
        status = await loop.run_in_executor(None, _DEFAULT_MX_STATUS, 'info@' + domain)
    with _MX_CACHE_LOCK:
        if len(_MX_CACHE) > 50000:
            _MX_CACHE.clear()
        _MX_CACHE[domain] = (now_m, status)
    return status


def _rank_contact_links(links: list[list[str]], base_url: str, scope: str, visited: set[str], queued: set[str]) -> list[str]:
    scored: list[tuple[int, int, str]] = []
    for idx, (href, label) in enumerate(links):
        hay = unquote(href) + ' ' + label
        if not CONTACT.search(hay):
            continue
        try:
            v = normalize(urljoin(base_url, href))
        except ScanError:
            continue
        if domain_key(v) != scope or v in visited or v in queued or SKIP_EXT.search(urlsplit(v).path):
            continue
        prio = 0 if CONTACT_P0.search(hay) else (1 if CONTACT_P1.search(hay) else 2)
        scored.append((prio, idx, v))
    scored.sort(key=lambda x: (x[0], x[1]))
    seen: dict[str, None] = {}
    for _, _, v in scored:
        seen[v] = None
        if len(seen) >= 40:
            break
    return list(seen.keys())


def crawl(fetch: Any, url: str, pages: int = 6, stop: Callable[[], bool] = lambda: False) -> dict[str, Any]:
    root = normalize(url)
    scope = domain_key(root)
    visited: set[str] = set()
    todo: list[str] = [root]
    found: dict[str, dict[str, Any]] = {}
    phones: set[str] = set()
    errors: list[str] = []
    title = ''
    addr_meta: dict[str, str] = {}
    cache: dict[str, str] = {}
    successes = 0
    use_fast_mx = mx_status is _DEFAULT_MX_STATUS

    while todo and len(visited) < pages:
        if stop():
            raise ScanError('Durduruldu', True)
        u = todo.pop(0)
        if u in visited:
            continue
        visited.add(u)
        try:
            r = fetch.get(u, scope)
        except ScanError as e:
            if not successes:
                raise
            errors.append(str(e))
            continue
        successes += 1
        p = Page(r.text)
        if not title:
            title = ' '.join(p.title).strip()[:200]
        for k, val in p.addr_info.items():
            if val and not addr_meta.get(k):
                addr_meta[k] = val
        phones.update(p.phones())
        for email in p.emails(scope):
            if email not in found:
                d = email.rsplit('@', 1)[1]
                if d not in cache:
                    cache[d] = fast_mx_status(email) if use_fast_mx else mx_status(email)
                found[email] = {
                    'email': email,
                    'source': r.url,
                    'mx': cache[d],
                    'same_domain': d == scope or d.endswith('.' + scope),
                    'seen': now(),
                }
        ranked = _rank_contact_links(p.links, r.url, scope, visited, set(todo))
        todo.extend(ranked)
        todo = todo[:40]
    return {
        'title': title,
        'contacts': list(found.values()),
        'phones': sorted(phones),
        'pages': successes,
        'warnings': errors,
        'meta': addr_meta,
    }


async def async_crawl(
    session: AsyncCrawlSession,
    url: str,
    pages: int = 6,
    stop: Callable[[], bool] = lambda: False,
) -> dict[str, Any]:
    root = normalize(url)
    scope = domain_key(root)
    visited: set[str] = {root}
    found: dict[str, dict[str, Any]] = {}
    phones: set[str] = set()
    errors: list[str] = []
    addr_meta: dict[str, str] = {}
    mx_local: dict[str, str] = {}

    if stop():
        raise ScanError('Durduruldu', True)
    r0 = await session.get(root, scope)
    successes = 1
    p0 = Page(r0.text)
    title = ' '.join(p0.title).strip()[:200]
    addr_meta.update(p0.addr_info)
    phones.update(p0.phones())

    async def record_emails(emails: list[str], source_url: str) -> None:
        for email in emails:
            if email not in found:
                d = email.rsplit('@', 1)[1]
                if d not in mx_local:
                    mx_local[d] = await async_mx_status(d)
                found[email] = {
                    'email': email,
                    'source': source_url,
                    'mx': mx_local[d],
                    'same_domain': d == scope or d.endswith('.' + scope),
                    'seen': now(),
                }

    await record_emails(p0.emails(scope), r0.url)
    todo = _rank_contact_links(p0.links, r0.url, scope, visited, set())

    # Smart fast-path: if homepage already yielded same-domain email + phone, inspect at most 2 top contact pages.
    has_strong = any(c['same_domain'] for c in found.values()) and bool(phones)
    target_pages = min(pages, 3) if has_strong else pages

    while todo and len(visited) < target_pages:
        if stop():
            raise ScanError('Durduruldu', True)
        # Fetch up to 2 contact subpages concurrently over HTTP/2 stream multiplexing.
        batch: list[str] = []
        while todo and len(batch) < 2 and len(visited) + len(batch) <= target_pages:
            cand = todo.pop(0)
            if cand not in visited:
                visited.add(cand)
                batch.append(cand)
        if not batch:
            break
        results = await asyncio.gather(*(session.get(u, scope) for u in batch), return_exceptions=True)
        for res in results:
            if isinstance(res, ScanError):
                errors.append(str(res))
                continue
            if isinstance(res, Exception):
                errors.append(type(res).__name__)
                continue
            successes += 1
            px = Page(res.text)
            if not title:
                title = ' '.join(px.title).strip()[:200]
            for k, val in px.addr_info.items():
                if val and not addr_meta.get(k):
                    addr_meta[k] = val
            phones.update(px.phones())
            await record_emails(px.emails(scope), res.url)
            more = _rank_contact_links(px.links, res.url, scope, visited, set(todo))
            todo.extend(more)
            todo = todo[:40]

    return {
        'title': title,
        'contacts': list(found.values()),
        'phones': sorted(phones),
        'pages': successes,
        'warnings': errors,
        'meta': addr_meta,
    }


def discover(fetch: Any, url: str) -> list[dict[str, str]]:
    url = normalize(url)
    r = fetch.get(url)
    p = Page(r.text)
    seen: dict[str, dict[str, str]] = {}
    for href, label in p.links:
        try:
            u = normalize(urljoin(r.url, href))
        except ScanError:
            continue
        key = domain_key(u)
        if key == domain_key(r.url) or key in seen:
            continue
        if SKIP_EXT.search(urlsplit(u).path):
            continue
        seen[key] = {
            'url': urlunsplit((urlsplit(u).scheme, host_of(u), '/', '', '')),
            'label': ' '.join(label.split())[:160],
            'source': r.url,
        }
        if len(seen) >= 500:
            break
    return list(seen.values())
